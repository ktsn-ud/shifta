import {
  executeWithSyncRetry,
  extractGoogleErrorCode,
  extractGoogleErrorMessages,
  extractGoogleErrorReasons,
  extractGoogleErrorStatus,
  isGoogleRateLimitError,
  isRetryableGoogleSyncError,
  RATE_LIMIT_RETRY_DELAYS_MS,
  resolveGoogleSyncError,
  SYNC_RETRY_DELAYS_MS,
} from "@/lib/google-calendar/sync-error-policy";
import {
  GoogleCalendarSyncError,
  GOOGLE_SYNC_ERROR_CODES,
} from "@/lib/google-calendar/syncErrors";

function googleError(message: string, details: Record<string, unknown>): Error {
  return Object.assign(new Error(message), details);
}

describe("Google Calendar sync error policy", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("response/cause を含む Google API エラーの status・reason・message・code を正規化する", () => {
    const error = googleError("Top-level message", {
      status: 503,
      code: "ETIMEDOUT",
      response: {
        status: 429,
        data: {
          error: {
            message: "Response message",
            errors: [{ reason: "rateLimitExceeded" }, { reason: 42 }],
          },
        },
      },
      cause: {
        message: "Cause message",
        errors: [{ reason: "quotaExceeded" }, null],
      },
    });

    expect(extractGoogleErrorStatus(error)).toBe(503);
    expect(extractGoogleErrorReasons(error)).toEqual([
      "ratelimitexceeded",
      "quotaexceeded",
    ]);
    expect(extractGoogleErrorMessages(error)).toEqual([
      "top-level message",
      "response message",
      "cause message",
    ]);
    expect(extractGoogleErrorCode(error)).toBe("ETIMEDOUT");
    expect(extractGoogleErrorStatus({ status: 500 })).toBeNull();
    expect(extractGoogleErrorReasons("failed")).toEqual([]);
    expect(extractGoogleErrorMessages(null)).toEqual([]);
    expect(extractGoogleErrorCode(undefined)).toBe("");
  });

  it("response.status と numeric code も status として扱う", () => {
    expect(
      extractGoogleErrorStatus(
        googleError("upstream", { response: { status: 503 } }),
      ),
    ).toBe(503);
    expect(
      extractGoogleErrorStatus(googleError("missing", { code: "404" })),
    ).toBe(404);
  });

  it.each([
    ["rateLimitExceeded", "response"],
    ["userRateLimitExceeded", "cause"],
    ["quotaExceeded", "response"],
  ] as const)(
    "%s の %s reason をレート制限として分類する",
    (reason, source) => {
      const error =
        source === "response"
          ? googleError("Google request failed", {
              response: { data: { error: { errors: [{ reason }] } } },
            })
          : googleError("Google request failed", {
              cause: { errors: [{ reason }] },
            });

      expect(isGoogleRateLimitError(error)).toBe(true);
      expect(isRetryableGoogleSyncError(error)).toBe(true);
    },
  );

  it.each([
    [401, false],
    [403, false],
    [404, false],
    [408, true],
    [409, true],
    [429, true],
    [500, true],
    [503, true],
  ])("status %i の再試行可否を判断する", (status, expected) => {
    expect(
      isRetryableGoogleSyncError(
        googleError("Google request failed", { status }),
      ),
    ).toBe(expected);
  });

  it("network timeout と既知の同期エラーを区別する", () => {
    expect(
      isRetryableGoogleSyncError(
        googleError("socket closed", { code: "ECONNRESET" }),
      ),
    ).toBe(true);
    expect(isRetryableGoogleSyncError(new Error("request timeout"))).toBe(true);
    expect(
      isRetryableGoogleSyncError(
        new GoogleCalendarSyncError(
          GOOGLE_SYNC_ERROR_CODES.CALENDAR_NOT_FOUND,
          "calendar missing",
        ),
      ),
    ).toBe(false);
  });

  it.each([
    [
      new GoogleCalendarSyncError(
        GOOGLE_SYNC_ERROR_CODES.CALENDAR_NOT_FOUND,
        "calendar missing",
      ),
      {
        message: "calendar missing",
        code: GOOGLE_SYNC_ERROR_CODES.CALENDAR_NOT_FOUND,
        requiresCalendarSetup: true,
        requiresSignOut: false,
      },
    ],
    [
      new GoogleCalendarSyncError(
        GOOGLE_SYNC_ERROR_CODES.TOKEN_EXPIRED,
        "token expired",
      ),
      {
        message: "token expired",
        code: GOOGLE_SYNC_ERROR_CODES.TOKEN_EXPIRED,
        requiresCalendarSetup: false,
        requiresSignOut: true,
      },
    ],
    [
      googleError("unauthorized", { status: 401 }),
      {
        message: "Google認証に失敗しました。再ログインしてください",
        code: GOOGLE_SYNC_ERROR_CODES.TOKEN_EXPIRED,
        requiresCalendarSetup: false,
        requiresSignOut: true,
      },
    ],
    [
      googleError("forbidden", { status: 403 }),
      {
        message: "Google Calendar へのアクセス権限が不足しています",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      googleError("missing", { status: 404 }),
      {
        message: "同期先のGoogle Calendarイベントが見つかりません",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      googleError("conflict", { status: 409 }),
      {
        message: "Google Calendar 上で競合が発生しました。再試行してください",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      googleError("request timeout", { status: 408 }),
      {
        message: "Google Calendar との通信がタイムアウトしました",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      googleError("rate limited", { status: 429 }),
      {
        message:
          "Google Calendar の利用上限に達しました。時間を置いて再試行してください",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      googleError("upstream", { status: 503 }),
      {
        message: "Google Calendar 側で一時的なエラーが発生しました",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      googleError("request timeout", { code: "ETIMEDOUT" }),
      {
        message: "Google Calendar との通信がタイムアウトしました",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
    [
      new Error("unknown"),
      {
        message: "Google Calendar との同期に失敗しました",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      },
    ],
  ])("ユーザー向け同期エラーを解決する", (error, expected) => {
    expect(resolveGoogleSyncError(error)).toEqual(expected);
  });

  it("レート制限は status にかかわらず上限メッセージを優先する", () => {
    expect(
      resolveGoogleSyncError(
        googleError("quota exceeded", {
          status: 403,
          response: {
            data: { error: { errors: [{ reason: "quotaExceeded" }] } },
          },
        }),
      ),
    ).toEqual({
      message:
        "Google Calendar の利用上限に達しました。時間を置いて再試行してください",
      code: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });
  });

  it("通常の一時エラーを定義済みの delay と callback context で最大 2 回再試行する", async () => {
    jest.useFakeTimers();
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(googleError("upstream", { status: 503 }))
      .mockRejectedValueOnce(googleError("upstream", { status: 503 }))
      .mockResolvedValue("event-1");
    const onRetryScheduled = jest.fn();

    const result = executeWithSyncRetry(operation, {
      action: "update",
      userId: "user-1",
      shiftId: "shift-1",
      onRetryScheduled,
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(onRetryScheduled).toHaveBeenNthCalledWith(1, {
      action: "update",
      userId: "user-1",
      shiftId: "shift-1",
      attempt: 1,
      nextDelayMs: SYNC_RETRY_DELAYS_MS[0],
    });

    await jest.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
    expect(onRetryScheduled).toHaveBeenNthCalledWith(2, {
      action: "update",
      userId: "user-1",
      shiftId: "shift-1",
      attempt: 2,
      nextDelayMs: SYNC_RETRY_DELAYS_MS[1],
    });

    await jest.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[1]);
    await expect(result).resolves.toBe("event-1");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetryScheduled).toHaveBeenCalledTimes(2);
  });

  it("レート制限は専用の delay を使い、retry callback に上流の token/config を渡さない", async () => {
    jest.useFakeTimers();
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(
        googleError("rate limited", {
          response: {
            data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
            config: { headers: { Authorization: "Bearer raw-token" } },
          },
        }),
      )
      .mockRejectedValueOnce(googleError("rate limited", { status: 429 }))
      .mockResolvedValue("event-1");
    const onRetryScheduled = jest.fn();

    const result = executeWithSyncRetry(operation, {
      action: "create",
      userId: "user-1",
      shiftId: "shift-1",
      onRetryScheduled,
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(onRetryScheduled).toHaveBeenNthCalledWith(1, {
      action: "create",
      userId: "user-1",
      shiftId: "shift-1",
      attempt: 1,
      nextDelayMs: RATE_LIMIT_RETRY_DELAYS_MS[0],
    });

    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAYS_MS[0]);
    expect(onRetryScheduled).toHaveBeenNthCalledWith(2, {
      action: "create",
      userId: "user-1",
      shiftId: "shift-1",
      attempt: 2,
      nextDelayMs: RATE_LIMIT_RETRY_DELAYS_MS[1],
    });

    await jest.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAYS_MS[1]);
    await expect(result).resolves.toBe("event-1");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("再試行上限の後は最後のエラーを返す", async () => {
    jest.useFakeTimers();
    const error = googleError("upstream", { status: 503 });
    const operation = jest.fn<Promise<never>, []>().mockRejectedValue(error);
    const onRetryScheduled = jest.fn();

    const result = executeWithSyncRetry(operation, {
      action: "delete",
      userId: "user-1",
      shiftId: "shift-1",
      onRetryScheduled,
    });
    const rejection = expect(result).rejects.toBe(error);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
    await jest.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[1]);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetryScheduled).toHaveBeenCalledTimes(2);
  });
});

import { requireCurrentUser } from "@/lib/api/current-user";
import { GoogleCalendarAuthError } from "@/lib/google-calendar/auth";
import {
  classifyGoogleCalendarError,
  extractGoogleCalendarErrorStatus,
  getCalendarEvents,
  getCalendarEventsCacheKey,
  getStaleCalendarEvents,
  normalizeRequestedCalendarIds,
  parseCalendarEventsMonth,
} from "@/lib/google-calendar/calendar-events";

const connectionMock = jest.fn<Promise<void>, []>();
const afterCallbacks: Array<() => void | Promise<void>> = [];

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      body: unknown,
      init?: {
        status?: number;
        headers?: Record<string, string>;
      },
    ) => {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );

      return {
        status: init?.status ?? 200,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
        json: async () => body,
      };
    },
  },
  after: (callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  },
  connection: () => connectionMock(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/google-calendar/auth", () => ({
  GoogleCalendarAuthError: class GoogleCalendarAuthError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock("@/lib/google-calendar/calendar-events", () => ({
  parseCalendarEventsMonth: jest.fn(),
  normalizeRequestedCalendarIds: jest.fn(),
  getCalendarEventsCacheKey: jest.fn(),
  getCalendarEvents: jest.fn(),
  getStaleCalendarEvents: jest.fn(),
  extractGoogleCalendarErrorStatus: jest.fn(),
  classifyGoogleCalendarError: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const parseCalendarEventsMonthMock = jest.mocked(parseCalendarEventsMonth);
const normalizeRequestedCalendarIdsMock = jest.mocked(
  normalizeRequestedCalendarIds,
);
const getCalendarEventsCacheKeyMock = jest.mocked(getCalendarEventsCacheKey);
const getCalendarEventsMock = jest.mocked(getCalendarEvents);
const getStaleCalendarEventsMock = jest.mocked(getStaleCalendarEvents);
const extractGoogleCalendarErrorStatusMock = jest.mocked(
  extractGoogleCalendarErrorStatus,
);
const classifyGoogleCalendarErrorMock = jest.mocked(
  classifyGoogleCalendarError,
);

const range = {
  month: "2026-05",
  startDateKey: "2026-05-01",
  endDateKeyExclusive: "2026-06-01",
  timeMin: "2026-05-01T00:00:00+09:00",
  timeMax: "2026-06-01T00:00:00+09:00",
};
const responseData = {
  month: "2026-05",
  calendars: [],
  selectedCalendarIds: [],
  dates: [],
};

function createSensitiveGoogleApiError(status: number, reasons: string[] = []) {
  return Object.assign(new Error("raw upstream error: do not log"), {
    status,
    code: "UPSTREAM_FAILURE",
    config: {
      headers: { Authorization: "Bearer sensitive-access-token" },
    },
    response: {
      status,
      data: {
        accessToken: "sensitive-response-token",
        events: [{ summary: "private calendar event" }],
        error: { errors: reasons.map((reason) => ({ reason })) },
      },
    },
  });
}

const safeGoogleErrorLog = (status: number) => ({
  name: "GoogleCalendarRequestError",
  status,
  code: "UPSTREAM_FAILURE",
  message: "Google Calendar API request failed",
});

function buildRequest(
  method: "GET" | "POST",
  {
    url = "http://localhost/api/calendar/events?month=2026-05&calendarId=work&calendarId=personal",
    origin = "http://localhost",
  }: { url?: string; origin?: string | null } = {},
): Request {
  return {
    method,
    url,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? (origin ?? null) : null,
    },
  } as Request;
}

function createUnauthorizedResponse(): Response {
  return {
    status: 401,
    headers: { get: () => null },
    json: async () => ({ error: "認証が必要です" }),
  } as unknown as Response;
}

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0, afterCallbacks.length);
  for (const callback of callbacks) await callback();
}

describe("POST /api/calendar/events", () => {
  let POST: typeof import("@/app/api/calendar/events/route").POST;
  let GET: typeof import("@/app/api/calendar/events/route").GET;

  beforeAll(async () => {
    ({ POST, GET } = await import("@/app/api/calendar/events/route"));
  });

  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
    afterCallbacks.length = 0;
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    parseCalendarEventsMonthMock.mockReturnValue(range);
    normalizeRequestedCalendarIdsMock.mockReturnValue(["personal", "work"]);
    getCalendarEventsCacheKeyMock.mockReturnValue("calendar-events-cache-key");
    getCalendarEventsMock.mockResolvedValue({
      data: responseData,
      cacheStatus: "live",
      cacheKey: "calendar-events-cache-key",
      writeCacheAfterResponse: jest.fn(),
    });
    extractGoogleCalendarErrorStatusMock.mockImplementation((error) =>
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : null,
    );
    classifyGoogleCalendarErrorMock.mockReturnValue("retryable");
  });

  it("CSRF検証に失敗したPOSTを認証・サービス呼び出し前に拒否する", async () => {
    const response = await POST(
      buildRequest("POST", { origin: "https://attacker.example" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "不正なオリジンからのリクエストです",
    });
    expect(connectionMock).not.toHaveBeenCalled();
    expect(requireCurrentUserMock).not.toHaveBeenCalled();
    expect(getCalendarEventsMock).not.toHaveBeenCalled();
  });

  it("未認証時はcurrent userのresponseをそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const response = await POST(buildRequest("POST"));

    expect(response).toBe(unauthorizedResponse);
    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(getCalendarEventsMock).not.toHaveBeenCalled();
  });

  it("有効なリクエストをサービスへ渡し、キャッシュ書き込みをafterに登録する", async () => {
    const writeCacheAfterResponse = jest.fn();
    getCalendarEventsMock.mockResolvedValue({
      data: responseData,
      cacheStatus: "live",
      cacheKey: "calendar-events-cache-key",
      writeCacheAfterResponse,
    });

    const response = await POST(buildRequest("POST"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual({
      data: responseData,
      meta: { cacheStatus: "live" },
    });
    expect(normalizeRequestedCalendarIdsMock).toHaveBeenCalledWith([
      "work",
      "personal",
    ]);
    expect(getCalendarEventsCacheKeyMock).toHaveBeenCalledWith(
      "user-1",
      "2026-05",
      ["personal", "work"],
    );
    expect(getCalendarEventsMock).toHaveBeenCalledWith({
      userId: "user-1",
      range,
      requestedCalendarIds: ["personal", "work"],
    });
    expect(writeCacheAfterResponse).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await flushAfterCallbacks();

    expect(writeCacheAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("不正なmonthではGoogle Calendarへ問い合わせない", async () => {
    parseCalendarEventsMonthMock.mockReturnValue(null);

    const response = await POST(
      buildRequest("POST", {
        url: "http://localhost/api/calendar/events?month=2026-5",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "month は YYYY-MM 形式で指定してください",
    });
    expect(getCalendarEventsMock).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("読み取り権限不足を403と再同意フラグへ変換する", async () => {
    getCalendarEventsMock.mockRejectedValue(
      new GoogleCalendarAuthError("READ_SCOPE_MISSING", "再同意が必要です"),
    );

    const response = await POST(buildRequest("POST"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "再同意が必要です",
      details: {
        code: "READ_SCOPE_MISSING",
        requiresReconsent: true,
      },
    });
  });

  it("期限切れトークンを401、no-store、サインアウト要求へ変換する", async () => {
    getCalendarEventsMock.mockRejectedValue(
      new GoogleCalendarAuthError("TOKEN_EXPIRED", "トークンの期限切れです"),
    );

    const response = await POST(buildRequest("POST"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual({
      error: "トークンの期限切れです",
      details: {
        code: "TOKEN_EXPIRED",
        requiresSignOut: true,
      },
    });
  });

  it("上流401ではstaleを参照せずTOKEN_EXPIREDのサインアウト要求を返す", async () => {
    getCalendarEventsMock.mockRejectedValue(createSensitiveGoogleApiError(401));
    getStaleCalendarEventsMock.mockReturnValue(responseData);

    const response = await POST(buildRequest("POST"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Googleトークンの有効期限が切れています。再ログインしてください",
      details: {
        code: "TOKEN_EXPIRED",
        requiresSignOut: true,
      },
    });
    expect(getStaleCalendarEventsMock).not.toHaveBeenCalled();
  });

  it.each(["insufficientPermissions", "insufficientAuthenticationScopes"])(
    "%s 理由の上流403ではstaleを参照せずREAD_SCOPE_MISSINGの再同意要求を返す",
    async (reason) => {
      getCalendarEventsMock.mockRejectedValue(
        createSensitiveGoogleApiError(403, [reason]),
      );
      getStaleCalendarEventsMock.mockReturnValue(responseData);
      classifyGoogleCalendarErrorMock.mockReturnValue("oauthScopeMissing");

      const response = await POST(buildRequest("POST"));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error:
          "全カレンダー予定表示に必要なGoogle権限が不足しています。再ログインして再同意してください",
        details: {
          code: "READ_SCOPE_MISSING",
          requiresReconsent: true,
        },
      });
      expect(getStaleCalendarEventsMock).not.toHaveBeenCalled();
      expect(classifyGoogleCalendarErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        403,
      );
    },
  );

  it.each(["quotaExceeded", "userRateLimitExceeded"])(
    "%s 理由の上流403ではstaleデータを返す",
    async (reason) => {
      getCalendarEventsMock.mockRejectedValue(
        createSensitiveGoogleApiError(403, [reason]),
      );
      getStaleCalendarEventsMock.mockReturnValue(responseData);
      classifyGoogleCalendarErrorMock.mockReturnValue("retryable");

      const response = await POST(buildRequest("POST"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: responseData,
        meta: {
          cacheStatus: "stale",
          warning:
            "Google Calendar の最新予定を取得できなかったため、直近の取得結果を表示しています。",
        },
      });
      expect(getStaleCalendarEventsMock).toHaveBeenCalledWith(
        "calendar-events-cache-key",
      );
      expect(classifyGoogleCalendarErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        403,
      );
    },
  );

  it.each(["forbidden", "acl", undefined])(
    "%s 理由の上流403ではstaleを返さずgeneric 502にする",
    async (reason) => {
      getCalendarEventsMock.mockRejectedValue(
        createSensitiveGoogleApiError(403, reason ? [reason] : []),
      );
      getStaleCalendarEventsMock.mockReturnValue(responseData);
      classifyGoogleCalendarErrorMock.mockReturnValue("accessDenied");
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const response = await POST(buildRequest("POST"));

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({
          error:
            "Google Calendar の予定取得に失敗しました。時間を置いて再度お試しください",
        });
        expect(getStaleCalendarEventsMock).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  it.each([408, 429, 500])("上流%dではstaleデータを返す", async (status) => {
    getCalendarEventsMock.mockRejectedValue(
      createSensitiveGoogleApiError(status),
    );
    getStaleCalendarEventsMock.mockReturnValue(responseData);

    const response = await POST(buildRequest("POST"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: responseData,
      meta: {
        cacheStatus: "stale",
        warning:
          "Google Calendar の最新予定を取得できなかったため、直近の取得結果を表示しています。",
      },
    });
    expect(getStaleCalendarEventsMock).toHaveBeenCalledWith(
      "calendar-events-cache-key",
    );
  });

  it("stale fallbackのログは許可された要約だけを含む", async () => {
    const error = createSensitiveGoogleApiError(503);
    getCalendarEventsMock.mockRejectedValue(error);
    getStaleCalendarEventsMock.mockReturnValue(responseData);
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    try {
      const response = await POST(buildRequest("POST"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: responseData,
        meta: {
          cacheStatus: "stale",
          warning:
            "Google Calendar の最新予定を取得できなかったため、直近の取得結果を表示しています。",
        },
      });
      expect(getStaleCalendarEventsMock).toHaveBeenCalledWith(
        "calendar-events-cache-key",
      );
      expect(consoleWarn).toHaveBeenCalledWith(
        "POST /api/calendar/events fallback to stale cache",
        safeGoogleErrorLog(503),
      );
      const logArgument = consoleWarn.mock.calls[0]?.[1];
      expect(logArgument).toEqual(safeGoogleErrorLog(503));
      expect(logArgument).not.toHaveProperty("config");
      expect(logArgument).not.toHaveProperty("response");
      expect(logArgument).not.toHaveProperty("Authorization");
      expect(JSON.stringify(logArgument)).not.toContain("sensitive");
      expect(JSON.stringify(logArgument)).not.toContain("private calendar");
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("staleデータがないGoogle APIエラーを502へ変換する", async () => {
    const error = createSensitiveGoogleApiError(429);
    getCalendarEventsMock.mockRejectedValue(error);
    getStaleCalendarEventsMock.mockReturnValue(null);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await POST(buildRequest("POST"));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error:
          "Google Calendar の予定取得に失敗しました。時間を置いて再度お試しください",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "POST /api/calendar/events google api failed",
        safeGoogleErrorLog(429),
      );
      const logArgument = consoleError.mock.calls[0]?.[1];
      expect(logArgument).toEqual(safeGoogleErrorLog(429));
      expect(logArgument).not.toHaveProperty("config");
      expect(logArgument).not.toHaveProperty("response");
      expect(logArgument).not.toHaveProperty("Authorization");
      expect(JSON.stringify(logArgument)).not.toContain("sensitive");
      expect(JSON.stringify(logArgument)).not.toContain("private calendar");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("GETは405とAllow: POSTを返す", async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    await expect(response.json()).resolves.toEqual({
      error: "このエンドポイントはPOSTのみ対応しています",
    });
  });
});

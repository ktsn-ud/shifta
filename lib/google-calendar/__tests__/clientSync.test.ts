import { parseGoogleSyncStateFromPayload } from "@/lib/google-calendar/clientSync";

describe("parseGoogleSyncStateFromPayload", () => {
  it("sync.status が pending のとき pending=true を返す", () => {
    const result = parseGoogleSyncStateFromPayload(
      {
        sync: {
          status: "pending",
          ok: true,
          pending: true,
        },
      },
      "同期に失敗しました",
    );

    expect(result.pending).toBe(true);
    expect(result.failure).toBeNull();
  });

  it('旧syncStatus="pending" でも pending=true を返す', () => {
    const result = parseGoogleSyncStateFromPayload(
      {
        syncStatus: "pending",
      },
      "同期に失敗しました",
    );

    expect(result.pending).toBe(true);
    expect(result.failure).toBeNull();
  });

  it("sync.ok=false のとき failure を返す", () => {
    const result = parseGoogleSyncStateFromPayload(
      {
        sync: {
          status: "failed",
          ok: false,
          errorCode: "CALENDAR_NOT_FOUND",
          requiresCalendarSetup: true,
          requiresSignOut: false,
        },
      },
      "同期に失敗しました",
    );

    expect(result.pending).toBe(false);
    expect(result.failure).not.toBeNull();
    expect(result.failure?.errorCode).toBe("CALENDAR_NOT_FOUND");
    expect(result.failure?.requiresCalendarSetup).toBe(true);
    expect(result.failure?.requiresSignOut).toBe(false);
  });
});

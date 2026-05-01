import {
  classifyApiErrorKind,
  parseApiErrorMeta,
  resolveUserFacingErrorFromResponse,
} from "@/lib/user-facing-error";

describe("user-facing-error", () => {
  it("details.requiresSignOut を parse できる", async () => {
    const response = {
      status: 401,
      json: async () => ({
        details: {
          code: "TOKEN_EXPIRED",
          requiresSignOut: true,
        },
      }),
    } as Response;

    await expect(parseApiErrorMeta(response)).resolves.toEqual({
      status: 401,
      code: "TOKEN_EXPIRED",
      requiresCalendarSetup: false,
      requiresSignOut: true,
    });
  });

  it("requiresSignOut は calendarSetup より優先して authentication と判定する", () => {
    const kind = classifyApiErrorKind({
      status: 409,
      code: "CALENDAR_NOT_FOUND",
      requiresCalendarSetup: true,
      requiresSignOut: true,
    });

    expect(kind).toBe("authentication");
  });

  it("resolveUserFacingErrorFromResponse が requiresSignOut を返す", async () => {
    const response = {
      status: 401,
      json: async () => ({
        details: {
          code: "TOKEN_EXPIRED",
          requiresSignOut: true,
        },
      }),
    } as Response;

    const resolved = await resolveUserFacingErrorFromResponse(
      response,
      "Google Calendar との同期に失敗しました",
    );

    expect(resolved.kind).toBe("authentication");
    expect(resolved.code).toBe("TOKEN_EXPIRED");
    expect(resolved.requiresSignOut).toBe(true);
    expect(resolved.requiresCalendarSetup).toBe(false);
  });
});

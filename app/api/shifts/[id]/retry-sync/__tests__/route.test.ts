import { requireCurrentUser } from "@/lib/api/current-user";
import { retryShiftSync } from "@/lib/google-calendar/syncStatus";

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
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/google-calendar/syncStatus", () => ({
  retryShiftSync: jest.fn(),
}));

import { POST } from "@/app/api/shifts/[id]/retry-sync/route";

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const retryShiftSyncMock = jest.mocked(retryShiftSync);

function buildMutationRequest(url: string): Request {
  return {
    method: "POST",
    url,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "origin") {
          return "http://localhost";
        }
        return null;
      },
    },
  } as Request;
}

describe("POST /api/shifts/[id]/retry-sync", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("TOKEN_EXPIRED のとき 401 + no-store + requiresSignOut を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    retryShiftSyncMock.mockResolvedValue({
      ok: false,
      errorMessage: "Googleトークンの有効期限が切れています",
      errorCode: "TOKEN_EXPIRED",
      requiresCalendarSetup: false,
      requiresSignOut: true,
    });

    const request = buildMutationRequest(
      "http://localhost/api/shifts/shift-1/retry-sync",
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: "shift-1" }),
    });
    if (!response) {
      throw new Error("response is undefined");
    }
    const payload = (await response.json()) as {
      details?: Record<string, unknown>;
    };

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.details).toMatchObject({
      code: "TOKEN_EXPIRED",
      requiresSignOut: true,
      requiresCalendarSetup: false,
    });
  });

  it("CALENDAR_NOT_FOUND のとき 409 を返し no-store は付けない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    retryShiftSyncMock.mockResolvedValue({
      ok: false,
      errorMessage: "同期先のGoogle Calendarが見つかりません",
      errorCode: "CALENDAR_NOT_FOUND",
      requiresCalendarSetup: true,
      requiresSignOut: false,
    });

    const request = buildMutationRequest(
      "http://localhost/api/shifts/shift-2/retry-sync",
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: "shift-2" }),
    });
    if (!response) {
      throw new Error("response is undefined");
    }
    const payload = (await response.json()) as {
      details?: Record<string, unknown>;
    };

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(payload.details).toMatchObject({
      code: "CALENDAR_NOT_FOUND",
      requiresCalendarSetup: true,
      requiresSignOut: false,
    });
  });
});

import { auth } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/api/current-user";
import { verifyMutationRequest } from "@/lib/api/http";
import { getGoogleAuthBySession } from "@/lib/google-calendar/auth";
import { createShiftaCalendar } from "@/lib/google-calendar/client";
import { syncShiftsAfterBulkCreate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";

const afterCallbacks: Array<() => void | Promise<void>> = [];

jest.mock("next/server", () => ({
  after: (callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  },
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

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/http", () => ({
  verifyMutationRequest: jest.fn(),
  jsonError: (
    message: string,
    status = 400,
    details?: Record<string, unknown>,
    init?: { headers?: Record<string, string> },
  ) => ({
    status,
    headers: {
      get: (name: string) =>
        init?.headers?.[name] ?? init?.headers?.[name.toLowerCase()] ?? null,
    },
    json: async () => ({ error: message, ...(details ? { details } : {}) }),
  }),
}));

jest.mock("@/lib/google-calendar/auth", () => ({
  getGoogleAuthBySession: jest.fn(),
  GoogleCalendarAuthError: class GoogleCalendarAuthError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock("@/lib/google-calendar/client", () => ({
  createShiftaCalendar: jest.fn(),
}));

jest.mock("@/lib/google-calendar/syncStatus", () => ({
  syncShiftsAfterBulkCreate: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findFirst: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
  },
}));

import { POST } from "@/app/api/calendar/initialize/route";

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const verifyMutationRequestMock = jest.mocked(verifyMutationRequest);
const getGoogleAuthBySessionMock = jest.mocked(getGoogleAuthBySession);
const createShiftaCalendarMock = jest.mocked(createShiftaCalendar);
const syncShiftsAfterBulkCreateMock = jest.mocked(syncShiftsAfterBulkCreate);
const prismaAccountFindFirstMock = jest.mocked(prisma.account.findFirst);
const prismaUserUpdateMock = jest.mocked(prisma.user.update);
const prismaShiftFindManyMock = jest.mocked(prisma.shift.findMany);

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

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0, afterCallbacks.length);

  for (const callback of callbacks) {
    await callback();
  }
}

describe("POST /api/calendar/initialize", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    afterCallbacks.length = 0;
    verifyMutationRequestMock.mockReturnValue(null);
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        email: "user@example.com",
      },
    });
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        calendarId: null,
        googleTokenExpiresAt: null,
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getGoogleAuthBySessionMock.mockResolvedValue({
      oauth2Client: { credentials: {} },
    } as Awaited<ReturnType<typeof getGoogleAuthBySession>>);
    createShiftaCalendarMock.mockResolvedValue("calendar-1");
    prismaAccountFindFirstMock.mockResolvedValue({
      expires_at: 1_800_000_000,
    } as never);
    prismaUserUpdateMock.mockResolvedValue({ id: "user-1" } as never);
    prismaShiftFindManyMock.mockResolvedValue([
      { id: "shift-1" },
      { id: "shift-2" },
    ] as never);
    syncShiftsAfterBulkCreateMock.mockResolvedValue([
      { shiftId: "shift-1", ok: true },
      { shiftId: "shift-2", ok: false },
    ] as never);
  });

  it("カレンダー作成後は background sync を待たずに pending を返す", async () => {
    const response = await POST(
      buildMutationRequest("http://localhost/api/calendar/initialize"),
    );
    if (!response) {
      throw new Error("response is undefined");
    }
    const payload = (await response.json()) as {
      success: boolean;
      calendarId: string;
      sync: { status: string; pending: boolean };
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      calendarId: "calendar-1",
      sync: {
        status: "pending",
        pending: true,
      },
    });
    expect(syncShiftsAfterBulkCreateMock).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
  });

  it("after callback で既存シフト同期を実行する", async () => {
    await POST(
      buildMutationRequest("http://localhost/api/calendar/initialize"),
    );

    await flushAfterCallbacks();

    expect(prismaShiftFindManyMock).toHaveBeenCalledWith({
      where: {
        workplace: {
          userId: "user-1",
        },
      },
      select: {
        id: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    expect(syncShiftsAfterBulkCreateMock).toHaveBeenCalledWith(
      ["shift-1", "shift-2"],
      "user-1",
    );
  });
});

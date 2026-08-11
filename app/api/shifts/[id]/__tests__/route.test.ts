import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";

jest.mock("next/server", () => ({
  after: jest.fn(),
  connection: jest.fn(),
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/workplace", () => ({
  requireOwnedWorkplace: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    shift: {
      findFirst: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaShiftFindFirstMock = jest.mocked(prisma.shift.findFirst);

function createRequest(body: unknown): Request {
  return {
    method: "PUT",
    url: "http://localhost/api/shifts/shift-1",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

async function loadPut() {
  let routeModule: typeof import("@/app/api/shifts/[id]/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/[id]/route");
  });

  return routeModule!.PUT;
}

function createNormalPayload(breakMinutes: number) {
  return {
    workplaceId: "workplace-1",
    date: "2026-03-18",
    shiftType: "NORMAL",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes,
  };
}

describe("PUT /api/shifts/:id break validation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "GENERAL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
  });

  it.each([241, 30.5])(
    "rejects breakMinutes=%s before looking up the target shift",
    async (breakMinutes) => {
      const PUT = await loadPut();
      const response = await PUT(
        createRequest(createNormalPayload(breakMinutes)),
        { params: Promise.resolve({ id: "shift-1" }) },
      );
      if (!response) {
        throw new Error("response is undefined");
      }
      const payload = (await response.json()) as { error?: string };

      expect(response.status).toBe(400);
      expect(payload.error).toBe("入力値が不正です");
      expect(prismaShiftFindFirstMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["equal to gross working time", "09:00", "10:00", 60],
    ["overnight gross working time", "22:00", "01:00", 180],
  ])(
    "rejects a break %s without updating the target shift",
    async (_description, startTime, endTime, breakMinutes) => {
      prismaShiftFindFirstMock.mockResolvedValue({
        id: "shift-1",
        workplace: { id: "workplace-1" },
      } as never);
      const PUT = await loadPut();
      const response = await PUT(
        createRequest({
          ...createNormalPayload(breakMinutes),
          startTime,
          endTime,
        }),
        { params: Promise.resolve({ id: "shift-1" }) },
      );
      if (!response) {
        throw new Error("response is undefined");
      }
      const payload = (await response.json()) as { error?: string };

      expect(response.status).toBe(400);
      expect(payload.error).toBe(
        "休憩時間は勤務時間より短く入力してください。",
      );
      expect(prismaShiftFindFirstMock).toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a valid payload whose target shift does not exist", async () => {
    prismaShiftFindFirstMock.mockResolvedValue(null);
    const PUT = await loadPut();

    const response = await PUT(createRequest(createNormalPayload(0)), {
      params: Promise.resolve({ id: "missing-shift" }),
    });
    if (!response) {
      throw new Error("response is undefined");
    }
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(payload.error).toBe("シフトが見つかりません");
    expect(prismaShiftFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "missing-shift",
          workplace: { userId: "user-1" },
        },
      }),
    );
  });
});

import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
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

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateShiftDomainTags: jest.fn(),
}));

jest.mock("@/lib/google-calendar/syncStatus", () => ({
  syncShiftAfterUpdate: jest.fn(),
  syncShiftDeletion: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    shift: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    workplace: {
      findUnique: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const revalidateShiftDomainTagsMock = jest.mocked(revalidateShiftDomainTags);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaShiftFindFirstMock = jest.mocked(prisma.shift.findFirst);
const prismaShiftFindUniqueMock = jest.mocked(prisma.shift.findUnique);
const prismaShiftDeleteMock = jest.mocked(prisma.shift.delete);
const prismaWorkplaceFindUniqueMock = jest.mocked(prisma.workplace.findUnique);

function createRequest(body: unknown, method: "PUT" | "DELETE"): Request {
  return {
    method,
    url: "http://localhost/api/shifts/shift-1",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/shifts/[id]/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/[id]/route");
  });

  return routeModule!;
}

const context = { params: Promise.resolve({ id: "shift-1" }) };

describe("/api/shifts/:id cache revalidation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
  });

  it("passes both the old and new payment months after an update", async () => {
    prismaShiftFindFirstMock.mockResolvedValue({
      id: "shift-1",
      date: new Date("2026-03-15T00:00:00.000Z"),
      workplace: {
        id: "workplace-old",
        type: "GENERAL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
      lessonRange: null,
    } as never);
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: {
        id: "workplace-new",
        type: "GENERAL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        shift: {
          update: jest.fn().mockResolvedValue({ id: "shift-1" }),
          findUnique: jest.fn().mockResolvedValue({ id: "shift-1" }),
        },
        shiftLessonRange: { deleteMany: jest.fn() },
      } as never),
    );
    const { PUT } = await loadRouteModule();

    await PUT(
      createRequest(
        {
          workplaceId: "workplace-new",
          date: "2026-03-16",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "18:00",
        },
        "PUT",
      ),
      context,
    );

    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
      workplaceIds: ["workplace-old", "workplace-new"],
      paymentMonthKeys: ["2026-03", "2026-04"],
    });
    expect(prismaShiftFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          workplace: expect.objectContaining({
            select: expect.objectContaining({
              closingDayType: true,
              closingDay: true,
              payday: true,
            }),
          }),
        }),
      }),
    );
    expect(prismaWorkplaceFindUniqueMock).not.toHaveBeenCalled();
  });

  it("取得時の給与サイクル設定は公開 GET レスポンスに含めない", async () => {
    prismaShiftFindFirstMock.mockResolvedValue({
      id: "shift-1",
      date: new Date("2026-03-15T00:00:00.000Z"),
      workplace: {
        id: "workplace-old",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
      lessonRange: null,
    } as never);
    const { GET } = await loadRouteModule();

    const response = await GET({} as Request, context);
    if (!response) {
      throw new Error("GET /api/shifts/:id did not return a response");
    }
    const payload = (await response.json()) as {
      data: { workplace: Record<string, unknown> };
    };

    expect(payload.data.workplace).toEqual({
      id: "workplace-old",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
    });
    expect(payload.data.workplace).not.toHaveProperty("closingDayType");
    expect(payload.data.workplace).not.toHaveProperty("closingDay");
    expect(payload.data.workplace).not.toHaveProperty("payday");
  });

  it("passes the deleted shift's payment month to revalidation", async () => {
    prismaShiftFindUniqueMock.mockResolvedValue({
      id: "shift-1",
      date: new Date("2026-03-16T00:00:00.000Z"),
      googleEventId: null,
      workplace: {
        userId: "user-1",
        id: "workplace-1",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    } as never);
    prismaShiftDeleteMock.mockResolvedValue({ id: "shift-1" } as never);
    const { DELETE } = await loadRouteModule();

    await DELETE(createRequest({}, "DELETE"), context);

    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
      workplaceId: "workplace-1",
      paymentMonthKeys: ["2026-04"],
    });
  });
});

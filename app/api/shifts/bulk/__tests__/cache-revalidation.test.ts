import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
import { prisma } from "@/lib/prisma";

jest.mock("next/server", () => ({
  after: jest.fn(),
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
  syncShiftsAfterBulkCreate: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    shift: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const revalidateShiftDomainTagsMock = jest.mocked(revalidateShiftDomainTags);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaShiftFindManyMock = jest.mocked(prisma.shift.findMany);

function createRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/shifts/bulk",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

async function loadPost() {
  let routeModule: typeof import("@/app/api/shifts/bulk/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/bulk/route");
  });

  return routeModule!.POST;
}

describe("POST /api/shifts/bulk cache revalidation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: {
        id: "workplace-1",
        type: "GENERAL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        shift: { createMany: jest.fn() },
        shiftLessonRange: { createMany: jest.fn() },
      } as never),
    );
    prismaShiftFindManyMock.mockResolvedValue([]);
  });

  it("passes the deduplicated payment-month union for all created shifts", async () => {
    const POST = await loadPost();

    await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: [
          {
            date: "2026-03-15",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
          },
          {
            date: "2026-03-16",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
          },
          {
            date: "2026-03-18",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
          },
        ],
      }),
    );

    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
      workplaceId: "workplace-1",
      paymentMonthKeys: ["2026-03", "2026-04"],
    });
  });
});

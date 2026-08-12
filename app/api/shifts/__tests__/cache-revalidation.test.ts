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
  syncShiftAfterCreate: jest.fn(),
  syncShiftDeletion: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    shift: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const revalidateShiftDomainTagsMock = jest.mocked(revalidateShiftDomainTags);
const prismaShiftCreateMock = jest.mocked(prisma.shift.create);
const prismaShiftFindManyMock = jest.mocked(prisma.shift.findMany);
const prismaTransactionMock = jest.mocked(prisma.$transaction);

function createRequest(body: unknown, method: "POST" | "DELETE"): Request {
  return {
    method,
    url: "http://localhost/api/shifts",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

function createWorkplace(payday = 25) {
  return {
    id: "workplace-1",
    type: "GENERAL" as const,
    closingDayType: "DAY_OF_MONTH" as const,
    closingDay: 15,
    payday,
  };
}

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/shifts/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/route");
  });

  return routeModule!;
}

describe("/api/shifts cache revalidation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
  });

  it("passes the created shift's payment month to revalidation", async () => {
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: createWorkplace(),
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    prismaShiftCreateMock.mockResolvedValue({ id: "shift-1" } as never);
    const { POST } = await loadRouteModule();

    await POST(
      createRequest(
        {
          workplaceId: "workplace-1",
          date: "2026-03-16",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "18:00",
        },
        "POST",
      ),
    );

    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
      workplaceIds: ["workplace-1"],
      paymentMonthKeys: ["2026-04"],
    });
  });

  it("passes all affected payment months from a bulk delete", async () => {
    prismaShiftFindManyMock.mockResolvedValue([
      {
        id: "shift-1",
        date: new Date("2026-03-15T00:00:00.000Z"),
        googleEventId: null,
        workplace: { userId: "user-1", ...createWorkplace() },
      },
      {
        id: "shift-2",
        date: new Date("2026-03-16T00:00:00.000Z"),
        googleEventId: null,
        workplace: { userId: "user-1", ...createWorkplace() },
      },
    ] as never);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        shift: {
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      } as never),
    );
    const { DELETE } = await loadRouteModule();

    await DELETE(createRequest({ shiftIds: ["shift-1", "shift-2"] }, "DELETE"));

    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
      workplaceIds: ["workplace-1", "workplace-1"],
      paymentMonthKeys: ["2026-03", "2026-04"],
    });
  });

  it("uses broad revalidation when a created shift's payment month is unresolved", async () => {
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: createWorkplace(0),
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    prismaShiftCreateMock.mockResolvedValue({ id: "shift-1" } as never);
    const { POST } = await loadRouteModule();

    await POST(
      createRequest(
        {
          workplaceId: "workplace-1",
          date: "2026-03-16",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "18:00",
        },
        "POST",
      ),
    );

    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith({
      userId: "user-1",
      workplaceIds: ["workplace-1"],
    });
  });
});

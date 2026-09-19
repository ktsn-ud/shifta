import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";
import { createWorkplaceRouteAction } from "@/lib/actions/workplace-core/workplaces";

jest.mock("next/server", () => ({
  connection: jest.fn(),
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) =>
      new Response(JSON.stringify(body), {
        status: init?.status,
        headers: init?.headers,
      }),
  },
}));

jest.mock("next/navigation", () => ({
  unstable_rethrow: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const prismaTransactionMock = prisma.$transaction as unknown as jest.Mock;

function createRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/workplaces",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

function initialPayrollRule() {
  return {
    startDate: "2026-04-01",
    endDate: null,
    baseHourlyWage: 1200,
    administrativeHourlyWage: 1,
    holidayAllowanceHourly: 0,
    nightPremiumRate: 0.25,
    overtimePremiumRate: 0.25,
    dailyOvertimeThreshold: 8,
    holidayType: "NONE",
  };
}

describe("createWorkplaceRouteAction", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
  });

  it("GENERAL勤務先の初期給与ルールでは送信された事務時給をnullへ正規化する", async () => {
    const tx = {
      workplace: {
        create: jest.fn().mockResolvedValue({
          id: "workplace-1",
          type: "GENERAL",
        }),
      },
      payrollRule: {
        create: jest.fn().mockResolvedValue({
          id: "rule-1",
          workplaceId: "workplace-1",
          administrativeHourlyWage: null,
        }),
      },
    };
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback(tx as never),
    );

    const response = await createWorkplaceRouteAction(
      createRequest({
        name: "勤務先A",
        type: "GENERAL",
        color: "#3366FF",
        closingDayType: "END_OF_MONTH",
        closingDay: null,
        payday: 25,
        initialPayrollRule: initialPayrollRule(),
      }),
    );

    expect(response.status).toBe(201);
    expect(tx.payrollRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        administrativeHourlyWage: null,
      }),
    });
  });
});

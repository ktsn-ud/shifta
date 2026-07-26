import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import {
  getCachedPayrollRule,
  getCachedPayrollRulesForWorkplace,
  getCachedTimetableSetsForWorkplace,
} from "@/lib/cache/workplace-read-cache";

const connectionMock = jest.fn<Promise<void>, []>();

jest.mock("next/server", () => ({
  connection: () => connectionMock(),
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
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
          set: (name: string, value: string) =>
            headers.set(name.toLowerCase(), value),
        },
        json: async () => body,
      };
    },
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/workplace", () => ({
  requireOwnedWorkplace: jest.fn(),
}));

jest.mock("@/lib/cache/workplace-read-cache", () => ({
  getCachedPayrollRule: jest.fn(),
  getCachedPayrollRulesForWorkplace: jest.fn(),
  getCachedTimetableSetsForWorkplace: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const getCachedPayrollRuleMock = jest.mocked(getCachedPayrollRule);
const getCachedPayrollRulesForWorkplaceMock = jest.mocked(
  getCachedPayrollRulesForWorkplace,
);
const getCachedTimetableSetsForWorkplaceMock = jest.mocked(
  getCachedTimetableSetsForWorkplace,
);

function context(workplaceId = "workplace-1") {
  return { params: Promise.resolve({ workplaceId }) };
}

function detailContext(workplaceId = "workplace-1", id = "rule-1") {
  return { params: Promise.resolve({ workplaceId, id }) };
}

async function loadRoutes() {
  let payrollRule: typeof import("@/app/api/workplaces/[workplaceId]/payroll-rules/[id]/route");
  let payrollRules: typeof import("@/app/api/workplaces/[workplaceId]/payroll-rules/route");
  let timetables: typeof import("@/app/api/workplaces/[workplaceId]/timetables/route");

  await jest.isolateModulesAsync(async () => {
    payrollRule =
      await import("@/app/api/workplaces/[workplaceId]/payroll-rules/[id]/route");
    payrollRules =
      await import("@/app/api/workplaces/[workplaceId]/payroll-rules/route");
    timetables =
      await import("@/app/api/workplaces/[workplaceId]/timetables/route");
  });

  return {
    payrollRule: payrollRule!,
    payrollRules: payrollRules!,
    timetables: timetables!,
  };
}

describe("workplace read routes backed by cached DAL", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
  });

  it("給与ルール GET は所有確認後に cached DTO を private no-store で返す", async () => {
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "GENERAL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    getCachedPayrollRulesForWorkplaceMock.mockResolvedValue([
      {
        id: "rule-1",
        workplaceId: "workplace-1",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: null,
        baseHourlyWage: "1200",
        holidayAllowanceHourly: "0",
        nightPremiumRate: "0.25",
        overtimePremiumRate: "0.25",
        dailyOvertimeThreshold: "8",
        holidayType: "NONE",
      },
    ]);
    const { payrollRules } = await loadRoutes();

    const response = await payrollRules.GET({} as Request, context());

    expect(response).toBeDefined();
    expect(response!.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response!.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: "rule-1",
          baseHourlyWage: "1200",
          startDate: "2026-07-01T00:00:00.000Z",
        }),
      ],
    });
    expect(getCachedPayrollRulesForWorkplaceMock).toHaveBeenCalledWith(
      "user-1",
      "workplace-1",
    );
  });

  it("給与ルール詳細 GET は cached DTO を private no-store で返す", async () => {
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "GENERAL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    getCachedPayrollRuleMock.mockResolvedValue({
      id: "rule-1",
      workplaceId: "workplace-1",
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: null,
      baseHourlyWage: "1200",
      holidayAllowanceHourly: "0",
      nightPremiumRate: "0.25",
      overtimePremiumRate: "0.25",
      dailyOvertimeThreshold: "8",
      holidayType: "NONE",
    });
    const { payrollRule } = await loadRoutes();

    const response = await payrollRule.GET({} as Request, detailContext());

    expect(response).toBeDefined();
    expect(response!.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response!.json()).resolves.toEqual({
      data: {
        id: "rule-1",
        workplaceId: "workplace-1",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: null,
        baseHourlyWage: "1200",
        holidayAllowanceHourly: "0",
        nightPremiumRate: "0.25",
        overtimePremiumRate: "0.25",
        dailyOvertimeThreshold: "8",
        holidayType: "NONE",
      },
    });
    expect(getCachedPayrollRuleMock).toHaveBeenCalledWith(
      "user-1",
      "workplace-1",
      "rule-1",
    );
  });

  it("時間割 GET は所有確認後に cached DTO の items 形状を private no-store で返す", async () => {
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "CRAM_SCHOOL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    getCachedTimetableSetsForWorkplaceMock.mockResolvedValue([
      {
        id: "set-1",
        workplaceId: "workplace-1",
        name: "平日",
        sortOrder: 0,
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:00.000Z",
        timetables: [
          {
            id: "timetable-1",
            timetableSetId: "set-1",
            period: 1,
            startTime: "1970-01-01T09:30:00.000Z",
            endTime: "1970-01-01T10:45:00.000Z",
            startTimeLabel: "09:30",
            endTimeLabel: "10:45",
          },
        ],
      },
    ]);
    const { timetables } = await loadRoutes();

    const response = await timetables.GET({} as Request, context());

    expect(response).toBeDefined();
    expect(response!.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response!.json()).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: "set-1",
          items: [
            expect.objectContaining({
              startTimeLabel: "09:30",
              endTimeLabel: "10:45",
            }),
          ],
        }),
      ],
    });
    expect(getCachedTimetableSetsForWorkplaceMock).toHaveBeenCalledWith(
      "user-1",
      "workplace-1",
    );
  });
});

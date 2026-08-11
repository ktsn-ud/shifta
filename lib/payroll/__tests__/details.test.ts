import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
} from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PayrollSnapshot } from "@/lib/payroll/snapshot";
import { loadPayrollSnapshot } from "@/lib/payroll/snapshot";

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/lib/payroll/snapshot", () => {
  const actual = jest.requireActual("@/lib/payroll/snapshot");

  return {
    ...actual,
    loadPayrollSnapshot: jest.fn(),
  };
});

import {
  getPayrollDetailsWorkplaceYearlyForUser,
  summarizeWorkplacePayrollDetailsByPeriod,
} from "@/lib/payroll/details";

const loadPayrollSnapshotMock = jest.mocked(loadPayrollSnapshot);

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function createShift(
  overrides: Partial<Shift> = {},
  lessonRange: ShiftLessonRange | null = null,
): Shift & { lessonRange: ShiftLessonRange | null } {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: date("2026-04-20"),
    startTime: time("10:00"),
    endTime: time("18:00"),
    breakMinutes: 60,
    isConfirmed: false,
    shiftType: "NORMAL",
    comment: null,
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt: date("2026-04-20"),
    lessonRange,
    ...overrides,
  };
}

function createRule(overrides: Partial<PayrollRule> = {}): PayrollRule {
  return {
    id: "rule-1",
    workplaceId: "workplace-1",
    startDate: date("2026-01-01"),
    endDate: null,
    baseHourlyWage: new Prisma.Decimal(1100),
    holidayAllowanceHourly: new Prisma.Decimal(1500),
    nightPremiumRate: new Prisma.Decimal(0.25),
    overtimePremiumRate: new Prisma.Decimal(0.5),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "WEEKEND",
    ...overrides,
  };
}

describe("summarizeWorkplacePayrollDetailsByPeriod", () => {
  it("基本/休日手当/深夜の内訳と時間表示を算出できる", () => {
    const shifts = [
      createShift({
        id: "weekday-1",
        date: date("2026-04-20"),
        startTime: time("10:00"),
        endTime: time("18:00"),
        breakMinutes: 60,
      }),
      createShift({
        id: "holiday-1",
        date: date("2026-04-19"),
        startTime: time("09:00"),
        endTime: time("15:00"),
        breakMinutes: 0,
      }),
      createShift({
        id: "night-overtime-1",
        date: date("2026-04-21"),
        startTime: time("20:00"),
        endTime: time("06:00"),
        breakMinutes: 60,
      }),
      createShift({
        id: "outside-period",
        date: date("2026-05-01"),
        startTime: time("10:00"),
        endTime: time("12:00"),
        breakMinutes: 0,
      }),
    ];

    const result = summarizeWorkplacePayrollDetailsByPeriod({
      workplaceId: "workplace-1",
      startDate: date("2026-04-01"),
      endDate: date("2026-04-30"),
      shifts,
      payrollRules: [createRule()],
    });

    expect(result).toEqual({
      totalWorkHours: 22,
      baseHours: 15,
      holidayHours: 6,
      nightHours: 7,
      overtimeHours: 1,
      totalWage: 35125,
      baseWage: 16500,
      holidayWage: 9000,
      nightWage: 9625,
      workDuration: "22:00",
      baseDuration: "15:00",
      holidayDuration: "6:00",
      nightDuration: "7:00",
      overtimeDuration: "1:00",
      effectiveBaseHourlyWage: 1100,
      effectiveHolidayAllowanceHourly: 1500,
      effectiveNightHourlyWage: 1375,
      effectiveNightPremiumRate: 0.25,
    });
  });

  it("対象シフトが0件のときは0とnullで返す", () => {
    const result = summarizeWorkplacePayrollDetailsByPeriod({
      workplaceId: "workplace-1",
      startDate: date("2026-04-01"),
      endDate: date("2026-04-30"),
      shifts: [],
      payrollRules: [createRule()],
    });

    expect(result).toEqual({
      totalWorkHours: 0,
      baseHours: 0,
      holidayHours: 0,
      nightHours: 0,
      overtimeHours: 0,
      totalWage: 0,
      baseWage: 0,
      holidayWage: 0,
      nightWage: 0,
      workDuration: "0:00",
      baseDuration: "0:00",
      holidayDuration: "0:00",
      nightDuration: "0:00",
      overtimeDuration: "0:00",
      effectiveBaseHourlyWage: null,
      effectiveHolidayAllowanceHourly: null,
      effectiveNightHourlyWage: null,
      effectiveNightPremiumRate: null,
    });
  });
});

function createYearlyDetailsSnapshot(monthDates: Date[]): PayrollSnapshot {
  const monthKeys = monthDates.map(
    (monthDate) =>
      `${monthDate.getUTCFullYear()}-${String(
        monthDate.getUTCMonth() + 1,
      ).padStart(2, "0")}`,
  );
  const payrollRule = createRule({
    baseHourlyWage: new Prisma.Decimal(1000),
    holidayAllowanceHourly: new Prisma.Decimal(0),
    nightPremiumRate: new Prisma.Decimal(0),
    overtimePremiumRate: new Prisma.Decimal(0),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "NONE",
  });

  return {
    workplaces: [
      {
        id: "workplace-1",
        name: "勤務先A",
        color: "#3366FF",
        closingDayType: "END_OF_MONTH",
        closingDay: null,
        payday: 25,
      },
    ],
    workplaceIds: ["workplace-1"],
    monthKeys,
    periodByWorkplaceMonth: new Map(
      monthKeys.map((monthKey) => {
        const [year, month] = monthKey.split("-").map(Number);

        return [
          `workplace-1:${monthKey}`,
          {
            paymentDate: date(`${monthKey}-25`),
            periodStartDate: date(`${monthKey}-01`),
            periodEndDate: new Date(Date.UTC(year, month, 0)),
          },
        ];
      }),
    ),
    shiftsByWorkplace: new Map([
      [
        "workplace-1",
        [
          createShift({
            id: "january-shift",
            date: date("2026-01-15"),
            startTime: time("09:00"),
            endTime: time("12:00"),
            breakMinutes: 0,
          }),
          createShift({
            id: "february-shift",
            date: date("2026-02-12"),
            startTime: time("09:00"),
            endTime: time("14:00"),
            breakMinutes: 60,
          }),
        ],
      ],
    ]),
    rulesByWorkplace: new Map([["workplace-1", [payrollRule]]]),
    actualPayrollByWorkplaceMonth: new Map(
      monthKeys.map((monthKey) => [
        `workplace-1:${monthKey}`,
        {
          taxableAmount: 3000,
          nonTaxableAmount: 500,
          totalAmount: 3500,
          note: `${monthKey} 実給与`,
        },
      ]),
    ),
  };
}

describe("payroll details yearly service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    loadPayrollSnapshotMock.mockImplementation(async ({ monthDates }) =>
      createYearlyDetailsSnapshot(monthDates),
    );
  });

  it("年次詳細は月次・年合計とも実給与を優先しつつ概算の時間内訳を維持する", async () => {
    const result = await getPayrollDetailsWorkplaceYearlyForUser(
      "user-1",
      2026,
    );

    expect(result).toMatchObject({
      year: 2026,
      shiftCount: 2,
    });
    expect(result.workplaces).toHaveLength(1);

    const workplace = result.workplaces[0];
    expect(workplace.months[0]).toMatchObject({
      monthKey: "2026-01",
      totalWorkHours: 3,
      totalWage: 3000,
      displayValue: {
        estimatedAmount: 3000,
        actualAmount: {
          taxableAmount: 3000,
          nonTaxableAmount: 500,
          totalAmount: 3500,
        },
        displayAmount: 3500,
        differenceAmount: 500,
        isActualApplied: true,
      },
    });
    expect(workplace.months[1]).toMatchObject({
      monthKey: "2026-02",
      totalWorkHours: 4,
      totalWage: 4000,
      displayValue: {
        estimatedAmount: 4000,
        displayAmount: 3500,
        differenceAmount: -500,
        isActualApplied: true,
      },
    });
    expect(workplace.yearlyTotals).toMatchObject({
      totalWorkHours: 7,
      totalWage: 7000,
    });
    expect(workplace.yearlyDisplayValue).toEqual({
      estimatedAmount: 7000,
      actualAmount: {
        taxableAmount: 36000,
        nonTaxableAmount: 6000,
        totalAmount: 42000,
      },
      displayAmount: 42000,
      differenceAmount: 35000,
      isActualApplied: true,
    });
    expect(workplace.actualCoverage).toEqual({
      taxableAmount: 36000,
      nonTaxableAmount: 6000,
      totalAmount: 42000,
      registeredWorkplaceCount: 12,
      totalWorkplaceCount: 12,
      isPartial: false,
    });
  });
});

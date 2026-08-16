import type { Shift, ShiftLessonRange } from "@/lib/generated/prisma/client";
import type {
  PayrollSnapshot,
  PayrollSnapshotWorkplace,
} from "@/lib/payroll/snapshot";
import { loadPayrollSnapshot } from "@/lib/payroll/snapshot";
import { calculateShiftPayrollResult } from "@/lib/payroll/summarizeByPeriod";

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

jest.mock("@/lib/payroll/summarizeByPeriod", () => {
  const actual = jest.requireActual("@/lib/payroll/summarizeByPeriod");

  return {
    ...actual,
    calculateShiftPayrollResult: jest.fn(),
  };
});

import {
  getPayrollSummaryAmountForUser,
  getPayrollSummaryCoreForUser,
  getPayrollSummaryForUser,
  getPayrollSummaryYearContextForUser,
} from "@/lib/payroll/summary";

const loadPayrollSnapshotMock = jest.mocked(loadPayrollSnapshot);
const calculateShiftPayrollResultMock = jest.mocked(
  calculateShiftPayrollResult,
);

const workplaces: PayrollSnapshotWorkplace[] = [
  {
    id: "workplace-1",
    name: "勤務先A",
    color: "#3366FF",
    closingDayType: "END_OF_MONTH",
    closingDay: null,
    payday: 25,
  },
  {
    id: "workplace-2",
    name: "勤務先B",
    color: "#FF6633",
    closingDayType: "END_OF_MONTH",
    closingDay: null,
    payday: 25,
  },
];

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
    date: date("2026-01-15"),
    startTime: time("09:00"),
    endTime: time("10:00"),
    breakMinutes: 0,
    transportationAllowance: 0,
    isConfirmed: false,
    shiftType: "NORMAL",
    comment: null,
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt: date("2026-01-15"),
    lessonRange,
    ...overrides,
  };
}

function createMonthDates(year: number): Date[] {
  return Array.from(
    { length: 12 },
    (_, index) => new Date(Date.UTC(year, index, 1)),
  );
}

function createMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function createMonthDateFromKey(monthKey: string): Date {
  return new Date(`${monthKey}-01T00:00:00.000Z`);
}

function createMonthEndDate(monthKey: string): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0));
}

function createPayrollResult(totalWage: number, workHours: number) {
  return {
    totalWage,
    baseWage: totalWage,
    holidayWage: 0,
    overtimeWage: 0,
    nightWage: 0,
    workHours,
    baseHours: workHours,
    holidayHours: 0,
    overtimeHours: 0,
    nightHours: 0,
    dayWage: totalWage,
  };
}

function createSnapshot(monthDates: Date[]): PayrollSnapshot {
  const monthKeys = Array.from(
    new Set(
      monthDates.map(
        (monthDate) =>
          `${monthDate.getUTCFullYear()}-${String(
            monthDate.getUTCMonth() + 1,
          ).padStart(2, "0")}`,
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    workplaces,
    workplaceIds: workplaces.map((workplace) => workplace.id),
    monthKeys,
    periodByWorkplaceMonth: new Map(
      monthKeys.flatMap((monthKey) =>
        workplaces.map((workplace) => [
          `${workplace.id}:${monthKey}`,
          {
            paymentDate: new Date(`${monthKey}-25T00:00:00.000Z`),
            periodStartDate: createMonthDateFromKey(monthKey),
            periodEndDate: createMonthEndDate(monthKey),
          },
        ]),
      ),
    ),
    shiftsByWorkplace: new Map([
      [
        "workplace-1",
        [
          createShift({
            id: "shift-a-jan",
            workplaceId: "workplace-1",
            date: date("2026-01-15"),
            startTime: time("09:00"),
            endTime: time("14:00"),
            transportationAllowance: 400,
          }),
          createShift({
            id: "shift-a-feb",
            workplaceId: "workplace-1",
            date: date("2026-02-12"),
            startTime: time("10:00"),
            endTime: time("14:30"),
            transportationAllowance: 500,
          }),
        ],
      ],
      [
        "workplace-2",
        [
          createShift({
            id: "shift-b-jan",
            workplaceId: "workplace-2",
            date: date("2026-01-20"),
            startTime: time("18:00"),
            endTime: time("21:00"),
            transportationAllowance: 300,
          }),
          createShift({
            id: "shift-b-mar",
            workplaceId: "workplace-2",
            date: date("2026-03-08"),
            startTime: time("09:00"),
            endTime: time("15:15"),
            transportationAllowance: 600,
          }),
        ],
      ],
    ]),
    rulesByWorkplace: new Map() as PayrollSnapshot["rulesByWorkplace"],
    actualPayrollByWorkplaceMonth: new Map([
      [
        "workplace-1:2026-01",
        {
          taxableAmount: 4800,
          nonTaxableAmount: 200,
          totalAmount: 5000,
          note: "交通費込み",
        },
      ],
      [
        "workplace-2:2026-03",
        {
          taxableAmount: 7000,
          nonTaxableAmount: 300,
          totalAmount: 7300,
          note: "実給与",
        },
      ],
    ]),
  };
}

describe("payroll summary services", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    loadPayrollSnapshotMock.mockImplementation(async ({ monthDates }) =>
      createSnapshot(monthDates),
    );

    calculateShiftPayrollResultMock.mockImplementation((shift) => {
      switch (shift.id) {
        case "shift-a-jan":
          return createPayrollResult(5000, 5);
        case "shift-a-feb":
          return createPayrollResult(4500, 4.5);
        case "shift-b-jan":
          return createPayrollResult(3600, 3);
        case "shift-b-mar":
          return createPayrollResult(7500, 6.25);
        default:
          throw new Error(`unexpected shift: ${shift.id}`);
      }
    });
  });

  it("getPayrollSummaryForUser は12か月の年次表と勤務先別・年合計を返す", async () => {
    const summary = await getPayrollSummaryForUser("user-1", 2026);

    expect(loadPayrollSnapshotMock).toHaveBeenCalledWith({
      userId: "user-1",
      monthDates: createMonthDates(2026),
      includeActualPayroll: true,
    });
    expect(summary.year).toBe(2026);
    expect(summary.workplaces).toEqual([
      {
        workplaceId: "workplace-1",
        workplaceName: "勤務先A",
        workplaceColor: "#3366FF",
      },
      {
        workplaceId: "workplace-2",
        workplaceName: "勤務先B",
        workplaceColor: "#FF6633",
      },
    ]);
    expect(summary.months).toHaveLength(12);
    expect(summary.months.map((month) => month.monthKey)).toEqual(
      Array.from({ length: 12 }, (_, index) => createMonthKey(2026, index + 1)),
    );
    expect(summary.months[0]).toEqual({
      month: 1,
      monthKey: "2026-01",
      incomeByWorkplace: [
        {
          workplaceId: "workplace-1",
          taxableAmount: 4800,
          nonTaxableAmount: 200,
          totalAmount: 5000,
        },
        {
          workplaceId: "workplace-2",
          taxableAmount: 3600,
          nonTaxableAmount: 300,
          totalAmount: 3900,
        },
      ],
      hoursByWorkplace: [
        {
          workplaceId: "workplace-1",
          totalWorkHours: 5,
        },
        {
          workplaceId: "workplace-2",
          totalWorkHours: 3,
        },
      ],
      totals: {
        taxableAmount: 8400,
        nonTaxableAmount: 500,
        totalAmount: 8900,
        totalWorkHours: 8,
      },
    });
    expect(summary.months[1].totals).toEqual({
      taxableAmount: 4500,
      nonTaxableAmount: 500,
      totalAmount: 5000,
      totalWorkHours: 4.5,
    });
    expect(summary.months[3].totals).toEqual({
      taxableAmount: 0,
      nonTaxableAmount: 0,
      totalAmount: 0,
      totalWorkHours: 0,
    });
    expect(summary.yearlyTotals).toEqual({
      byWorkplace: [
        {
          workplaceId: "workplace-1",
          taxableAmount: 9300,
          nonTaxableAmount: 700,
          totalAmount: 10000,
          totalWorkHours: 9.5,
        },
        {
          workplaceId: "workplace-2",
          taxableAmount: 10600,
          nonTaxableAmount: 600,
          totalAmount: 11200,
          totalWorkHours: 9.25,
        },
      ],
      grandTotals: {
        taxableAmount: 19900,
        nonTaxableAmount: 1300,
        totalAmount: 21200,
        totalWorkHours: 18.75,
      },
    });
  });

  it("実給与がある月は所得に実績を使い、未登録月は課税のみ概算へフォールバックし、勤務時間はシフト実績を使う", async () => {
    const summary = await getPayrollSummaryForUser("user-1", 2026);

    expect(summary.months[2]).toEqual({
      month: 3,
      monthKey: "2026-03",
      incomeByWorkplace: [
        {
          workplaceId: "workplace-1",
          taxableAmount: 0,
          nonTaxableAmount: 0,
          totalAmount: 0,
        },
        {
          workplaceId: "workplace-2",
          taxableAmount: 7000,
          nonTaxableAmount: 300,
          totalAmount: 7300,
        },
      ],
      hoursByWorkplace: [
        {
          workplaceId: "workplace-1",
          totalWorkHours: 0,
        },
        {
          workplaceId: "workplace-2",
          totalWorkHours: 6.25,
        },
      ],
      totals: {
        taxableAmount: 7000,
        nonTaxableAmount: 300,
        totalAmount: 7300,
        totalWorkHours: 6.25,
      },
    });
    expect(summary.months[1].incomeByWorkplace).toEqual([
      {
        workplaceId: "workplace-1",
        taxableAmount: 4500,
        nonTaxableAmount: 500,
        totalAmount: 5000,
      },
      {
        workplaceId: "workplace-2",
        taxableAmount: 0,
        nonTaxableAmount: 0,
        totalAmount: 0,
      },
    ]);
  });

  it("getPayrollSummaryCoreForUser は対象月の実給与表示と勤務時間を返す", async () => {
    const summary = await getPayrollSummaryCoreForUser(
      "user-1",
      date("2026-03-01"),
    );

    expect(summary).toEqual(
      expect.objectContaining({
        month: "2026-03",
        totalWage: 7300,
        estimatedTotalWage: 8100,
        totalWorkHours: 6.25,
        confirmedShiftWage: 0,
      }),
    );
    expect(summary.actualCoverage).toEqual({
      registeredWorkplaceCount: 1,
      totalWorkplaceCount: 2,
      isPartial: true,
      taxableAmount: 7000,
      nonTaxableAmount: 300,
      totalAmount: 7300,
    });
  });

  it("getPayrollSummaryAmountForUser は対象月の表示支給額を返す", async () => {
    const summaryAmount = await getPayrollSummaryAmountForUser(
      "user-1",
      date("2026-01-01"),
    );

    expect(summaryAmount).toEqual({
      month: "2026-01",
      totalWage: 8900,
    });
  });

  it("getPayrollSummaryYearContextForUser は表示累計と概算累計を返す", async () => {
    const summaryYearContext = await getPayrollSummaryYearContextForUser(
      "user-1",
      date("2026-03-01"),
    );

    expect(summaryYearContext).toEqual({
      month: "2026-03",
      currentMonthCumulative: 21200,
      yearlyTotal: 21200,
      currentMonthActualCoverage: {
        registeredWorkplaceCount: 2,
        totalWorkplaceCount: 6,
        isPartial: true,
        taxableAmount: 19900,
        nonTaxableAmount: 1300,
        totalAmount: 21200,
      },
      yearlyActualCoverage: {
        registeredWorkplaceCount: 2,
        totalWorkplaceCount: 24,
        isPartial: true,
        taxableAmount: 19900,
        nonTaxableAmount: 1300,
        totalAmount: 21200,
      },
      estimatedCurrentMonthCumulative: 22400,
      estimatedYearlyTotal: 22400,
    });
  });
});

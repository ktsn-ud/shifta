import type { PayrollRule, Shift } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    workplace: {
      findMany: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
    payrollRule: {
      findMany: jest.fn(),
    },
    actualPayroll: {
      findMany: jest.fn(),
    },
  },
}));

import {
  getPayrollSummaryAmountForUser,
  getPayrollSummaryCoreForUser,
  getPayrollSummaryForUser,
  getPayrollSummaryYearContextForUser,
} from "@/lib/payroll/summary";

const prismaWorkplaceFindManyMock = jest.mocked(prisma.workplace.findMany);
const prismaShiftFindManyMock = jest.mocked(prisma.shift.findMany);
const prismaPayrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);
const prismaActualPayrollFindManyMock = jest.mocked(
  prisma.actualPayroll.findMany,
);

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function createShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: date("2026-01-10"),
    startTime: time("09:00"),
    endTime: time("10:00"),
    breakMinutes: 0,
    isConfirmed: false,
    shiftType: "NORMAL",
    comment: null,
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt: date("2026-01-10"),
    ...overrides,
  };
}

function createRule(overrides: Partial<PayrollRule> = {}): PayrollRule {
  return {
    id: "rule-1",
    workplaceId: "workplace-1",
    startDate: date("2026-01-01"),
    endDate: null,
    baseHourlyWage: new Prisma.Decimal(1000),
    holidayAllowanceHourly: new Prisma.Decimal(0),
    nightPremiumRate: new Prisma.Decimal(0),
    overtimePremiumRate: new Prisma.Decimal(0),
    dailyOvertimeThreshold: new Prisma.Decimal(8),
    holidayType: "NONE",
    ...overrides,
  };
}

describe("getPayrollSummaryForUser", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    prismaWorkplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-1",
        name: "勤務先A",
        color: "#111111",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    ] as never);

    prismaShiftFindManyMock.mockResolvedValue([
      createShift({
        id: "shift-jan",
        date: date("2026-01-10"),
        endTime: time("10:00"),
      }),
      createShift({
        id: "shift-feb",
        date: date("2026-02-10"),
        endTime: time("11:00"),
      }),
      createShift({
        id: "shift-mar",
        date: date("2026-03-10"),
        endTime: time("12:00"),
      }),
      createShift({
        id: "shift-jun",
        date: date("2026-06-10"),
        endTime: time("13:00"),
      }),
    ] as never);

    prismaPayrollRuleFindManyMock.mockResolvedValue([createRule()] as never);

    prismaActualPayrollFindManyMock.mockResolvedValue([
      {
        workplaceId: "workplace-1",
        paymentMonth: date("2026-01-01"),
        taxableAmount: new Prisma.Decimal(900),
        nonTaxableAmount: new Prisma.Decimal(100),
        note: null,
      },
    ] as never);
  });

  it("年内受取累計と年間受取見込の課税/非課税内訳は未登録分の概算を課税対象として合算する", async () => {
    const summary = await getPayrollSummaryForUser(
      "user-1",
      date("2026-03-01"),
    );

    expect(summary.currentMonthCumulative).toBe(6000);
    expect(summary.yearlyTotal).toBe(10000);

    expect(summary.currentMonthActualCoverage).toEqual(
      expect.objectContaining({
        taxableAmount: 5900,
        nonTaxableAmount: 100,
        totalAmount: 6000,
      }),
    );
    expect(summary.yearlyActualCoverage).toEqual(
      expect.objectContaining({
        taxableAmount: 9900,
        nonTaxableAmount: 100,
        totalAmount: 10000,
      }),
    );
  });

  it("月次サマリー本体は対象月の読取だけで同じ実績支給額を返す", async () => {
    const summary = await getPayrollSummaryCoreForUser(
      "user-1",
      date("2026-03-01"),
    );

    expect(summary).toEqual(
      expect.objectContaining({
        month: "2026-03",
        totalWage: 3000,
        estimatedTotalWage: 3000,
        confirmedShiftWage: 0,
      }),
    );
  });

  it("次回支給額向けの軽量取得は表示額だけを返す", async () => {
    const summaryAmount = await getPayrollSummaryAmountForUser(
      "user-1",
      date("2026-01-01"),
    );

    expect(summaryAmount).toEqual({
      month: "2026-01",
      totalWage: 1000,
    });
  });

  it("年累計補足は選択月までの累計と年間見込を返す", async () => {
    const summaryYearContext = await getPayrollSummaryYearContextForUser(
      "user-1",
      date("2026-03-01"),
    );

    expect(summaryYearContext).toEqual(
      expect.objectContaining({
        month: "2026-03",
        currentMonthCumulative: 6000,
        yearlyTotal: 10000,
        estimatedCurrentMonthCumulative: 6000,
        estimatedYearlyTotal: 10000,
      }),
    );
  });
});

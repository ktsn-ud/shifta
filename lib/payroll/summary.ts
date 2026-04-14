import type { Prisma } from "@/lib/generated/prisma/client";
import {
  calculateShiftPayrollResult,
  groupPayrollRulesByWorkplace,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import {
  resolvePayrollPeriodForMonth,
  type ClosingDayType,
  type PayrollPeriod,
} from "@/lib/payroll/pay-period";
import { prisma } from "@/lib/prisma";

type PayrollSummaryByWorkplace = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  periodStartDate: string;
  periodEndDate: string;
  wage: number;
  workHours: number;
};

export type PayrollSummaryResult = {
  totalWage: number;
  totalWorkHours: number;
  totalNightHours: number;
  totalOvertimeHours: number;
  byWorkplace: PayrollSummaryByWorkplace[];
  confirmedShiftWage: number;
  currentMonthCumulative: number;
  yearlyTotal: number;
};

type WorkplaceWithPayrollCycle = {
  id: string;
  name: string;
  color: string;
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
};

type WorkplacePeriodSummary = {
  wage: number;
  confirmedWage: number;
  workHours: number;
  nightHours: number;
  overtimeHours: number;
};

type ShiftWithSummaryRelations = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
  };
}>;

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function toMonthKey(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toDateOnlyUtc(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function listMonthsInYear(month: Date): Date[] {
  const year = month.getUTCFullYear();
  return Array.from(
    { length: 12 },
    (_, index) => new Date(Date.UTC(year, index, 1)),
  );
}

function toPeriodMapKey(workplaceId: string, monthKey: string): string {
  return `${workplaceId}:${monthKey}`;
}

function groupShiftsByWorkplace(
  shifts: ShiftWithSummaryRelations[],
): Map<string, ShiftWithSummaryRelations[]> {
  const grouped = new Map<string, ShiftWithSummaryRelations[]>();

  for (const shift of shifts) {
    const bucket = grouped.get(shift.workplaceId) ?? [];
    bucket.push(shift);
    grouped.set(shift.workplaceId, bucket);
  }

  return grouped;
}

function summarizeWorkplaceByPeriod(
  workplaceId: string,
  period: PayrollPeriod,
  shiftsByWorkplace: Map<string, ShiftWithSummaryRelations[]>,
  rulesByWorkplace: PayrollRulesByWorkplace,
): WorkplacePeriodSummary {
  const shifts = shiftsByWorkplace.get(workplaceId) ?? [];
  const periodStartTime = period.periodStartDate.getTime();
  const periodEndTime = period.periodEndDate.getTime();
  let wage = 0;
  let confirmedWage = 0;
  let workHours = 0;
  let nightHours = 0;
  let overtimeHours = 0;

  for (const shift of shifts) {
    const shiftTime = shift.date.getTime();
    if (shiftTime < periodStartTime) {
      continue;
    }

    if (shiftTime > periodEndTime) {
      break;
    }

    const result = calculateShiftPayrollResult(shift, rulesByWorkplace);
    wage += result.totalWage;
    if (shift.isConfirmed) {
      confirmedWage += result.totalWage;
    }
    workHours += result.workHours;
    nightHours += result.nightHours;
    overtimeHours += result.overtimeHours;
  }

  return {
    wage,
    confirmedWage,
    workHours,
    nightHours,
    overtimeHours,
  };
}

export async function getPayrollTotalWageForUserByMonth(
  userId: string,
  month: Date,
): Promise<number> {
  const selectedMonth = startOfMonth(month);

  const workplaces = await prisma.workplace.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      color: true,
      closingDayType: true,
      closingDay: true,
      payday: true,
    },
  });

  if (workplaces.length === 0) {
    return 0;
  }

  let fetchStartDate: Date | null = null;
  let fetchEndDate: Date | null = null;
  const periodByWorkplace = new Map<string, PayrollPeriod>();

  for (const workplace of workplaces) {
    const period = resolvePayrollPeriodForMonth(selectedMonth, {
      closingDayType: workplace.closingDayType,
      closingDay: workplace.closingDay,
      payday: workplace.payday,
    });
    periodByWorkplace.set(workplace.id, period);

    if (!fetchStartDate || period.periodStartDate < fetchStartDate) {
      fetchStartDate = period.periodStartDate;
    }

    if (!fetchEndDate || period.periodEndDate > fetchEndDate) {
      fetchEndDate = period.periodEndDate;
    }
  }

  if (!fetchStartDate || !fetchEndDate) {
    throw new Error("PAYROLL_PERIOD_NOT_FOUND");
  }

  const shifts = await prisma.shift.findMany({
    where: {
      workplace: { userId },
      date: {
        gte: fetchStartDate,
        lte: fetchEndDate,
      },
    },
    include: {
      lessonRange: true,
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const payrollRules = await prisma.payrollRule.findMany({
    where: {
      workplaceId: {
        in: workplaces.map((workplace) => workplace.id),
      },
      startDate: {
        lte: fetchEndDate,
      },
      OR: [
        {
          endDate: null,
        },
        {
          endDate: {
            gt: fetchStartDate,
          },
        },
      ],
    },
    orderBy: [{ workplaceId: "asc" }, { startDate: "asc" }],
  });

  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);
  const shiftsByWorkplace = groupShiftsByWorkplace(shifts);

  let totalWage = 0;
  for (const workplace of workplaces) {
    const period = periodByWorkplace.get(workplace.id);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${workplace.id}`);
    }

    totalWage += summarizeWorkplaceByPeriod(
      workplace.id,
      period,
      shiftsByWorkplace,
      rulesByWorkplace,
    ).wage;
  }

  return roundCurrency(totalWage);
}

export async function getPayrollSummaryForUser(
  userId: string,
  month: Date,
): Promise<PayrollSummaryResult> {
  const selectedMonth = startOfMonth(month);
  const monthsInYear = listMonthsInYear(selectedMonth);
  const selectedMonthIndex = selectedMonth.getUTCMonth();
  const selectedMonthKey = toMonthKey(selectedMonth);

  const workplaces = await prisma.workplace.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      color: true,
      closingDayType: true,
      closingDay: true,
      payday: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (workplaces.length === 0) {
    return {
      totalWage: 0,
      totalWorkHours: 0,
      totalNightHours: 0,
      totalOvertimeHours: 0,
      byWorkplace: [],
      confirmedShiftWage: 0,
      currentMonthCumulative: 0,
      yearlyTotal: 0,
    };
  }

  const monthTargets = new Map<string, Date>();
  for (const yearMonth of monthsInYear) {
    monthTargets.set(toMonthKey(yearMonth), yearMonth);
  }

  let fetchStartDate: Date | null = null;
  let fetchEndDate: Date | null = null;
  const periodByWorkplaceMonth = new Map<string, PayrollPeriod>();

  for (const workplace of workplaces) {
    for (const monthTarget of monthTargets.values()) {
      const period = resolvePayrollPeriodForMonth(monthTarget, {
        closingDayType: workplace.closingDayType,
        closingDay: workplace.closingDay,
        payday: workplace.payday,
      });
      periodByWorkplaceMonth.set(
        toPeriodMapKey(workplace.id, toMonthKey(monthTarget)),
        period,
      );

      if (!fetchStartDate || period.periodStartDate < fetchStartDate) {
        fetchStartDate = period.periodStartDate;
      }

      if (!fetchEndDate || period.periodEndDate > fetchEndDate) {
        fetchEndDate = period.periodEndDate;
      }
    }
  }

  if (!fetchStartDate || !fetchEndDate) {
    throw new Error("PAYROLL_PERIOD_NOT_FOUND");
  }

  const shifts = await prisma.shift.findMany({
    where: {
      workplace: { userId },
      date: {
        gte: fetchStartDate,
        lte: fetchEndDate,
      },
    },
    include: {
      lessonRange: true,
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const payrollRules = await prisma.payrollRule.findMany({
    where: {
      workplaceId: {
        in: workplaces.map((workplace) => workplace.id),
      },
      startDate: {
        lte: fetchEndDate,
      },
      OR: [
        {
          endDate: null,
        },
        {
          endDate: {
            gt: fetchStartDate,
          },
        },
      ],
    },
    orderBy: [{ workplaceId: "asc" }, { startDate: "asc" }],
  });

  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);
  const shiftsByWorkplace = groupShiftsByWorkplace(shifts);
  const monthSummaryByWorkplace = new Map<string, WorkplacePeriodSummary>();

  const getWorkplaceMonthSummary = (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ): WorkplacePeriodSummary => {
    const cacheKey = toPeriodMapKey(workplace.id, monthKey);
    const cached = monthSummaryByWorkplace.get(cacheKey);
    if (cached) {
      return cached;
    }

    const period = periodByWorkplaceMonth.get(cacheKey);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${cacheKey}`);
    }

    const summarized = summarizeWorkplaceByPeriod(
      workplace.id,
      period,
      shiftsByWorkplace,
      rulesByWorkplace,
    );
    monthSummaryByWorkplace.set(cacheKey, summarized);
    return summarized;
  };

  const monthlyTotalWage = new Map<string, number>();
  for (const [monthKey] of monthTargets) {
    let total = 0;
    for (const workplace of workplaces) {
      total += getWorkplaceMonthSummary(workplace, monthKey).wage;
    }

    monthlyTotalWage.set(monthKey, total);
  }

  const byWorkplace: PayrollSummaryByWorkplace[] = [];
  let totalWage = 0;
  let totalConfirmedWage = 0;
  let totalWorkHours = 0;
  let totalNightHours = 0;
  let totalOvertimeHours = 0;

  for (const workplace of workplaces) {
    const cacheKey = toPeriodMapKey(workplace.id, selectedMonthKey);
    const period = periodByWorkplaceMonth.get(cacheKey);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${cacheKey}`);
    }

    const summarized = getWorkplaceMonthSummary(workplace, selectedMonthKey);
    totalWage += summarized.wage;
    totalConfirmedWage += summarized.confirmedWage;
    totalWorkHours += summarized.workHours;
    totalNightHours += summarized.nightHours;
    totalOvertimeHours += summarized.overtimeHours;

    if (summarized.workHours <= 0 && summarized.wage <= 0) {
      continue;
    }

    byWorkplace.push({
      workplaceId: workplace.id,
      workplaceName: workplace.name,
      workplaceColor: workplace.color,
      periodStartDate: toDateOnlyUtc(period.periodStartDate),
      periodEndDate: toDateOnlyUtc(period.periodEndDate),
      wage: roundCurrency(summarized.wage),
      workHours: roundHours(summarized.workHours),
    });
  }

  const currentMonthCumulative = monthsInYear
    .slice(0, selectedMonthIndex + 1)
    .reduce(
      (sum, yearMonth) =>
        sum + (monthlyTotalWage.get(toMonthKey(yearMonth)) ?? 0),
      0,
    );
  const yearlyTotal = monthsInYear.reduce(
    (sum, yearMonth) =>
      sum + (monthlyTotalWage.get(toMonthKey(yearMonth)) ?? 0),
    0,
  );

  return {
    totalWage: roundCurrency(totalWage),
    totalWorkHours: roundHours(totalWorkHours),
    totalNightHours: roundHours(totalNightHours),
    totalOvertimeHours: roundHours(totalOvertimeHours),
    byWorkplace: byWorkplace.sort((left, right) => right.wage - left.wage),
    confirmedShiftWage: roundCurrency(totalConfirmedWage),
    currentMonthCumulative: roundCurrency(currentMonthCumulative),
    yearlyTotal: roundCurrency(yearlyTotal),
  };
}

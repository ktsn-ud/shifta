import type { PayrollRule, Prisma } from "@/lib/generated/prisma/client";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import {
  resolvePayrollPeriodForMonth,
  type ClosingDayType,
  type PayrollPeriod,
} from "@/lib/payroll/pay-period";
import { prisma } from "@/lib/prisma";

type ShiftWithPayrollRelations = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
  };
}>;

type WorkplaceWithPayrollCycle = {
  id: string;
  name: string;
  color: string;
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
};

type PayrollBreakdownAccumulator = {
  totalWorkHours: number;
  baseHours: number;
  holidayHours: number;
  nightHours: number;
  overtimeHours: number;
  totalWage: number;
  baseWage: number;
  holidayWage: number;
  nightWage: number;
  baseHoursWageBase: number;
  holidayHoursAllowanceBase: number;
  nightHoursWageBase: number;
};

type PayrollBreakdownDisplay = {
  totalWorkHours: number;
  baseHours: number;
  holidayHours: number;
  nightHours: number;
  overtimeHours: number;
  totalWage: number;
  baseWage: number;
  holidayWage: number;
  nightWage: number;
  workDuration: string;
  baseDuration: string;
  holidayDuration: string;
  nightDuration: string;
  overtimeDuration: string;
  effectiveBaseHourlyWage: number | null;
  effectiveHolidayAllowanceHourly: number | null;
  effectiveNightHourlyWage: number | null;
  effectiveNightPremiumRate: number | null;
};

type PayrollMonthlyByWorkplace = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  periodStartDate: string;
  periodEndDate: string;
} & PayrollBreakdownDisplay;

export type PayrollDetailsMonthlyResult = {
  month: string;
  totals: PayrollBreakdownDisplay;
  byWorkplace: PayrollMonthlyByWorkplace[];
};

type PayrollWorkplaceYearlyMonth = {
  month: number;
  monthKey: string;
  periodStartDate: string;
  periodEndDate: string;
} & PayrollBreakdownDisplay;

type PayrollWorkplaceYearlyItem = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  yearlyTotals: PayrollBreakdownDisplay;
  months: PayrollWorkplaceYearlyMonth[];
};

export type PayrollDetailsWorkplaceYearlyResult = {
  year: number;
  workplaces: PayrollWorkplaceYearlyItem[];
};

export type PayrollDetailBreakdownResult = PayrollBreakdownDisplay;

function decimalToNumber(
  value: number | string | { toString: () => string } | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = Number(value.toString());
  if (Number.isFinite(numeric) === false) {
    return fallback;
  }

  return numeric;
}

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function createMonthUtc(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function listMonthsInYearUtc(year: number): Date[] {
  return Array.from({ length: 12 }, (_, index) => createMonthUtc(year, index));
}

function toMonthKeyUtc(date: Date): string {
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

function toPeriodMapKey(workplaceId: string, monthKey: string): string {
  return `${workplaceId}:${monthKey}`;
}

function createEmptyBreakdownAccumulator(): PayrollBreakdownAccumulator {
  return {
    totalWorkHours: 0,
    baseHours: 0,
    holidayHours: 0,
    nightHours: 0,
    overtimeHours: 0,
    totalWage: 0,
    baseWage: 0,
    holidayWage: 0,
    nightWage: 0,
    baseHoursWageBase: 0,
    holidayHoursAllowanceBase: 0,
    nightHoursWageBase: 0,
  };
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

function formatDurationHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const displayHours = Math.floor(totalMinutes / 60);
  const displayMinutes = totalMinutes % 60;
  return `${displayHours}:${String(displayMinutes).padStart(2, "0")}`;
}

function toEffectiveRate(
  denominator: number,
  numerator: number,
): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10000) / 10000;
}

function toBreakdownDisplay(
  summary: PayrollBreakdownAccumulator,
): PayrollBreakdownDisplay {
  const effectiveNightHourlyWage = toEffectiveRate(
    summary.nightHours,
    summary.nightWage,
  );
  const effectiveNightPremiumRateRaw = toEffectiveRate(
    summary.nightHoursWageBase,
    summary.nightWage,
  );
  const effectiveNightPremiumRate =
    effectiveNightPremiumRateRaw === null
      ? null
      : effectiveNightPremiumRateRaw - 1;

  return {
    totalWorkHours: roundHours(summary.totalWorkHours),
    baseHours: roundHours(summary.baseHours),
    holidayHours: roundHours(summary.holidayHours),
    nightHours: roundHours(summary.nightHours),
    overtimeHours: roundHours(summary.overtimeHours),
    totalWage: roundCurrency(summary.totalWage),
    baseWage: roundCurrency(summary.baseWage),
    holidayWage: roundCurrency(summary.holidayWage),
    nightWage: roundCurrency(summary.nightWage),
    workDuration: formatDurationHours(summary.totalWorkHours),
    baseDuration: formatDurationHours(summary.baseHours),
    holidayDuration: formatDurationHours(summary.holidayHours),
    nightDuration: formatDurationHours(summary.nightHours),
    overtimeDuration: formatDurationHours(summary.overtimeHours),
    effectiveBaseHourlyWage: toEffectiveRate(
      summary.baseHours,
      summary.baseHoursWageBase,
    ),
    effectiveHolidayAllowanceHourly: toEffectiveRate(
      summary.holidayHours,
      summary.holidayHoursAllowanceBase,
    ),
    effectiveNightHourlyWage:
      effectiveNightHourlyWage === null
        ? null
        : Math.round(effectiveNightHourlyWage * 10000) / 10000,
    effectiveNightPremiumRate:
      effectiveNightPremiumRate === null
        ? null
        : Math.round(effectiveNightPremiumRate * 10000) / 10000,
  };
}

function mergeBreakdowns(
  target: PayrollBreakdownAccumulator,
  source: PayrollBreakdownAccumulator,
): void {
  target.totalWorkHours += source.totalWorkHours;
  target.baseHours += source.baseHours;
  target.holidayHours += source.holidayHours;
  target.nightHours += source.nightHours;
  target.overtimeHours += source.overtimeHours;
  target.totalWage += source.totalWage;
  target.baseWage += source.baseWage;
  target.holidayWage += source.holidayWage;
  target.nightWage += source.nightWage;
  target.baseHoursWageBase += source.baseHoursWageBase;
  target.holidayHoursAllowanceBase += source.holidayHoursAllowanceBase;
  target.nightHoursWageBase += source.nightHoursWageBase;
}

function groupShiftsByWorkplace(
  shifts: ShiftWithPayrollRelations[],
): Map<string, ShiftWithPayrollRelations[]> {
  const grouped = new Map<string, ShiftWithPayrollRelations[]>();

  for (const shift of shifts) {
    const bucket = grouped.get(shift.workplaceId) ?? [];
    bucket.push(shift);
    grouped.set(shift.workplaceId, bucket);
  }

  return grouped;
}

function readRuleDecimal(
  rule: PayrollRule,
  keys: string[],
  fallback = 0,
): number {
  const record = rule as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      (typeof value === "object" &&
        value !== null &&
        "toString" in value &&
        typeof (value as { toString: unknown }).toString === "function")
    ) {
      return decimalToNumber(
        value as number | string | { toString: () => string },
        fallback,
      );
    }
  }

  return fallback;
}

function summarizeWorkplaceByPeriod(
  workplaceId: string,
  period: PayrollPeriod,
  shiftsByWorkplace: Map<string, ShiftWithPayrollRelations[]>,
  rulesByWorkplace: PayrollRulesByWorkplace,
): PayrollBreakdownAccumulator {
  const shifts = shiftsByWorkplace.get(workplaceId) ?? [];
  const periodStartTime = period.periodStartDate.getTime();
  const periodEndTime = period.periodEndDate.getTime();

  const summary = createEmptyBreakdownAccumulator();

  for (const shift of shifts) {
    const shiftTime = shift.date.getTime();
    if (shiftTime < periodStartTime) {
      continue;
    }

    if (shiftTime > periodEndTime) {
      break;
    }

    const rule = findApplicablePayrollRule(
      rulesByWorkplace,
      workplaceId,
      shift.date,
    );
    if (!rule) {
      throw new Error(
        `該当する給与ルールが見つかりません: shiftId=${shift.id}`,
      );
    }

    const result = calculateShiftPayrollResultByRule(shift, rule);
    const baseHourlyWage = decimalToNumber(rule.baseHourlyWage);
    const holidayAllowanceHourly = readRuleDecimal(
      rule,
      ["holidayAllowanceHourly", "holidayHourlyWage"],
      0,
    );

    summary.totalWorkHours += result.workHours;
    summary.baseHours += result.baseHours;
    summary.holidayHours += result.holidayHours;
    summary.nightHours += result.nightHours;
    summary.overtimeHours += result.overtimeHours;
    summary.totalWage += result.totalWage;
    summary.baseWage += result.baseWage;
    summary.holidayWage += result.holidayWage;
    summary.nightWage += result.nightWage;
    summary.baseHoursWageBase += result.baseHours * baseHourlyWage;
    summary.holidayHoursAllowanceBase +=
      result.holidayHours * holidayAllowanceHourly;
    summary.nightHoursWageBase += result.nightHours * baseHourlyWage;
  }

  return summary;
}

export function summarizeWorkplacePayrollDetailsByPeriod(params: {
  workplaceId: string;
  startDate: Date;
  endDate: Date;
  shifts: ShiftWithPayrollRelations[];
  payrollRules: PayrollRule[];
}): PayrollDetailBreakdownResult {
  const shiftsByWorkplace = groupShiftsByWorkplace(params.shifts);
  const rulesByWorkplace = groupPayrollRulesByWorkplace(params.payrollRules);
  const period: PayrollPeriod = {
    paymentDate: params.endDate,
    periodStartDate: params.startDate,
    periodEndDate: params.endDate,
  };

  const summary = summarizeWorkplaceByPeriod(
    params.workplaceId,
    period,
    shiftsByWorkplace,
    rulesByWorkplace,
  );

  return toBreakdownDisplay(summary);
}

async function fetchWorkplaces(
  userId: string,
): Promise<WorkplaceWithPayrollCycle[]> {
  return prisma.workplace.findMany({
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
}

async function fetchShiftsAndRules(
  workplaceIds: string[],
  fetchStartDate: Date,
  fetchEndDate: Date,
): Promise<{
  shiftsByWorkplace: Map<string, ShiftWithPayrollRelations[]>;
  rulesByWorkplace: PayrollRulesByWorkplace;
}> {
  const [shifts, payrollRules] = await Promise.all([
    prisma.shift.findMany({
      where: {
        workplaceId: {
          in: workplaceIds,
        },
        date: {
          gte: fetchStartDate,
          lte: fetchEndDate,
        },
      },
      include: {
        lessonRange: true,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.payrollRule.findMany({
      where: {
        workplaceId: {
          in: workplaceIds,
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
    }),
  ]);

  return {
    shiftsByWorkplace: groupShiftsByWorkplace(shifts),
    rulesByWorkplace: groupPayrollRulesByWorkplace(payrollRules),
  };
}

function resolveFetchRange(periods: PayrollPeriod[]): {
  fetchStartDate: Date;
  fetchEndDate: Date;
} {
  if (periods.length === 0) {
    throw new Error("PAYROLL_PERIOD_NOT_FOUND");
  }

  let fetchStartDate = periods[0].periodStartDate;
  let fetchEndDate = periods[0].periodEndDate;

  for (const period of periods) {
    if (period.periodStartDate < fetchStartDate) {
      fetchStartDate = period.periodStartDate;
    }
    if (period.periodEndDate > fetchEndDate) {
      fetchEndDate = period.periodEndDate;
    }
  }

  return {
    fetchStartDate,
    fetchEndDate,
  };
}

export async function getPayrollDetailsMonthlyForUser(
  userId: string,
  month: Date,
): Promise<PayrollDetailsMonthlyResult> {
  const selectedMonth = startOfMonthUtc(month);
  const monthKey = toMonthKeyUtc(selectedMonth);

  const workplaces = await fetchWorkplaces(userId);
  if (workplaces.length === 0) {
    return {
      month: monthKey,
      totals: toBreakdownDisplay(createEmptyBreakdownAccumulator()),
      byWorkplace: [],
    };
  }

  const periodByWorkplace = new Map<string, PayrollPeriod>();
  const periods: PayrollPeriod[] = [];

  for (const workplace of workplaces) {
    const period = resolvePayrollPeriodForMonth(selectedMonth, {
      closingDayType: workplace.closingDayType,
      closingDay: workplace.closingDay,
      payday: workplace.payday,
    });
    periodByWorkplace.set(workplace.id, period);
    periods.push(period);
  }

  const { fetchStartDate, fetchEndDate } = resolveFetchRange(periods);
  const workplaceIds = workplaces.map((workplace) => workplace.id);
  const { shiftsByWorkplace, rulesByWorkplace } = await fetchShiftsAndRules(
    workplaceIds,
    fetchStartDate,
    fetchEndDate,
  );

  const totals = createEmptyBreakdownAccumulator();

  const byWorkplace = workplaces.map((workplace) => {
    const period = periodByWorkplace.get(workplace.id);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${workplace.id}`);
    }

    const summary = summarizeWorkplaceByPeriod(
      workplace.id,
      period,
      shiftsByWorkplace,
      rulesByWorkplace,
    );
    mergeBreakdowns(totals, summary);

    return {
      workplaceId: workplace.id,
      workplaceName: workplace.name,
      workplaceColor: workplace.color,
      periodStartDate: toDateOnlyUtc(period.periodStartDate),
      periodEndDate: toDateOnlyUtc(period.periodEndDate),
      ...toBreakdownDisplay(summary),
    };
  });

  return {
    month: monthKey,
    totals: toBreakdownDisplay(totals),
    byWorkplace: byWorkplace.sort(
      (left, right) => right.totalWage - left.totalWage,
    ),
  };
}

export async function getPayrollDetailsWorkplaceYearlyForUser(
  userId: string,
  year: number,
): Promise<PayrollDetailsWorkplaceYearlyResult> {
  const workplaces = await fetchWorkplaces(userId);
  if (workplaces.length === 0) {
    return {
      year,
      workplaces: [],
    };
  }

  const months = listMonthsInYearUtc(year);
  const periodByWorkplaceMonth = new Map<string, PayrollPeriod>();
  const periods: PayrollPeriod[] = [];

  for (const workplace of workplaces) {
    for (const month of months) {
      const monthKey = toMonthKeyUtc(month);
      const period = resolvePayrollPeriodForMonth(month, {
        closingDayType: workplace.closingDayType,
        closingDay: workplace.closingDay,
        payday: workplace.payday,
      });
      periodByWorkplaceMonth.set(
        toPeriodMapKey(workplace.id, monthKey),
        period,
      );
      periods.push(period);
    }
  }

  const { fetchStartDate, fetchEndDate } = resolveFetchRange(periods);
  const workplaceIds = workplaces.map((workplace) => workplace.id);
  const { shiftsByWorkplace, rulesByWorkplace } = await fetchShiftsAndRules(
    workplaceIds,
    fetchStartDate,
    fetchEndDate,
  );

  const monthSummaryCache = new Map<string, PayrollBreakdownAccumulator>();

  const getMonthSummary = (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ): PayrollBreakdownAccumulator => {
    const cacheKey = toPeriodMapKey(workplace.id, monthKey);
    const cached = monthSummaryCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const period = periodByWorkplaceMonth.get(cacheKey);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${cacheKey}`);
    }

    const summary = summarizeWorkplaceByPeriod(
      workplace.id,
      period,
      shiftsByWorkplace,
      rulesByWorkplace,
    );
    monthSummaryCache.set(cacheKey, summary);
    return summary;
  };

  const yearlyByWorkplace = workplaces.map((workplace) => {
    const yearlyTotals = createEmptyBreakdownAccumulator();

    const monthRows = months.map((month, index) => {
      const monthKey = toMonthKeyUtc(month);
      const periodKey = toPeriodMapKey(workplace.id, monthKey);
      const period = periodByWorkplaceMonth.get(periodKey);
      if (!period) {
        throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${periodKey}`);
      }

      const summary = getMonthSummary(workplace, monthKey);
      mergeBreakdowns(yearlyTotals, summary);

      return {
        month: index + 1,
        monthKey,
        periodStartDate: toDateOnlyUtc(period.periodStartDate),
        periodEndDate: toDateOnlyUtc(period.periodEndDate),
        ...toBreakdownDisplay(summary),
      };
    });

    return {
      workplaceId: workplace.id,
      workplaceName: workplace.name,
      workplaceColor: workplace.color,
      yearlyTotals: toBreakdownDisplay(yearlyTotals),
      months: monthRows,
    };
  });

  return {
    year,
    workplaces: yearlyByWorkplace.sort(
      (left, right) =>
        right.yearlyTotals.totalWage - left.yearlyTotals.totalWage,
    ),
  };
}

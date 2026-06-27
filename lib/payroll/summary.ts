import type { Prisma } from "@/lib/generated/prisma/client";
import {
  buildWorkplaceMonthKey,
  createPayrollDisplayValue,
  summarizeActualPayrollCoverage,
  type ActualPayrollAmount,
  type ActualPayrollCoverage,
  type ActualPayrollRecord,
  type PayrollDisplayValue,
} from "@/lib/payroll/actual-payroll";
import {
  calculateShiftPayrollResult,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { type PayrollPeriod } from "@/lib/payroll/pay-period";
import {
  loadPayrollSnapshot,
  toPayrollPeriodMapKey,
  type PayrollSnapshotWorkplace,
} from "@/lib/payroll/snapshot";

type PayrollSummaryByWorkplace = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  periodStartDate: string;
  periodEndDate: string;
  wage: number;
  workHours: number;
  displayValue: PayrollDisplayValue;
  actualPayroll: ActualPayrollRecord | null;
};

export type PayrollSummaryResult = {
  month: string;
  totalWage: number;
  estimatedTotalWage: number;
  displayValue: PayrollDisplayValue;
  actualCoverage: ActualPayrollCoverage;
  totalWorkHours: number;
  totalNightHours: number;
  totalOvertimeHours: number;
  byWorkplace: PayrollSummaryByWorkplace[];
  confirmedShiftWage: number;
  currentMonthCumulative: number;
  yearlyTotal: number;
  currentMonthActualCoverage: ActualPayrollCoverage;
  yearlyActualCoverage: ActualPayrollCoverage;
  estimatedCurrentMonthCumulative: number;
  estimatedYearlyTotal: number;
};

type WorkplaceWithPayrollCycle = PayrollSnapshotWorkplace;

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

function createActualPayrollAmount(
  taxableAmount: number,
  nonTaxableAmount: number,
): ActualPayrollAmount {
  const roundedTaxableAmount = roundCurrency(taxableAmount);
  const roundedNonTaxableAmount = roundCurrency(nonTaxableAmount);

  return {
    taxableAmount: roundedTaxableAmount,
    nonTaxableAmount: roundedNonTaxableAmount,
    totalAmount: roundCurrency(roundedTaxableAmount + roundedNonTaxableAmount),
  };
}

function mergeCoverageWithDisplayAmount(
  coverage: ActualPayrollCoverage,
  amount: ActualPayrollAmount,
): ActualPayrollCoverage {
  return {
    ...coverage,
    taxableAmount: amount.taxableAmount,
    nonTaxableAmount: amount.nonTaxableAmount,
    totalAmount: amount.totalAmount,
  };
}

function listMonthsInYear(month: Date): Date[] {
  const year = month.getUTCFullYear();
  return Array.from(
    { length: 12 },
    (_, index) => new Date(Date.UTC(year, index, 1)),
  );
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

export async function getPayrollSummaryForUser(
  userId: string,
  month: Date,
): Promise<PayrollSummaryResult> {
  const selectedMonth = startOfMonth(month);
  const monthsInYear = listMonthsInYear(selectedMonth);
  const selectedMonthIndex = selectedMonth.getUTCMonth();
  const selectedMonthKey = toMonthKey(selectedMonth);
  const {
    workplaces,
    periodByWorkplaceMonth,
    shiftsByWorkplace,
    rulesByWorkplace,
    actualPayrollByWorkplaceMonth,
  } = await loadPayrollSnapshot({
    userId,
    monthDates: monthsInYear,
    includeActualPayroll: true,
  });

  if (workplaces.length === 0) {
    return {
      month: selectedMonthKey,
      totalWage: 0,
      estimatedTotalWage: 0,
      displayValue: createPayrollDisplayValue(0, null),
      actualCoverage: summarizeActualPayrollCoverage([], 0),
      totalWorkHours: 0,
      totalNightHours: 0,
      totalOvertimeHours: 0,
      byWorkplace: [],
      confirmedShiftWage: 0,
      currentMonthCumulative: 0,
      yearlyTotal: 0,
      currentMonthActualCoverage: summarizeActualPayrollCoverage([], 0),
      yearlyActualCoverage: summarizeActualPayrollCoverage([], 0),
      estimatedCurrentMonthCumulative: 0,
      estimatedYearlyTotal: 0,
    };
  }

  const monthTargets = new Map<string, Date>();
  for (const yearMonth of monthsInYear) {
    monthTargets.set(toMonthKey(yearMonth), yearMonth);
  }
  const monthSummaryByWorkplace = new Map<string, WorkplacePeriodSummary>();

  const getWorkplaceMonthSummary = (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ): WorkplacePeriodSummary => {
    const cacheKey = toPayrollPeriodMapKey(workplace.id, monthKey);
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
  const monthlyDisplayWage = new Map<string, number>();
  const monthlyDisplayTaxableWage = new Map<string, number>();
  const monthlyDisplayNonTaxableWage = new Map<string, number>();
  for (const [monthKey] of monthTargets) {
    let total = 0;
    let displayTotal = 0;
    let displayTaxableTotal = 0;
    let displayNonTaxableTotal = 0;
    for (const workplace of workplaces) {
      const estimatedWage = getWorkplaceMonthSummary(workplace, monthKey).wage;
      const actualPayroll =
        actualPayrollByWorkplaceMonth.get(
          buildWorkplaceMonthKey(workplace.id, monthKey),
        ) ?? null;
      const displayValue = createPayrollDisplayValue(
        estimatedWage,
        actualPayroll,
      );
      total += estimatedWage;
      displayTotal += displayValue.displayAmount;

      if (actualPayroll) {
        displayTaxableTotal += actualPayroll.taxableAmount;
        displayNonTaxableTotal += actualPayroll.nonTaxableAmount;
        continue;
      }

      displayTaxableTotal += displayValue.displayAmount;
    }

    monthlyTotalWage.set(monthKey, total);
    monthlyDisplayWage.set(monthKey, displayTotal);
    monthlyDisplayTaxableWage.set(monthKey, displayTaxableTotal);
    monthlyDisplayNonTaxableWage.set(monthKey, displayNonTaxableTotal);
  }

  const byWorkplace: PayrollSummaryByWorkplace[] = [];
  let estimatedTotalWage = 0;
  let totalWage = 0;
  let totalConfirmedWage = 0;
  let totalWorkHours = 0;
  let totalNightHours = 0;
  let totalOvertimeHours = 0;
  const selectedMonthActuals: Array<ActualPayrollRecord | null> = [];
  const currentMonthCumulativeActuals: Array<ActualPayrollRecord | null> = [];
  const yearlyActuals: Array<ActualPayrollRecord | null> = [];

  for (const yearMonth of monthsInYear) {
    const monthKey = toMonthKey(yearMonth);
    for (const workplace of workplaces) {
      const actualPayroll =
        actualPayrollByWorkplaceMonth.get(
          buildWorkplaceMonthKey(workplace.id, monthKey),
        ) ?? null;
      yearlyActuals.push(actualPayroll);

      if (yearMonth.getUTCMonth() <= selectedMonthIndex) {
        currentMonthCumulativeActuals.push(actualPayroll);
      }
    }
  }

  for (const workplace of workplaces) {
    const cacheKey = toPayrollPeriodMapKey(workplace.id, selectedMonthKey);
    const period = periodByWorkplaceMonth.get(cacheKey);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${cacheKey}`);
    }

    const summarized = getWorkplaceMonthSummary(workplace, selectedMonthKey);
    estimatedTotalWage += summarized.wage;
    totalConfirmedWage += summarized.confirmedWage;
    totalWorkHours += summarized.workHours;
    totalNightHours += summarized.nightHours;
    totalOvertimeHours += summarized.overtimeHours;
    const actualPayroll =
      actualPayrollByWorkplaceMonth.get(
        buildWorkplaceMonthKey(workplace.id, selectedMonthKey),
      ) ?? null;
    const displayValue = createPayrollDisplayValue(
      summarized.wage,
      actualPayroll,
    );
    totalWage += displayValue.displayAmount;
    selectedMonthActuals.push(actualPayroll);

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
      displayValue,
      actualPayroll,
    });
  }

  const currentMonthCumulative = monthsInYear
    .slice(0, selectedMonthIndex + 1)
    .reduce(
      (sum, yearMonth) =>
        sum + (monthlyDisplayWage.get(toMonthKey(yearMonth)) ?? 0),
      0,
    );
  const yearlyTotal = monthsInYear.reduce(
    (sum, yearMonth) =>
      sum + (monthlyDisplayWage.get(toMonthKey(yearMonth)) ?? 0),
    0,
  );
  const currentMonthDisplayBreakdown = createActualPayrollAmount(
    monthsInYear
      .slice(0, selectedMonthIndex + 1)
      .reduce(
        (sum, yearMonth) =>
          sum + (monthlyDisplayTaxableWage.get(toMonthKey(yearMonth)) ?? 0),
        0,
      ),
    monthsInYear
      .slice(0, selectedMonthIndex + 1)
      .reduce(
        (sum, yearMonth) =>
          sum + (monthlyDisplayNonTaxableWage.get(toMonthKey(yearMonth)) ?? 0),
        0,
      ),
  );
  const yearlyDisplayBreakdown = createActualPayrollAmount(
    monthsInYear.reduce(
      (sum, yearMonth) =>
        sum + (monthlyDisplayTaxableWage.get(toMonthKey(yearMonth)) ?? 0),
      0,
    ),
    monthsInYear.reduce(
      (sum, yearMonth) =>
        sum + (monthlyDisplayNonTaxableWage.get(toMonthKey(yearMonth)) ?? 0),
      0,
    ),
  );
  const estimatedCurrentMonthCumulative = monthsInYear
    .slice(0, selectedMonthIndex + 1)
    .reduce(
      (sum, yearMonth) =>
        sum + (monthlyTotalWage.get(toMonthKey(yearMonth)) ?? 0),
      0,
    );
  const estimatedYearlyTotal = monthsInYear.reduce(
    (sum, yearMonth) =>
      sum + (monthlyTotalWage.get(toMonthKey(yearMonth)) ?? 0),
    0,
  );
  const actualCoverage = summarizeActualPayrollCoverage(
    selectedMonthActuals,
    workplaces.length,
  );
  const currentMonthActualCoverage = summarizeActualPayrollCoverage(
    currentMonthCumulativeActuals,
    workplaces.length * (selectedMonthIndex + 1),
  );
  const yearlyActualCoverage = summarizeActualPayrollCoverage(
    yearlyActuals,
    workplaces.length * monthsInYear.length,
  );

  return {
    month: selectedMonthKey,
    totalWage: roundCurrency(totalWage),
    estimatedTotalWage: roundCurrency(estimatedTotalWage),
    displayValue: createPayrollDisplayValue(
      estimatedTotalWage,
      actualCoverage.registeredWorkplaceCount > 0
        ? {
            taxableAmount: actualCoverage.taxableAmount,
            nonTaxableAmount: actualCoverage.nonTaxableAmount,
            totalAmount: actualCoverage.totalAmount,
          }
        : null,
    ),
    actualCoverage,
    totalWorkHours: roundHours(totalWorkHours),
    totalNightHours: roundHours(totalNightHours),
    totalOvertimeHours: roundHours(totalOvertimeHours),
    byWorkplace: byWorkplace.sort(
      (left, right) =>
        right.displayValue.displayAmount - left.displayValue.displayAmount,
    ),
    confirmedShiftWage: roundCurrency(totalConfirmedWage),
    currentMonthCumulative: roundCurrency(currentMonthCumulative),
    yearlyTotal: roundCurrency(yearlyTotal),
    currentMonthActualCoverage: mergeCoverageWithDisplayAmount(
      currentMonthActualCoverage,
      currentMonthDisplayBreakdown,
    ),
    yearlyActualCoverage: mergeCoverageWithDisplayAmount(
      yearlyActualCoverage,
      yearlyDisplayBreakdown,
    ),
    estimatedCurrentMonthCumulative: roundCurrency(
      estimatedCurrentMonthCumulative,
    ),
    estimatedYearlyTotal: roundCurrency(estimatedYearlyTotal),
  };
}

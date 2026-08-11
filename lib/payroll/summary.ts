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
import { roundCurrency, roundHours } from "@/lib/payroll/numeric";
import {
  calculateShiftPayrollResult,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { type PayrollPeriod } from "@/lib/payroll/pay-period";
import { createPayrollPeriodSummaryGetter } from "@/lib/payroll/period-summary";
import {
  loadPayrollSnapshot,
  toPayrollPeriodMapKey,
  type PayrollSnapshotWorkplace,
} from "@/lib/payroll/snapshot";
import { createRequestTiming } from "@/lib/perf/request-timing";

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

export type PayrollSummaryCoreResult = {
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
};

export type PayrollSummaryYearContextResult = {
  month: string;
  currentMonthCumulative: number;
  yearlyTotal: number;
  currentMonthActualCoverage: ActualPayrollCoverage;
  yearlyActualCoverage: ActualPayrollCoverage;
  estimatedCurrentMonthCumulative: number;
  estimatedYearlyTotal: number;
};

export type PayrollSummaryAmountResult = {
  month: string;
  totalWage: number;
};

export type PayrollSummaryWorkplaceItem = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
};

export type PayrollSummaryIncomeByWorkplaceItem = {
  workplaceId: string;
  taxableAmount: number;
  nonTaxableAmount: number;
  totalAmount: number;
};

export type PayrollSummaryHoursByWorkplaceItem = {
  workplaceId: string;
  totalWorkHours: number;
};

export type PayrollSummaryMonthTotals = {
  taxableAmount: number;
  nonTaxableAmount: number;
  totalAmount: number;
  totalWorkHours: number;
};

export type PayrollSummaryMonthItem = {
  month: number;
  monthKey: string;
  incomeByWorkplace: PayrollSummaryIncomeByWorkplaceItem[];
  hoursByWorkplace: PayrollSummaryHoursByWorkplaceItem[];
  totals: PayrollSummaryMonthTotals;
};

export type PayrollSummaryYearlyWorkplaceTotal = {
  workplaceId: string;
  taxableAmount: number;
  nonTaxableAmount: number;
  totalAmount: number;
  totalWorkHours: number;
};

export type PayrollSummaryYearlyTotals = {
  byWorkplace: PayrollSummaryYearlyWorkplaceTotal[];
  grandTotals: PayrollSummaryMonthTotals;
};

export type PayrollSummaryResult = {
  year: number;
  workplaces: PayrollSummaryWorkplaceItem[];
  months: PayrollSummaryMonthItem[];
  yearlyTotals: PayrollSummaryYearlyTotals;
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
  return listMonthDatesInYear(month.getUTCFullYear());
}

function listMonthDatesInYear(year: number): Date[] {
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

function createEmptyPayrollSummaryCore(
  monthKey: string,
): PayrollSummaryCoreResult {
  return {
    month: monthKey,
    totalWage: 0,
    estimatedTotalWage: 0,
    displayValue: createPayrollDisplayValue(0, null),
    actualCoverage: summarizeActualPayrollCoverage([], 0),
    totalWorkHours: 0,
    totalNightHours: 0,
    totalOvertimeHours: 0,
    byWorkplace: [],
    confirmedShiftWage: 0,
  };
}

function createEmptyPayrollSummaryYearContext(
  monthKey: string,
): PayrollSummaryYearContextResult {
  return {
    month: monthKey,
    currentMonthCumulative: 0,
    yearlyTotal: 0,
    currentMonthActualCoverage: summarizeActualPayrollCoverage([], 0),
    yearlyActualCoverage: summarizeActualPayrollCoverage([], 0),
    estimatedCurrentMonthCumulative: 0,
    estimatedYearlyTotal: 0,
  };
}

function createEmptyPayrollSummaryAmount(
  monthKey: string,
): PayrollSummaryAmountResult {
  return {
    month: monthKey,
    totalWage: 0,
  };
}

function createEmptyPayrollSummaryMonthTotals(): PayrollSummaryMonthTotals {
  return {
    taxableAmount: 0,
    nonTaxableAmount: 0,
    totalAmount: 0,
    totalWorkHours: 0,
  };
}

function createEmptyPayrollSummaryResult(year: number): PayrollSummaryResult {
  const months = listMonthDatesInYear(year).map((monthDate, index) => ({
    month: index + 1,
    monthKey: toMonthKey(monthDate),
    incomeByWorkplace: [],
    hoursByWorkplace: [],
    totals: createEmptyPayrollSummaryMonthTotals(),
  }));

  return {
    year,
    workplaces: [],
    months,
    yearlyTotals: {
      byWorkplace: [],
      grandTotals: createEmptyPayrollSummaryMonthTotals(),
    },
  };
}

function buildPayrollSummaryCore(params: {
  monthKey: string;
  workplaces: WorkplaceWithPayrollCycle[];
  periodByWorkplaceMonth: Map<string, PayrollPeriod>;
  actualPayrollByWorkplaceMonth: Map<string, ActualPayrollRecord>;
  getWorkplaceMonthSummary: (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ) => WorkplacePeriodSummary;
}): PayrollSummaryCoreResult {
  if (params.workplaces.length === 0) {
    return createEmptyPayrollSummaryCore(params.monthKey);
  }

  const byWorkplace: PayrollSummaryByWorkplace[] = [];
  let estimatedTotalWage = 0;
  let totalWage = 0;
  let totalConfirmedWage = 0;
  let totalWorkHours = 0;
  let totalNightHours = 0;
  let totalOvertimeHours = 0;
  const selectedMonthActuals: Array<ActualPayrollRecord | null> = [];

  for (const workplace of params.workplaces) {
    const cacheKey = toPayrollPeriodMapKey(workplace.id, params.monthKey);
    const period = params.periodByWorkplaceMonth.get(cacheKey);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${cacheKey}`);
    }

    const summarized = params.getWorkplaceMonthSummary(
      workplace,
      params.monthKey,
    );
    estimatedTotalWage += summarized.wage;
    totalConfirmedWage += summarized.confirmedWage;
    totalWorkHours += summarized.workHours;
    totalNightHours += summarized.nightHours;
    totalOvertimeHours += summarized.overtimeHours;

    const actualPayroll =
      params.actualPayrollByWorkplaceMonth.get(
        buildWorkplaceMonthKey(workplace.id, params.monthKey),
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

  const actualCoverage = summarizeActualPayrollCoverage(
    selectedMonthActuals,
    params.workplaces.length,
  );

  return {
    month: params.monthKey,
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
  };
}

function buildPayrollSummaryAmount(params: {
  monthKey: string;
  workplaces: WorkplaceWithPayrollCycle[];
  actualPayrollByWorkplaceMonth: Map<string, ActualPayrollRecord>;
  getWorkplaceMonthSummary: (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ) => WorkplacePeriodSummary;
}): PayrollSummaryAmountResult {
  if (params.workplaces.length === 0) {
    return createEmptyPayrollSummaryAmount(params.monthKey);
  }

  let totalWage = 0;

  for (const workplace of params.workplaces) {
    const estimatedWage = params.getWorkplaceMonthSummary(
      workplace,
      params.monthKey,
    ).wage;
    const actualPayroll =
      params.actualPayrollByWorkplaceMonth.get(
        buildWorkplaceMonthKey(workplace.id, params.monthKey),
      ) ?? null;
    totalWage += createPayrollDisplayValue(
      estimatedWage,
      actualPayroll,
    ).displayAmount;
  }

  return {
    month: params.monthKey,
    totalWage: roundCurrency(totalWage),
  };
}

function buildPayrollSummaryYearContext(params: {
  selectedMonth: Date;
  workplaces: WorkplaceWithPayrollCycle[];
  actualPayrollByWorkplaceMonth: Map<string, ActualPayrollRecord>;
  getWorkplaceMonthSummary: (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ) => WorkplacePeriodSummary;
}): PayrollSummaryYearContextResult {
  const selectedMonthKey = toMonthKey(params.selectedMonth);
  if (params.workplaces.length === 0) {
    return createEmptyPayrollSummaryYearContext(selectedMonthKey);
  }

  const monthsInYear = listMonthsInYear(params.selectedMonth);
  const selectedMonthIndex = params.selectedMonth.getUTCMonth();
  const monthlyTotalWage = new Map<string, number>();
  const monthlyDisplayWage = new Map<string, number>();
  const monthlyDisplayTaxableWage = new Map<string, number>();
  const monthlyDisplayNonTaxableWage = new Map<string, number>();
  const currentMonthCumulativeActuals: Array<ActualPayrollRecord | null> = [];
  const yearlyActuals: Array<ActualPayrollRecord | null> = [];

  for (const yearMonth of monthsInYear) {
    const monthKey = toMonthKey(yearMonth);
    let total = 0;
    let displayTotal = 0;
    let displayTaxableTotal = 0;
    let displayNonTaxableTotal = 0;

    for (const workplace of params.workplaces) {
      const estimatedWage = params.getWorkplaceMonthSummary(
        workplace,
        monthKey,
      ).wage;
      const actualPayroll =
        params.actualPayrollByWorkplaceMonth.get(
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
      } else {
        displayTaxableTotal += displayValue.displayAmount;
      }

      yearlyActuals.push(actualPayroll);
      if (yearMonth.getUTCMonth() <= selectedMonthIndex) {
        currentMonthCumulativeActuals.push(actualPayroll);
      }
    }

    monthlyTotalWage.set(monthKey, total);
    monthlyDisplayWage.set(monthKey, displayTotal);
    monthlyDisplayTaxableWage.set(monthKey, displayTaxableTotal);
    monthlyDisplayNonTaxableWage.set(monthKey, displayNonTaxableTotal);
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
  const currentMonthActualCoverage = summarizeActualPayrollCoverage(
    currentMonthCumulativeActuals,
    params.workplaces.length * (selectedMonthIndex + 1),
  );
  const yearlyActualCoverage = summarizeActualPayrollCoverage(
    yearlyActuals,
    params.workplaces.length * monthsInYear.length,
  );

  return {
    month: selectedMonthKey,
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

function createYearlyWorkplaceAccumulator(
  workplaceId: string,
): PayrollSummaryYearlyWorkplaceTotal {
  return {
    workplaceId,
    taxableAmount: 0,
    nonTaxableAmount: 0,
    totalAmount: 0,
    totalWorkHours: 0,
  };
}

function buildSummaryIncomeByWorkplaceItem(params: {
  workplace: WorkplaceWithPayrollCycle;
  monthKey: string;
  actualPayrollByWorkplaceMonth: Map<string, ActualPayrollRecord>;
  getWorkplaceMonthSummary: (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ) => WorkplacePeriodSummary;
}): PayrollSummaryIncomeByWorkplaceItem {
  const summarized = params.getWorkplaceMonthSummary(
    params.workplace,
    params.monthKey,
  );
  const actualPayroll =
    params.actualPayrollByWorkplaceMonth.get(
      buildWorkplaceMonthKey(params.workplace.id, params.monthKey),
    ) ?? null;
  const estimatedAmount = roundCurrency(summarized.wage);
  const taxableAmount = actualPayroll
    ? roundCurrency(actualPayroll.taxableAmount)
    : estimatedAmount;
  const nonTaxableAmount = actualPayroll
    ? roundCurrency(actualPayroll.nonTaxableAmount)
    : 0;
  const totalAmount = actualPayroll
    ? roundCurrency(actualPayroll.totalAmount)
    : estimatedAmount;

  return {
    workplaceId: params.workplace.id,
    taxableAmount,
    nonTaxableAmount,
    totalAmount,
  };
}

function buildSummaryHoursByWorkplaceItem(params: {
  workplace: WorkplaceWithPayrollCycle;
  monthKey: string;
  getWorkplaceMonthSummary: (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ) => WorkplacePeriodSummary;
}): PayrollSummaryHoursByWorkplaceItem {
  const summarized = params.getWorkplaceMonthSummary(
    params.workplace,
    params.monthKey,
  );

  return {
    workplaceId: params.workplace.id,
    totalWorkHours: roundHours(summarized.workHours),
  };
}

function mergeIncomeTotals(
  target: PayrollSummaryMonthTotals | PayrollSummaryYearlyWorkplaceTotal,
  source: Omit<PayrollSummaryIncomeByWorkplaceItem, "workplaceId">,
): void {
  target.taxableAmount = roundCurrency(
    target.taxableAmount + source.taxableAmount,
  );
  target.nonTaxableAmount = roundCurrency(
    target.nonTaxableAmount + source.nonTaxableAmount,
  );
  target.totalAmount = roundCurrency(target.totalAmount + source.totalAmount);
}

function mergeHoursTotals(
  target: PayrollSummaryMonthTotals | PayrollSummaryYearlyWorkplaceTotal,
  source: Omit<PayrollSummaryHoursByWorkplaceItem, "workplaceId">,
): void {
  target.totalWorkHours = roundHours(
    target.totalWorkHours + source.totalWorkHours,
  );
}

function buildPayrollSummaryResult(params: {
  year: number;
  workplaces: WorkplaceWithPayrollCycle[];
  actualPayrollByWorkplaceMonth: Map<string, ActualPayrollRecord>;
  getWorkplaceMonthSummary: (
    workplace: WorkplaceWithPayrollCycle,
    monthKey: string,
  ) => WorkplacePeriodSummary;
}): PayrollSummaryResult {
  if (params.workplaces.length === 0) {
    return createEmptyPayrollSummaryResult(params.year);
  }

  const workplaceItems = params.workplaces.map((workplace) => ({
    workplaceId: workplace.id,
    workplaceName: workplace.name,
    workplaceColor: workplace.color,
  }));
  const yearlyTotalsByWorkplace = new Map<
    string,
    PayrollSummaryYearlyWorkplaceTotal
  >(
    params.workplaces.map((workplace) => [
      workplace.id,
      createYearlyWorkplaceAccumulator(workplace.id),
    ]),
  );
  const yearlyGrandTotals = createEmptyPayrollSummaryMonthTotals();

  const months = listMonthDatesInYear(params.year).map((monthDate, index) => {
    const monthKey = toMonthKey(monthDate);
    const totals = createEmptyPayrollSummaryMonthTotals();
    const incomeByWorkplace = params.workplaces.map((workplace) => {
      const incomeItem = buildSummaryIncomeByWorkplaceItem({
        workplace,
        monthKey,
        actualPayrollByWorkplaceMonth: params.actualPayrollByWorkplaceMonth,
        getWorkplaceMonthSummary: params.getWorkplaceMonthSummary,
      });
      const hoursItem = buildSummaryHoursByWorkplaceItem({
        workplace,
        monthKey,
        getWorkplaceMonthSummary: params.getWorkplaceMonthSummary,
      });

      mergeIncomeTotals(totals, incomeItem);
      mergeHoursTotals(totals, hoursItem);
      const yearlyWorkplaceTotal = yearlyTotalsByWorkplace.get(workplace.id);
      if (!yearlyWorkplaceTotal) {
        throw new Error(`PAYROLL_WORKPLACE_TOTAL_NOT_FOUND: ${workplace.id}`);
      }
      mergeIncomeTotals(yearlyWorkplaceTotal, incomeItem);
      mergeHoursTotals(yearlyWorkplaceTotal, hoursItem);

      return incomeItem;
    });
    const hoursByWorkplace = params.workplaces.map((workplace) =>
      buildSummaryHoursByWorkplaceItem({
        workplace,
        monthKey,
        getWorkplaceMonthSummary: params.getWorkplaceMonthSummary,
      }),
    );

    mergeIncomeTotals(yearlyGrandTotals, totals);
    mergeHoursTotals(yearlyGrandTotals, totals);

    return {
      month: index + 1,
      monthKey,
      incomeByWorkplace,
      hoursByWorkplace,
      totals,
    };
  });

  return {
    year: params.year,
    workplaces: workplaceItems,
    months,
    yearlyTotals: {
      byWorkplace: params.workplaces.map((workplace) => {
        const total = yearlyTotalsByWorkplace.get(workplace.id);
        if (!total) {
          throw new Error(`PAYROLL_WORKPLACE_TOTAL_NOT_FOUND: ${workplace.id}`);
        }

        return total;
      }),
      grandTotals: yearlyGrandTotals,
    },
  };
}

export async function getPayrollSummaryCoreForUser(
  userId: string,
  month: Date,
): Promise<PayrollSummaryCoreResult> {
  const timing = createRequestTiming("payroll:getPayrollSummaryCoreForUser");

  try {
    const selectedMonth = startOfMonth(month);
    const selectedMonthKey = toMonthKey(selectedMonth);
    const {
      workplaces,
      periodByWorkplaceMonth,
      shiftsByWorkplace,
      rulesByWorkplace,
      actualPayrollByWorkplaceMonth,
    } = await timing.measure("snapshot", () =>
      loadPayrollSnapshot({
        userId,
        monthDates: [selectedMonth],
        includeActualPayroll: true,
      }),
    );

    const getWorkplaceMonthSummary = await timing.measure(
      "summaryGetterBuild",
      () =>
        createPayrollPeriodSummaryGetter<WorkplacePeriodSummary>({
          periodByWorkplaceMonth,
          summarize: (workplaceId, period) =>
            summarizeWorkplaceByPeriod(
              workplaceId,
              period,
              shiftsByWorkplace,
              rulesByWorkplace,
            ),
        }),
    );

    return timing.measure("summaryBuild", () =>
      buildPayrollSummaryCore({
        monthKey: selectedMonthKey,
        workplaces,
        periodByWorkplaceMonth,
        actualPayrollByWorkplaceMonth,
        getWorkplaceMonthSummary,
      }),
    );
  } finally {
    timing.flushLog();
  }
}

export async function getPayrollSummaryYearContextForUser(
  userId: string,
  month: Date,
): Promise<PayrollSummaryYearContextResult> {
  const timing = createRequestTiming(
    "payroll:getPayrollSummaryYearContextForUser",
  );

  try {
    const selectedMonth = startOfMonth(month);
    const selectedMonthKey = toMonthKey(selectedMonth);
    const {
      workplaces,
      periodByWorkplaceMonth,
      shiftsByWorkplace,
      rulesByWorkplace,
      actualPayrollByWorkplaceMonth,
    } = await timing.measure("snapshot", () =>
      loadPayrollSnapshot({
        userId,
        monthDates: listMonthsInYear(selectedMonth),
        includeActualPayroll: true,
      }),
    );

    if (workplaces.length === 0) {
      return createEmptyPayrollSummaryYearContext(selectedMonthKey);
    }

    const getWorkplaceMonthSummary = await timing.measure(
      "summaryGetterBuild",
      () =>
        createPayrollPeriodSummaryGetter<WorkplacePeriodSummary>({
          periodByWorkplaceMonth,
          summarize: (workplaceId, period) =>
            summarizeWorkplaceByPeriod(
              workplaceId,
              period,
              shiftsByWorkplace,
              rulesByWorkplace,
            ),
        }),
    );

    return timing.measure("summaryBuild", () =>
      buildPayrollSummaryYearContext({
        selectedMonth,
        workplaces,
        actualPayrollByWorkplaceMonth,
        getWorkplaceMonthSummary,
      }),
    );
  } finally {
    timing.flushLog();
  }
}

export async function getPayrollSummaryAmountForUser(
  userId: string,
  month: Date,
): Promise<PayrollSummaryAmountResult> {
  const timing = createRequestTiming("payroll:getPayrollSummaryAmountForUser");

  try {
    const selectedMonth = startOfMonth(month);
    const selectedMonthKey = toMonthKey(selectedMonth);
    const {
      workplaces,
      periodByWorkplaceMonth,
      shiftsByWorkplace,
      rulesByWorkplace,
      actualPayrollByWorkplaceMonth,
    } = await timing.measure("snapshot", () =>
      loadPayrollSnapshot({
        userId,
        monthDates: [selectedMonth],
        includeActualPayroll: true,
      }),
    );

    if (workplaces.length === 0) {
      return createEmptyPayrollSummaryAmount(selectedMonthKey);
    }

    const getWorkplaceMonthSummary = await timing.measure(
      "summaryGetterBuild",
      () =>
        createPayrollPeriodSummaryGetter<WorkplacePeriodSummary>({
          periodByWorkplaceMonth,
          summarize: (workplaceId, period) =>
            summarizeWorkplaceByPeriod(
              workplaceId,
              period,
              shiftsByWorkplace,
              rulesByWorkplace,
            ),
        }),
    );

    return timing.measure("summaryBuild", () =>
      buildPayrollSummaryAmount({
        monthKey: selectedMonthKey,
        workplaces,
        actualPayrollByWorkplaceMonth,
        getWorkplaceMonthSummary,
      }),
    );
  } finally {
    timing.flushLog();
  }
}

export async function getPayrollSummaryForUser(
  userId: string,
  year: number,
): Promise<PayrollSummaryResult> {
  const timing = createRequestTiming("payroll:getPayrollSummaryForUser");

  try {
    const months = listMonthDatesInYear(year);
    const {
      workplaces,
      periodByWorkplaceMonth,
      shiftsByWorkplace,
      rulesByWorkplace,
      actualPayrollByWorkplaceMonth,
    } = await timing.measure("snapshot", () =>
      loadPayrollSnapshot({
        userId,
        monthDates: months,
        includeActualPayroll: true,
      }),
    );

    if (workplaces.length === 0) {
      return createEmptyPayrollSummaryResult(year);
    }

    const getWorkplaceMonthSummary = await timing.measure(
      "summaryGetterBuild",
      () =>
        createPayrollPeriodSummaryGetter<WorkplacePeriodSummary>({
          periodByWorkplaceMonth,
          summarize: (workplaceId, period) =>
            summarizeWorkplaceByPeriod(
              workplaceId,
              period,
              shiftsByWorkplace,
              rulesByWorkplace,
            ),
        }),
    );

    return timing.measure("summaryBuild", () =>
      buildPayrollSummaryResult({
        year,
        workplaces,
        actualPayrollByWorkplaceMonth,
        getWorkplaceMonthSummary,
      }),
    );
  } finally {
    timing.flushLog();
  }
}

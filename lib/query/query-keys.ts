type MonthShiftsQueryInput = {
  userId: string;
  startDate: string;
  endDate: string;
  includeEstimate: boolean;
};

type PayrollSummaryQueryInput = {
  userId: string;
  year: number;
};

type PayrollSummaryYearContextQueryInput = {
  userId: string;
  month: string;
};

type PayrollSummaryAmountQueryInput = {
  userId: string;
  month: string;
};

type PayrollPreviewBaselineQueryInput = {
  userId: string;
  months: string[];
};

type PayrollAnnualPreviewQueryInput = {
  userId: string;
  years: number[];
};

type ActualPayrollQueryInput = {
  userId: string;
  month: string;
};

type ShiftDetailQueryInput = {
  shiftId: string;
};

type PayrollDetailsMonthlyQueryInput = {
  userId: string;
  month: string;
};

type PayrollDetailsWorkplaceYearlyQueryInput = {
  userId: string;
  workplaceId: string;
  year: number;
};

type WorkplacesListQueryInput = {
  userId: string;
  includeCounts: boolean;
};

type WorkplaceDetailSummaryQueryInput = {
  workplaceId: string;
};

type WorkplaceEditDetailQueryInput = {
  workplaceId: string;
};

type WorkplacePayrollRulesQueryInput = {
  workplaceId: string;
};

type WorkplacePayrollRuleDetailQueryInput = {
  workplaceId: string;
  ruleId: string;
};

type WorkplaceTimetablesQueryInput = {
  workplaceId: string;
};

type WorkplaceShiftFormBootstrapQueryInput = {
  userId: string;
  selectedWorkplaceId: string | null;
};

function normalizeMonths(months: string[]): string[] {
  return Array.from(new Set(months)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizeYears(years: number[]): number[] {
  return Array.from(new Set(years)).sort((left, right) => left - right);
}

function normalizeCalendarIds(calendarIds: string[]): string[] {
  const normalizedIds = new Set<string>();

  for (const calendarId of calendarIds) {
    const normalizedId = calendarId.trim();
    if (normalizedId.length > 0) {
      normalizedIds.add(normalizedId);
    }
  }

  return Array.from(normalizedIds);
}

type CalendarSelectionMode = "default" | "custom";

const shiftQueryKeys = {
  all: () => ["shifts"] as const,
  monthScope: () => [...shiftQueryKeys.all(), "month"] as const,
  month: (input: MonthShiftsQueryInput) =>
    [...shiftQueryKeys.monthScope(), input] as const,
  detail: (input: ShiftDetailQueryInput) =>
    [...shiftQueryKeys.all(), "detail", input] as const,
  unconfirmed: (input: { userId: string; initialDataVersion: string }) =>
    [...shiftQueryKeys.all(), "unconfirmed", input] as const,
  unconfirmedCount: (input: { userId: string; initialDataVersion: string }) =>
    [...shiftQueryKeys.all(), "unconfirmedCount", input] as const,
};

const payrollQueryKeys = {
  all: () => ["payroll"] as const,
  summaryScope: () => [...payrollQueryKeys.all(), "summary"] as const,
  actualScope: () => [...payrollQueryKeys.all(), "actual"] as const,
  previewBaselineScope: () =>
    [...payrollQueryKeys.all(), "previewBaseline"] as const,
  previewAnnualScope: () =>
    [...payrollQueryKeys.all(), "previewAnnual"] as const,
  detailsScope: () => [...payrollQueryKeys.all(), "details"] as const,
  summary: (input: PayrollSummaryQueryInput) =>
    [...payrollQueryKeys.summaryScope(), input] as const,
  summaryYearContext: (input: PayrollSummaryYearContextQueryInput) =>
    [...payrollQueryKeys.summaryScope(), "yearContext", input] as const,
  summaryAmount: (input: PayrollSummaryAmountQueryInput) =>
    [...payrollQueryKeys.summaryScope(), "amount", input] as const,
  actual: (input: ActualPayrollQueryInput) =>
    [...payrollQueryKeys.actualScope(), input] as const,
  previewBaseline: (input: PayrollPreviewBaselineQueryInput) =>
    [
      ...payrollQueryKeys.previewBaselineScope(),
      {
        userId: input.userId,
        months: normalizeMonths(input.months),
      },
    ] as const,
  previewAnnual: (input: PayrollAnnualPreviewQueryInput) =>
    [
      ...payrollQueryKeys.previewAnnualScope(),
      { userId: input.userId, years: normalizeYears(input.years) },
    ] as const,
  detailsMonthly: (input: PayrollDetailsMonthlyQueryInput) =>
    [...payrollQueryKeys.detailsScope(), "monthly", input] as const,
  detailsWorkplaceYearly: (input: PayrollDetailsWorkplaceYearlyQueryInput) =>
    [...payrollQueryKeys.detailsScope(), "workplaceYearly", input] as const,
};

const workplaceQueryKeys = {
  all: () => ["workplaces"] as const,
  shiftFormBootstrapScope: () =>
    [...workplaceQueryKeys.all(), "shiftFormBootstrap"] as const,
  payrollRuleDetailScope: () =>
    [...workplaceQueryKeys.all(), "payrollRuleDetail"] as const,
  list: (input: WorkplacesListQueryInput) =>
    [...workplaceQueryKeys.all(), "list", input] as const,
  detailSummary: (input: WorkplaceDetailSummaryQueryInput) =>
    [...workplaceQueryKeys.all(), "detailSummary", input] as const,
  editDetail: (input: WorkplaceEditDetailQueryInput) =>
    [...workplaceQueryKeys.all(), "editDetail", input] as const,
  payrollRules: (input: WorkplacePayrollRulesQueryInput) =>
    [...workplaceQueryKeys.all(), "payrollRules", input] as const,
  payrollRuleDetail: (input: WorkplacePayrollRuleDetailQueryInput) =>
    [...workplaceQueryKeys.payrollRuleDetailScope(), input] as const,
  timetables: (input: WorkplaceTimetablesQueryInput) =>
    [...workplaceQueryKeys.all(), "timetables", input] as const,
  shiftFormBootstrap: (input: WorkplaceShiftFormBootstrapQueryInput) =>
    [...workplaceQueryKeys.shiftFormBootstrapScope(), input] as const,
};

export const queryKeys = {
  users: {
    me: () => ["users", "me"] as const,
  },
  shifts: shiftQueryKeys,
  payroll: payrollQueryKeys,
  workplaces: workplaceQueryKeys,
  calendar: {
    googleEvents: (
      month: string,
      selectionMode: CalendarSelectionMode,
      calendarIds: string[],
    ) =>
      [
        "bulk-google-calendar-events",
        month,
        selectionMode,
        selectionMode === "custom"
          ? normalizeCalendarIds(calendarIds).join(",")
          : "default",
      ] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;

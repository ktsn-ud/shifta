type MonthShiftsQueryInput = {
  userId: string;
  startDate: string;
  endDate: string;
  includeEstimate: boolean;
};

type PayrollSummaryQueryInput = {
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

type WorkplaceDetailQueryInput = {
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

export const queryKeys = {
  shifts: {
    month: (input: MonthShiftsQueryInput) =>
      ["shifts", "month", input] as const,
    detail: (input: ShiftDetailQueryInput) =>
      ["shifts", "detail", input] as const,
    unconfirmed: (input: { userId: string }) =>
      ["shifts", "unconfirmed", input] as const,
    confirmedCurrentMonth: (input: { userId: string }) =>
      ["shifts", "confirmedCurrentMonth", input] as const,
  },
  payroll: {
    summary: (input: PayrollSummaryQueryInput) =>
      ["payroll", "summary", input] as const,
    detailsMonthly: (input: PayrollDetailsMonthlyQueryInput) =>
      ["payroll", "details", "monthly", input] as const,
    detailsWorkplaceYearly: (input: PayrollDetailsWorkplaceYearlyQueryInput) =>
      ["payroll", "details", "workplaceYearly", input] as const,
  },
  workplaces: {
    list: (input: WorkplacesListQueryInput) =>
      ["workplaces", "list", input] as const,
    detail: (input: WorkplaceDetailQueryInput) =>
      ["workplaces", "detail", input] as const,
    payrollRules: (input: WorkplacePayrollRulesQueryInput) =>
      ["workplaces", "payrollRules", input] as const,
    payrollRuleDetail: (input: WorkplacePayrollRuleDetailQueryInput) =>
      ["workplaces", "payrollRuleDetail", input] as const,
    timetables: (input: WorkplaceTimetablesQueryInput) =>
      ["workplaces", "timetables", input] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;

import type { SyncResponsePayload } from "@/lib/google-calendar/sync-response";

type ActionExtra = object;

export type ActionError = {
  error: string;
  details?: unknown;
};

export type ActionSuccess<
  TData,
  TExtra extends ActionExtra = Record<never, never>,
> = {
  data: TData;
  sync: SyncResponsePayload;
} & TExtra;

export type ActionResult<
  TData,
  TExtra extends ActionExtra = Record<never, never>,
> = ActionError | ActionSuccess<TData, TExtra>;

export type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";

export type WorkplaceActionData = {
  id: string;
  type: WorkplaceType;
};

export type WorkplaceDeletedActionData = DeletedActionData & {
  relatedCounts: {
    shifts: number;
    payrollRules: number;
    timetableSets: number;
    actualPayrolls: number;
  };
};

export type PayrollRuleActionData = {
  id: string;
  workplaceId: string;
};

export type TimetableSetActionData = {
  id: string;
  workplaceId: string;
};

export type DeletedActionData = {
  id: string;
  deleted: true;
};

export type DeletedWorkplaceActionData = WorkplaceDeletedActionData;

export type PayrollRuleWarning = {
  message: string;
  overlappingRuleIds: string[];
};

export type CreateWorkplaceActionResult = ActionResult<
  WorkplaceActionData,
  { initialPayrollRule: PayrollRuleActionData | null }
>;

export type UpdateWorkplaceActionResult = ActionResult<WorkplaceActionData>;

export type DeleteWorkplaceActionResult = ActionResult<
  WorkplaceDeletedActionData,
  { warning: string | null }
>;

export type CreatePayrollRuleActionResult = ActionResult<
  PayrollRuleActionData,
  { warning: PayrollRuleWarning | null }
>;

export type UpdatePayrollRuleActionResult = CreatePayrollRuleActionResult;

export type DeletePayrollRuleActionResult = ActionResult<DeletedActionData>;

export type CreateTimetableActionResult = ActionResult<
  TimetableSetActionData | TimetableSetActionData[]
>;

export type UpdateTimetableActionResult = ActionResult<TimetableSetActionData>;

export type DeleteTimetableActionResult = ActionResult<DeletedActionData>;

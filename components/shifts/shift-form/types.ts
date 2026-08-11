import type {
  PayrollRuleListItem,
  TimetableSetItem as WorkplaceTimetableSet,
  WorkplaceDetailItem,
  WorkplaceEditDetailItem,
} from "@/lib/query/queries/workplaces";

export type ShiftType = "NORMAL" | "LESSON";
export type ShiftFormReturnTo = "dashboard" | "list";
export type Workplace = WorkplaceDetailItem;
export type WorkplacePayrollCycleDetail = WorkplaceEditDetailItem;
export type PreviewPayrollRule = PayrollRuleListItem;
export type TimetableSet = WorkplaceTimetableSet;
export type TimetableSetItem = TimetableSet["items"][number];

export type ShiftListItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type ShiftDetail = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftType: ShiftType;
  comment: string | null;
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

export type FormState = {
  workplaceId: string;
  date: string;
  shiftType: ShiftType;
  comment: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  timetableSetId: string;
  startPeriod: string;
  endPeriod: string;
};

export type FormErrorKey =
  | "workplaceId"
  | "date"
  | "shiftType"
  | "comment"
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "timetableSetId"
  | "startPeriod"
  | "endPeriod"
  | "form";

export type FormErrors = Partial<Record<FormErrorKey, string>>;

export type ShiftTimePair = {
  startTime: string;
  endTime: string;
};

export type CreateShiftFormProps = {
  mode: "create";
  initialDate: string;
  returnMonth?: string;
  returnTo?: ShiftFormReturnTo;
};

export type EditShiftFormProps = {
  mode: "edit";
  shiftId: string;
  returnMonth?: string;
  returnTo?: ShiftFormReturnTo;
};

export type ShiftFormProps = CreateShiftFormProps | EditShiftFormProps;

export type ValidateShiftFormResult = {
  errors: FormErrors;
  candidateTimes: ShiftTimePair | null;
};

export type ShiftMutationPayload = {
  workplaceId: string;
  date: string;
  shiftType: ShiftType;
  comment: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  lessonRange?: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  };
};

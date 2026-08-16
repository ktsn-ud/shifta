import type {
  TimetableSetItem as WorkplaceTimetableSet,
  WorkplaceDetailItem,
} from "@/lib/query/queries/workplaces";

export type ShiftType = "NORMAL" | "LESSON";

export type Workplace = WorkplaceDetailItem;
export type TimetableSet = WorkplaceTimetableSet;

export type BulkShiftRow = {
  date: string;
  shiftType: ShiftType;
  comment: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  transportationAllowance: string;
  timetableSetId: string;
  startPeriod: string;
  endPeriod: string;
};

export type BulkDefaults = Omit<BulkShiftRow, "date">;

export type RowErrorKey =
  | "shiftType"
  | "comment"
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "transportationAllowance"
  | "timetableSetId"
  | "startPeriod"
  | "endPeriod";

export type RowErrors = Partial<Record<RowErrorKey, string>>;

export type FormErrors = {
  workplaceId?: string;
  selectedDates?: string;
  form?: string;
  rows?: Record<string, RowErrors>;
};

export type BulkShiftValidationErrorSummary = {
  errorCount: number;
  failedDateKeys: string[];
  firstErrorMessage: string;
};

export type NormalShiftPayload = {
  date: string;
  shiftType: "NORMAL";
  comment: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  transportationAllowance: number;
};

export type LessonShiftPayload = {
  date: string;
  shiftType: "LESSON";
  comment: string;
  breakMinutes: number;
  transportationAllowance: number;
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  };
};

export type BulkShiftPayload = NormalShiftPayload | LessonShiftPayload;

export type OvernightSummaryItem = {
  date: string;
  startTime: string;
  endTime: string;
  startDateLabel: string;
  endDateLabel: string;
};

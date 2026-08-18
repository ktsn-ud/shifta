import type { MonthShift } from "@/hooks/use-month-shifts";
import type {
  PreviewPayrollRule,
  PreviewWorkplace,
} from "@/lib/payroll/preview";

export type TimetableSet = {
  id: string;
  workplaceId: string;
  name: string;
  periods: Array<{ period: number; startTime: string; endTime: string }>;
};

export type Draft = {
  startTime: string;
  endTime: string;
  breakMinutes: string;
  transportationAllowance: string;
  comment: string;
  timetableSetId: string;
  startPeriod: string;
  endPeriod: string;
};

export type BulkShiftEditPageClientProps = {
  currentUserId: string;
  initialMonth: string;
  initialShifts: MonthShift[];
  initialStartDate: string;
  initialEndDate: string;
  timetableSets: TimetableSet[];
  previewWorkplaces: PreviewWorkplace[];
  previewPayrollRules: PreviewPayrollRule[];
};

import type { MonthShift } from "@/hooks/use-month-shifts";
import { resolveLessonTimeRangeFromRows } from "@/lib/shifts/lesson-time-range";
import type { PreviewShiftInput } from "@/lib/payroll/preview";
import { dateKeyFromApiDate } from "@/lib/calendar/date";
import type {
  Draft,
  TimetableSet,
} from "@/components/shifts/bulk-shift-edit-types";

export function time(value: string) {
  return value.slice(11, 16);
}

export function createDraft(shift: MonthShift): Draft {
  return {
    startTime: time(shift.startTime),
    endTime: time(shift.endTime),
    breakMinutes: String(shift.breakMinutes),
    transportationAllowance: String(shift.transportationAllowance),
    comment: shift.comment ?? "",
    timetableSetId: shift.lessonRange?.timetableSetId ?? "",
    startPeriod: String(shift.lessonRange?.startPeriod ?? ""),
    endPeriod: String(shift.lessonRange?.endPeriod ?? ""),
  };
}

export function draftChanged(shift: MonthShift, draft: Draft) {
  return JSON.stringify(createDraft(shift)) !== JSON.stringify(draft);
}

export function draftFieldsChanged(
  shift: MonthShift,
  draft: Draft,
  fields: readonly (keyof Draft)[],
) {
  const initialDraft = createDraft(shift);
  return fields.some((field) => draft[field] !== initialDraft[field]);
}

export function getLessonDerivedValues(
  timetableSet: TimetableSet | undefined,
  draft: Draft,
): { startTime: string; endTime: string; breakMinutes: number } | null {
  const startPeriod = Number(draft.startPeriod);
  const endPeriod = Number(draft.endPeriod);
  if (
    !timetableSet ||
    !Number.isInteger(startPeriod) ||
    !Number.isInteger(endPeriod) ||
    startPeriod > endPeriod
  ) {
    return null;
  }

  const periods = [] as Array<{
    period: number;
    startTime: Date;
    endTime: Date;
  }>;
  for (const period of timetableSet.periods) {
    if (period.period >= startPeriod && period.period <= endPeriod) {
      periods.push({
        period: period.period,
        startTime: new Date(period.startTime),
        endTime: new Date(period.endTime),
      });
    }
  }

  try {
    const value = resolveLessonTimeRangeFromRows(
      { startPeriod, endPeriod },
      periods,
    );
    return {
      startTime: time(value.startTime.toISOString()),
      endTime: time(value.endTime.toISOString()),
      breakMinutes: value.breakMinutes,
    };
  } catch {
    return null;
  }
}

export function getEndPeriods(
  periods: TimetableSet["periods"] | undefined,
  startPeriod: string,
) {
  if (!periods) return [];

  const minimumPeriod = Number(startPeriod);
  const result: TimetableSet["periods"] = [];
  for (const period of periods) {
    if (period.period >= minimumPeriod) result.push(period);
  }
  return result;
}

export function createBulkEditPreviewShiftInputs(
  shifts: MonthShift[],
  drafts: Map<string, Draft>,
): { beforeShifts: PreviewShiftInput[]; afterShifts: PreviewShiftInput[] } {
  const beforeShifts: PreviewShiftInput[] = [];
  const afterShifts: PreviewShiftInput[] = [];

  for (const shift of shifts) {
    const draft = drafts.get(shift.id);
    if (!draft || !draftChanged(shift, draft)) continue;
    const common = {
      temporaryId: shift.id,
      workplaceId: shift.workplaceId,
      date: dateKeyFromApiDate(shift.date),
      shiftType: shift.shiftType,
    } as const;
    beforeShifts.push(
      shift.shiftType === "NORMAL"
        ? {
            ...common,
            startTime: time(shift.startTime),
            endTime: time(shift.endTime),
            breakMinutes: shift.breakMinutes,
            transportationAllowance: shift.transportationAllowance,
          }
        : {
            ...common,
            lessonRange: {
              timetableSetId: shift.lessonRange?.timetableSetId,
              startPeriod: shift.lessonRange?.startPeriod,
              endPeriod: shift.lessonRange?.endPeriod,
            },
            transportationAllowance: shift.transportationAllowance,
          },
    );
    afterShifts.push(
      shift.shiftType === "NORMAL"
        ? {
            ...common,
            startTime: draft.startTime,
            endTime: draft.endTime,
            breakMinutes: Number(draft.breakMinutes),
            transportationAllowance: Number(draft.transportationAllowance),
          }
        : {
            ...common,
            lessonRange: {
              timetableSetId: draft.timetableSetId,
              startPeriod: Number(draft.startPeriod),
              endPeriod: Number(draft.endPeriod),
            },
            transportationAllowance: Number(draft.transportationAllowance),
          },
    );
  }

  return { beforeShifts, afterShifts };
}

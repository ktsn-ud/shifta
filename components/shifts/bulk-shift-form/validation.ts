import { TIME_ONLY_REGEX } from "@/lib/api/date-time";
import {
  getShiftEndDate,
  isOvernightShift,
  isSameTimeShift,
} from "@/lib/shifts/time";
import { formatSelectedDate } from "@/components/shifts/bulk-shift-form/view-helpers";
import {
  calculateGrossMinutes,
  getBreakMinutesValidationError,
} from "@/lib/shifts/break-validation";
import { resolveLessonTimeRangeFromRows } from "@/lib/shifts/lesson-time-range";
import {
  BULK_SHIFT_LIMIT_MESSAGE,
  MAX_BULK_SHIFT_COUNT,
  MAX_TIMETABLE_PERIOD,
  TIMETABLE_PERIOD_LIMIT_MESSAGE,
} from "@/lib/validation/batch-limits";
import {
  getTransportationAllowanceValidationError,
  normalizeTransportationAllowance,
} from "@/lib/shifts/transportation-allowance";
import type {
  BulkShiftPayload,
  BulkShiftRow,
  BulkShiftValidationErrorSummary,
  FormErrors,
  OvernightSummaryItem,
  RowErrorKey,
  RowErrors,
  TimetableSet,
  Workplace,
} from "@/components/shifts/bulk-shift-form/types";

const ROW_ERROR_FIELD_LABELS: Record<RowErrorKey, string> = {
  shiftType: "シフトタイプ",
  comment: "コメント",
  startTime: "開始時刻",
  endTime: "終了時刻",
  breakMinutes: "休憩時間",
  transportationAllowance: "交通費",
  timetableSetId: "時間割セット",
  startPeriod: "開始コマ",
  endPeriod: "終了コマ",
};
const LESSON_TIMETABLE_ERROR = "塾の授業は時間割が登録されていません。";

function getRowFieldId(dateKey: string, field: RowErrorKey) {
  const suffixByField: Record<RowErrorKey, string> = {
    shiftType: "shift-normal",
    comment: "comment",
    startTime: "start-time",
    endTime: "end-time",
    breakMinutes: "break",
    transportationAllowance: "transportation-allowance",
    timetableSetId: "timetable-set",
    startPeriod: "start-period",
    endPeriod: "end-period",
  };

  return dateKey + "-" + suffixByField[field];
}

export function getFirstInvalidFieldId(errors: FormErrors) {
  if (errors.workplaceId) return "bulk-workplace";
  if (errors.selectedDates) return "bulk-calendar-grid";

  for (const [dateKey, rowErrors] of Object.entries(errors.rows ?? {})) {
    const field = (Object.keys(rowErrors) as RowErrorKey[]).find((key) =>
      Boolean(rowErrors[key]),
    );
    if (field) return getRowFieldId(dateKey, field);
  }

  return null;
}

export function getBulkShiftValidationErrorSummary(
  errors: FormErrors,
): BulkShiftValidationErrorSummary | null {
  const rowErrorEntries = Object.entries(errors.rows ?? {}).filter(
    ([, rowErrors]) => Object.values(rowErrors).some(Boolean),
  );
  const rowErrorCount = rowErrorEntries.reduce(
    (count, [, rowErrors]) =>
      count + Object.values(rowErrors).filter(Boolean).length,
    0,
  );
  const errorCount =
    rowErrorCount +
    Number(Boolean(errors.workplaceId)) +
    Number(Boolean(errors.selectedDates));

  if (errorCount === 0) return null;

  const firstRowError = rowErrorEntries
    .flatMap(([dateKey, rowErrors]) =>
      (Object.keys(rowErrors) as RowErrorKey[]).flatMap((field) => {
        const message = rowErrors[field];
        return message
          ? [
              formatSelectedDate(dateKey) +
                "の" +
                ROW_ERROR_FIELD_LABELS[field] +
                ": " +
                message,
            ]
          : [];
      }),
    )
    .at(0);

  return {
    errorCount,
    failedDateKeys: rowErrorEntries.map(([dateKey]) => dateKey),
    firstErrorMessage:
      errors.workplaceId ??
      errors.selectedDates ??
      firstRowError ??
      "入力内容を確認してください。",
  };
}

function hasRowErrors(errors: RowErrors): boolean {
  return Object.keys(errors).length > 0;
}

function getLessonBreakMinutesValidationError(input: {
  timetableSets: TimetableSet[];
  timetableSetId: string;
  startPeriod: number;
  endPeriod: number;
}): string | null {
  const timetableSet = input.timetableSets.find(
    (set) => set.id === input.timetableSetId,
  );
  if (!timetableSet) {
    return null;
  }

  const itemByPeriod = new Map(
    timetableSet.items.map((item) => [item.period, item]),
  );
  const timetableRows: Array<{
    period: number;
    startTime: Date;
    endTime: Date;
  }> = [];
  for (let period = input.startPeriod; period <= input.endPeriod; period += 1) {
    const item = itemByPeriod.get(period);
    if (!item) {
      return null;
    }
    timetableRows.push({
      period: item.period,
      startTime: new Date(item.startTime),
      endTime: new Date(item.endTime),
    });
  }

  try {
    const lessonTimeRange = resolveLessonTimeRangeFromRows(
      {
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod,
      },
      timetableRows,
    );
    return getBreakMinutesValidationError(
      lessonTimeRange.breakMinutes,
      calculateGrossMinutes(lessonTimeRange.startTime, lessonTimeRange.endTime),
    );
  } catch {
    return LESSON_TIMETABLE_ERROR;
  }
}

export function validateAndBuildPayload(params: {
  selectedWorkplaceId: string;
  selectedWorkplaceType: Workplace["type"] | undefined;
  selectedDateKeys: string[];
  rowsByDate: Record<string, BulkShiftRow>;
  lessonPeriodsBySetId: Record<string, number[]>;
  timetableSets?: TimetableSet[];
}):
  | {
      success: true;
      payload: BulkShiftPayload[];
      overnightSummaries: OvernightSummaryItem[];
    }
  | {
      success: false;
      errors: FormErrors;
    } {
  const {
    selectedWorkplaceId,
    selectedWorkplaceType,
    selectedDateKeys,
    rowsByDate,
    lessonPeriodsBySetId,
    timetableSets = [],
  } = params;
  const nextErrors: FormErrors = { rows: {} };

  if (!selectedWorkplaceId) {
    nextErrors.workplaceId = "勤務先を選択してください。";
  }

  if (selectedDateKeys.length === 0) {
    nextErrors.selectedDates = "1日以上選択してください。";
  } else if (selectedDateKeys.length > MAX_BULK_SHIFT_COUNT) {
    nextErrors.selectedDates = BULK_SHIFT_LIMIT_MESSAGE;
  }

  const payload: BulkShiftPayload[] = [];
  const overnightCandidates: OvernightSummaryItem[] = [];

  for (const dateKey of selectedDateKeys) {
    const row = rowsByDate[dateKey];
    const rowErrors: RowErrors = {};

    if (!row) {
      rowErrors.shiftType = "入力行の初期化に失敗しました。";
      nextErrors.rows![dateKey] = rowErrors;
      continue;
    }

    if (row.comment.length > 100) {
      rowErrors.comment = "コメントは100文字以内で入力してください。";
    }

    if (/[\r\n]/.test(row.comment)) {
      rowErrors.comment = "コメントに改行は使用できません。";
    }

    const transportationAllowanceError =
      getTransportationAllowanceValidationError(row.transportationAllowance);
    if (transportationAllowanceError) {
      rowErrors.transportationAllowance = transportationAllowanceError;
    }

    if (row.shiftType === "LESSON") {
      if (selectedWorkplaceType !== "CRAM_SCHOOL") {
        rowErrors.shiftType = "授業シフトは塾タイプ勤務先でのみ選択できます。";
      }

      if (!row.timetableSetId) {
        rowErrors.timetableSetId = "時間割セットを選択してください。";
      }

      const startPeriod = Number(row.startPeriod);
      const endPeriod = Number(row.endPeriod);
      const hasPeriodOverLimit =
        (Number.isInteger(startPeriod) && startPeriod > MAX_TIMETABLE_PERIOD) ||
        (Number.isInteger(endPeriod) && endPeriod > MAX_TIMETABLE_PERIOD);

      if (!Number.isInteger(startPeriod) || startPeriod <= 0) {
        rowErrors.startPeriod = "開始コマは1以上の整数で入力してください。";
      } else if (startPeriod > MAX_TIMETABLE_PERIOD) {
        rowErrors.startPeriod = TIMETABLE_PERIOD_LIMIT_MESSAGE;
      }

      if (!Number.isInteger(endPeriod) || endPeriod <= 0) {
        rowErrors.endPeriod = "終了コマは1以上の整数で入力してください。";
      } else if (endPeriod > MAX_TIMETABLE_PERIOD) {
        rowErrors.endPeriod = TIMETABLE_PERIOD_LIMIT_MESSAGE;
      }

      if (hasPeriodOverLimit) {
        nextErrors.rows![dateKey] = rowErrors;
        continue;
      }

      if (
        Number.isInteger(startPeriod) &&
        Number.isInteger(endPeriod) &&
        startPeriod > endPeriod
      ) {
        rowErrors.endPeriod = "コマ範囲は開始<=終了で指定してください。";
      }

      const periods = lessonPeriodsBySetId[row.timetableSetId] ?? [];
      if (periods.length === 0) {
        rowErrors.startPeriod = LESSON_TIMETABLE_ERROR;
      } else if (
        Number.isInteger(startPeriod) &&
        Number.isInteger(endPeriod) &&
        startPeriod <= endPeriod
      ) {
        const periodSet = new Set(periods);

        for (let period = startPeriod; period <= endPeriod; period += 1) {
          if (periodSet.has(period) === false) {
            rowErrors.endPeriod = LESSON_TIMETABLE_ERROR;
            break;
          }
        }
      }

      if (!hasRowErrors(rowErrors)) {
        const breakMinutesError = getLessonBreakMinutesValidationError({
          timetableSets,
          timetableSetId: row.timetableSetId,
          startPeriod,
          endPeriod,
        });
        if (breakMinutesError) {
          rowErrors.endPeriod = breakMinutesError;
        }
      }

      if (!hasRowErrors(rowErrors)) {
        payload.push({
          date: dateKey,
          shiftType: "LESSON",
          comment: row.comment,
          breakMinutes: 0,
          transportationAllowance: normalizeTransportationAllowance(
            row.transportationAllowance,
          ),
          lessonRange: {
            timetableSetId: row.timetableSetId,
            startPeriod,
            endPeriod,
          },
        });
      }
    } else {
      const breakMinutes = Number(row.breakMinutes);
      const basicBreakMinutesError = getBreakMinutesValidationError(
        breakMinutes,
        Number.POSITIVE_INFINITY,
      );
      if (basicBreakMinutesError) {
        rowErrors.breakMinutes = basicBreakMinutesError;
      }

      if (!TIME_ONLY_REGEX.test(row.startTime)) {
        rowErrors.startTime = "開始時刻はHH:MM形式で入力してください。";
      }

      if (!TIME_ONLY_REGEX.test(row.endTime)) {
        rowErrors.endTime = "終了時刻はHH:MM形式で入力してください。";
      }

      if (
        TIME_ONLY_REGEX.test(row.startTime) &&
        TIME_ONLY_REGEX.test(row.endTime) &&
        isSameTimeShift(row.startTime, row.endTime)
      ) {
        rowErrors.endTime = "開始時刻と終了時刻は同じ時刻にできません。";
      }

      if (
        !rowErrors.breakMinutes &&
        !rowErrors.endTime &&
        TIME_ONLY_REGEX.test(row.startTime) &&
        TIME_ONLY_REGEX.test(row.endTime)
      ) {
        const breakMinutesError = getBreakMinutesValidationError(
          breakMinutes,
          calculateGrossMinutes(row.startTime, row.endTime),
        );
        if (breakMinutesError) {
          rowErrors.breakMinutes = breakMinutesError;
        }
      }

      if (!hasRowErrors(rowErrors)) {
        if (isOvernightShift(row.startTime, row.endTime)) {
          overnightCandidates.push({
            date: dateKey,
            startTime: row.startTime,
            endTime: row.endTime,
            startDateLabel: formatSelectedDate(dateKey),
            endDateLabel: formatSelectedDate(
              getShiftEndDate(dateKey, row.startTime, row.endTime),
            ),
          });
        }

        payload.push({
          date: dateKey,
          shiftType: row.shiftType,
          comment: row.comment,
          startTime: row.startTime,
          endTime: row.endTime,
          breakMinutes,
          transportationAllowance: normalizeTransportationAllowance(
            row.transportationAllowance,
          ),
        });
      }
    }

    if (hasRowErrors(rowErrors)) {
      nextErrors.rows![dateKey] = rowErrors;
    }
  }

  if (Object.keys(nextErrors.rows ?? {}).length === 0) {
    delete nextErrors.rows;
  }

  if (payload.length > MAX_BULK_SHIFT_COUNT) {
    nextErrors.selectedDates = BULK_SHIFT_LIMIT_MESSAGE;
  }

  if (nextErrors.workplaceId || nextErrors.selectedDates || nextErrors.rows) {
    return { success: false, errors: nextErrors };
  }

  return {
    success: true,
    payload,
    overnightSummaries: overnightCandidates,
  };
}

import { TIME_ONLY_REGEX } from "@/lib/api/date-time";
import {
  getShiftEndDate,
  isOvernightShift,
  isSameTimeShift,
} from "@/lib/shifts/time";
import {
  formatSelectedDate,
  MAX_BREAK_MINUTES,
} from "@/components/shifts/bulk-shift-form/view-helpers";
import type {
  BulkShiftPayload,
  BulkShiftRow,
  BulkShiftValidationErrorSummary,
  FormErrors,
  OvernightSummaryItem,
  RowErrorKey,
  RowErrors,
  Workplace,
} from "@/components/shifts/bulk-shift-form/types";

const ROW_ERROR_FIELD_LABELS: Record<RowErrorKey, string> = {
  shiftType: "シフトタイプ",
  comment: "コメント",
  startTime: "開始時刻",
  endTime: "終了時刻",
  breakMinutes: "休憩時間",
  timetableSetId: "時間割セット",
  startPeriod: "開始コマ",
  endPeriod: "終了コマ",
};

function getRowFieldId(dateKey: string, field: RowErrorKey) {
  const suffixByField: Record<RowErrorKey, string> = {
    shiftType: "shift-normal",
    comment: "comment",
    startTime: "start-time",
    endTime: "end-time",
    breakMinutes: "break",
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

export function validateAndBuildPayload(params: {
  selectedWorkplaceId: string;
  selectedWorkplaceType: Workplace["type"] | undefined;
  selectedDateKeys: string[];
  rowsByDate: Record<string, BulkShiftRow>;
  lessonPeriodsBySetId: Record<string, number[]>;
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
  } = params;
  const nextErrors: FormErrors = { rows: {} };

  if (!selectedWorkplaceId) {
    nextErrors.workplaceId = "勤務先を選択してください。";
  }

  if (selectedDateKeys.length === 0) {
    nextErrors.selectedDates = "1日以上選択してください。";
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

    if (row.shiftType === "LESSON") {
      if (selectedWorkplaceType !== "CRAM_SCHOOL") {
        rowErrors.shiftType = "授業シフトは塾タイプ勤務先でのみ選択できます。";
      }

      if (!row.timetableSetId) {
        rowErrors.timetableSetId = "時間割セットを選択してください。";
      }

      const startPeriod = Number(row.startPeriod);
      const endPeriod = Number(row.endPeriod);

      if (!Number.isInteger(startPeriod) || startPeriod <= 0) {
        rowErrors.startPeriod = "開始コマは1以上の整数で入力してください。";
      }

      if (!Number.isInteger(endPeriod) || endPeriod <= 0) {
        rowErrors.endPeriod = "終了コマは1以上の整数で入力してください。";
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
        rowErrors.startPeriod = "塾の授業は時間割が登録されていません。";
      } else if (
        Number.isInteger(startPeriod) &&
        Number.isInteger(endPeriod) &&
        startPeriod <= endPeriod
      ) {
        const periodSet = new Set(periods);

        for (let period = startPeriod; period <= endPeriod; period += 1) {
          if (periodSet.has(period) === false) {
            rowErrors.endPeriod = "塾の授業は時間割が登録されていません。";
            break;
          }
        }
      }

      if (!hasRowErrors(rowErrors)) {
        payload.push({
          date: dateKey,
          shiftType: "LESSON",
          comment: row.comment,
          breakMinutes: 0,
          lessonRange: {
            timetableSetId: row.timetableSetId,
            startPeriod,
            endPeriod,
          },
        });
      }
    } else {
      const breakMinutes = Number(row.breakMinutes);
      if (!Number.isInteger(breakMinutes)) {
        rowErrors.breakMinutes = "休憩時間は整数で入力してください。";
      } else if (breakMinutes < 0 || breakMinutes > MAX_BREAK_MINUTES) {
        rowErrors.breakMinutes = "休憩時間は0〜240分で入力してください。";
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

  if (nextErrors.workplaceId || nextErrors.selectedDates || nextErrors.rows) {
    return { success: false, errors: nextErrors };
  }

  return {
    success: true,
    payload,
    overnightSummaries: overnightCandidates,
  };
}

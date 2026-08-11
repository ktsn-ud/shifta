import { dateKeyFromApiDate } from "@/lib/calendar/date";
import {
  isOvernightShift,
  isSameTimeShift,
  shiftDateKeyAddDays,
  toComparableShiftRange,
} from "@/lib/shifts/time";
import { parseShiftListResponse, toTimeOnly } from "./response";
import type {
  FormErrors,
  FormState,
  ShiftFormProps,
  ShiftMutationPayload,
  ShiftTimePair,
  ShiftType,
  TimetableSet,
  TimetableSetItem,
  ValidateShiftFormResult,
  Workplace,
} from "./types";

export function findSetById(
  timetableSets: TimetableSet[],
  timetableSetId: string,
): TimetableSet | null {
  return timetableSets.find((set) => set.id === timetableSetId) ?? null;
}

function resolveLessonTimeRange(
  timetableSet: TimetableSet | null,
  startPeriod: number,
  endPeriod: number,
): ShiftTimePair | null {
  if (!timetableSet || startPeriod > endPeriod) {
    return null;
  }

  const itemByPeriod = new Map<number, TimetableSetItem>();
  for (const item of timetableSet.items) {
    itemByPeriod.set(item.period, item);
  }

  for (let period = startPeriod; period <= endPeriod; period += 1) {
    if (!itemByPeriod.has(period)) {
      return null;
    }
  }

  const first = itemByPeriod.get(startPeriod);
  const last = itemByPeriod.get(endPeriod);
  if (!first || !last) {
    return null;
  }

  const startTime = first.startTimeLabel ?? toTimeOnly(first.startTime);
  const endTime = last.endTimeLabel ?? toTimeOnly(last.endTime);
  if (!startTime || !endTime) {
    return null;
  }

  return { startTime, endTime };
}

export function validateShiftForm(params: {
  form: FormState;
  selectedWorkplace: Workplace | undefined;
  timetableSets: TimetableSet[];
}): ValidateShiftFormResult {
  const { form, selectedWorkplace, timetableSets } = params;
  const nextErrors: FormErrors = {};

  if (!form.workplaceId) {
    nextErrors.workplaceId = "勤務先を選択してください。";
  }

  if (!form.date) {
    nextErrors.date = "日付を選択してください。";
  }

  if (form.comment.length > 100) {
    nextErrors.comment = "コメントは100文字以内で入力してください";
  }

  if (/[\r\n]/.test(form.comment)) {
    nextErrors.comment = "コメントに改行は使用できません";
  }

  if (form.shiftType === "LESSON") {
    if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
      nextErrors.shiftType = "授業シフトは塾タイプ勤務先でのみ選択できます";
    }

    if (!form.timetableSetId) {
      nextErrors.timetableSetId = "時間割セットを選択してください。";
    }

    if (!form.startPeriod) {
      nextErrors.startPeriod = "開始コマを選択してください。";
    }

    if (!form.endPeriod) {
      nextErrors.endPeriod = "終了コマを選択してください。";
    }

    const startPeriod = Number(form.startPeriod);
    const endPeriod = Number(form.endPeriod);
    if (
      Number.isFinite(startPeriod) &&
      Number.isFinite(endPeriod) &&
      startPeriod > endPeriod
    ) {
      nextErrors.endPeriod = "開始コマは終了コマ以下で指定してください";
    }

    const timetableSet = findSetById(timetableSets, form.timetableSetId);
    if (!timetableSet) {
      if (timetableSets.length === 0) {
        nextErrors.timetableSetId =
          "塾の授業用の時間割セットが登録されていません。";
      } else if (!nextErrors.timetableSetId) {
        nextErrors.timetableSetId = "選択した時間割セットが見つかりません。";
      }
    }

    const resolved =
      Number.isFinite(startPeriod) &&
      Number.isFinite(endPeriod) &&
      startPeriod <= endPeriod
        ? resolveLessonTimeRange(timetableSet, startPeriod, endPeriod)
        : null;
    if (!resolved && timetableSet && !nextErrors.endPeriod) {
      nextErrors.endPeriod = "選択したコマ範囲の時間割が登録されていません。";
    }

    return {
      errors: nextErrors,
      candidateTimes: resolved,
    };
  }

  const breakMinutes = Number(form.breakMinutes);
  if (Number.isFinite(breakMinutes) === false || breakMinutes < 0) {
    nextErrors.breakMinutes = "休憩時間は0以上で入力してください";
  }

  if (breakMinutes > 240) {
    nextErrors.breakMinutes = "休憩時間は240分以下で入力してください";
  }

  if (!form.startTime) {
    nextErrors.startTime = "開始時刻を入力してください。";
  }

  if (!form.endTime) {
    nextErrors.endTime = "終了時刻を入力してください。";
  }

  if (
    form.startTime &&
    form.endTime &&
    isSameTimeShift(form.startTime, form.endTime)
  ) {
    nextErrors.endTime = "開始時刻と終了時刻は同じ時刻にできません。";
  }

  if (Object.keys(nextErrors).length > 0) {
    return {
      errors: nextErrors,
      candidateTimes: null,
    };
  }

  return {
    errors: nextErrors,
    candidateTimes: {
      startTime: form.startTime,
      endTime: form.endTime,
    },
  };
}

export async function checkShiftOverlapWarning(params: {
  mode: ShiftFormProps["mode"];
  shiftId?: string;
  form: FormState;
  candidateTimes: ShiftTimePair;
}): Promise<string | null> {
  const { mode, shiftId, form, candidateTimes } = params;
  if (!form.workplaceId || !form.date) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({
      workplaceId: form.workplaceId,
      startDate: shiftDateKeyAddDays(form.date, -1),
      endDate: shiftDateKeyAddDays(form.date, 1),
    });

    const response = await fetch(`/api/shifts?${searchParams.toString()}`, {
      cache: "no-store",
    });
    if (response.ok === false) {
      return null;
    }

    const shiftsPayload = parseShiftListResponse(
      (await response.json()) as unknown,
    );
    if (!shiftsPayload) {
      return null;
    }

    const candidateRange = toComparableShiftRange(
      form.date,
      candidateTimes.startTime,
      candidateTimes.endTime,
    );

    const overlapped = shiftsPayload.some((shift) => {
      if (mode === "edit" && shift.id === shiftId) {
        return false;
      }

      const shiftRange = toComparableShiftRange(
        dateKeyFromApiDate(shift.date),
        toTimeOnly(shift.startTime),
        toTimeOnly(shift.endTime),
      );

      return (
        candidateRange.startAtUtcMinutes < shiftRange.endAtUtcMinutes &&
        shiftRange.startAtUtcMinutes < candidateRange.endAtUtcMinutes
      );
    });

    return overlapped ? "この日付にはすでにシフトが登録されています。" : null;
  } catch (error) {
    console.error("failed to check overlap", error);
    return null;
  }
}

export function shouldRequireOvernightConfirmation(params: {
  mode: ShiftFormProps["mode"];
  initialShiftTimes: ShiftTimePair | null;
  candidateTimes: ShiftTimePair;
}): boolean {
  const { mode, initialShiftTimes, candidateTimes } = params;
  if (!isOvernightShift(candidateTimes.startTime, candidateTimes.endTime)) {
    return false;
  }

  if (
    mode === "edit" &&
    initialShiftTimes &&
    initialShiftTimes.startTime === candidateTimes.startTime &&
    initialShiftTimes.endTime === candidateTimes.endTime
  ) {
    return false;
  }

  return true;
}

export function buildShiftPayload(
  form: FormState,
  selectedWorkplaceType: Workplace["type"] | undefined,
): ShiftMutationPayload {
  const breakMinutes = Number(form.breakMinutes);
  const effectiveShiftType: ShiftType =
    selectedWorkplaceType === "CRAM_SCHOOL" && form.shiftType === "LESSON"
      ? "LESSON"
      : "NORMAL";

  const payload: ShiftMutationPayload = {
    workplaceId: form.workplaceId,
    date: form.date,
    shiftType: effectiveShiftType,
    comment: form.comment,
    breakMinutes:
      effectiveShiftType === "LESSON"
        ? 0
        : Number.isNaN(breakMinutes)
          ? 0
          : breakMinutes,
  };

  if (effectiveShiftType === "LESSON") {
    payload.lessonRange = {
      timetableSetId: form.timetableSetId,
      startPeriod: Number(form.startPeriod),
      endPeriod: Number(form.endPeriod),
    };
  } else {
    payload.startTime = form.startTime;
    payload.endTime = form.endTime;
  }

  return payload;
}

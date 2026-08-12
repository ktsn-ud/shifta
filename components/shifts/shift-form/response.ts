import { normalizeMonthShift, type MonthShift } from "@/hooks/use-month-shifts";
import type { ShiftDetail, ShiftListItem, ShiftType } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShiftType(value: unknown): value is ShiftType {
  return value === "NORMAL" || value === "LESSON";
}

function isShiftListItem(value: unknown): value is ShiftListItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string"
  );
}

export function parseShiftListResponse(
  payload: unknown,
): ShiftListItem[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  if (payload.data.every(isShiftListItem) === false) {
    return null;
  }

  return payload.data;
}

export function parseShiftDetailResponse(payload: unknown): ShiftDetail | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.workplaceId !== "string" ||
    typeof data.date !== "string" ||
    typeof data.startTime !== "string" ||
    typeof data.endTime !== "string" ||
    typeof data.breakMinutes !== "number" ||
    Number.isInteger(data.breakMinutes) === false ||
    data.breakMinutes < 0 ||
    (data.comment !== null && typeof data.comment !== "string") ||
    !isShiftType(data.shiftType)
  ) {
    return null;
  }

  let lessonRange: ShiftDetail["lessonRange"] = null;
  if (data.lessonRange !== null) {
    if (!isRecord(data.lessonRange)) {
      return null;
    }

    if (
      typeof data.lessonRange.timetableSetId !== "string" ||
      typeof data.lessonRange.startPeriod !== "number" ||
      Number.isInteger(data.lessonRange.startPeriod) === false ||
      data.lessonRange.startPeriod <= 0 ||
      typeof data.lessonRange.endPeriod !== "number" ||
      Number.isInteger(data.lessonRange.endPeriod) === false ||
      data.lessonRange.endPeriod <= 0
    ) {
      return null;
    }

    lessonRange = {
      timetableSetId: data.lessonRange.timetableSetId,
      startPeriod: data.lessonRange.startPeriod,
      endPeriod: data.lessonRange.endPeriod,
    };
  }

  return {
    id: data.id,
    workplaceId: data.workplaceId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    breakMinutes: data.breakMinutes,
    shiftType: data.shiftType,
    comment: data.comment,
    lessonRange,
  };
}

export function parseShiftMutationResult(payload: unknown): {
  detail: ShiftDetail | null;
  monthShift: MonthShift | null;
} {
  if (!isRecord(payload)) {
    return {
      detail: null,
      monthShift: null,
    };
  }

  return {
    detail: parseShiftDetailResponse({ data: payload.data }),
    monthShift: normalizeMonthShift(payload.data),
  };
}

export function toTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

import { parseDateOnly, toMinutes } from "@/lib/api/date-time";

const MINUTES_IN_DAY = 24 * 60;

type FormatShiftTimeRangeOptions = {
  separator?: string;
};

type ComparableShiftRange = {
  startAtUtcMinutes: number;
  endAtUtcMinutes: number;
};

function formatDateKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayStartUtcMinutes(dateKey: string): number {
  return Math.floor(parseDateOnly(dateKey).getTime() / (60 * 1000));
}

export function isSameTimeShift(startTime: string, endTime: string): boolean {
  return toMinutes(startTime) === toMinutes(endTime);
}

export function isOvernightShift(startTime: string, endTime: string): boolean {
  return toMinutes(endTime) < toMinutes(startTime);
}

export function shiftDateKeyAddDays(dateKey: string, days: number): string {
  const date = parseDateOnly(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
}

export function getShiftEndDate(
  dateKey: string,
  startTime: string,
  endTime: string,
): string {
  if (!isOvernightShift(startTime, endTime)) {
    return dateKey;
  }

  return shiftDateKeyAddDays(dateKey, 1);
}

export function toComparableShiftRange(
  dateKey: string,
  startTime: string,
  endTime: string,
): ComparableShiftRange {
  const dayStartMinutes = toDayStartUtcMinutes(dateKey);
  const startAtUtcMinutes = dayStartMinutes + toMinutes(startTime);
  let endAtUtcMinutes = dayStartMinutes + toMinutes(endTime);

  if (isOvernightShift(startTime, endTime)) {
    endAtUtcMinutes += MINUTES_IN_DAY;
  }

  return {
    startAtUtcMinutes,
    endAtUtcMinutes,
  };
}

export function formatShiftTimeRange(
  startTime: string,
  endTime: string,
  options?: FormatShiftTimeRangeOptions,
): string {
  const separator = options?.separator ?? " - ";
  const displayEndTime = isOvernightShift(startTime, endTime)
    ? `翌${endTime}`
    : endTime;
  return `${startTime}${separator}${displayEndTime}`;
}

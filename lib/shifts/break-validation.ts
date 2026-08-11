const MINUTES_IN_DAY = 24 * 60;

export const MAX_BREAK_MINUTES = 240;

export const BREAK_MINUTES_INTEGER_MESSAGE =
  "休憩時間は整数で入力してください。";
export const BREAK_MINUTES_RANGE_MESSAGE =
  "休憩時間は0〜240分で入力してください。";
export const BREAK_MINUTES_LESS_THAN_GROSS_MESSAGE =
  "休憩時間は勤務時間より短く入力してください。";

type TimeOfDay = Date | string;

function toMinutes(value: TimeOfDay): number {
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }

  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

/**
 * Returns the elapsed minutes for a shift. An end time before the start time
 * is interpreted as the following day; identical times intentionally return 0.
 */
export function calculateGrossMinutes(
  startTime: TimeOfDay,
  endTime: TimeOfDay,
): number {
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  return endMinutes < startMinutes
    ? endMinutes + MINUTES_IN_DAY - startMinutes
    : endMinutes - startMinutes;
}

export function getBreakMinutesValidationError(
  breakMinutes: number,
  grossMinutes: number,
): string | null {
  if (!Number.isInteger(breakMinutes)) {
    return BREAK_MINUTES_INTEGER_MESSAGE;
  }

  if (breakMinutes < 0 || breakMinutes > MAX_BREAK_MINUTES) {
    return BREAK_MINUTES_RANGE_MESSAGE;
  }

  if (breakMinutes >= grossMinutes) {
    return BREAK_MINUTES_LESS_THAN_GROSS_MESSAGE;
  }

  return null;
}

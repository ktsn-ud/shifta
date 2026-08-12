export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_ONLY_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  const daysInMonth =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

export function parseDateOnly(value: string): Date {
  if (!isValidDateOnly(value)) {
    throw new Error("DATE_FORMAT_INVALID");
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function parseTimeOnly(value: string): Date {
  if (!TIME_ONLY_REGEX.test(value)) {
    throw new Error("TIME_FORMAT_INVALID");
  }

  const [hour, minute, second = "00"] = value.split(":");
  return new Date(
    Date.UTC(1970, 0, 1, Number(hour), Number(minute), Number(second)),
  );
}

export function toMinutes(value: string): number {
  if (!TIME_ONLY_REGEX.test(value)) {
    throw new Error("TIME_FORMAT_INVALID");
  }

  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

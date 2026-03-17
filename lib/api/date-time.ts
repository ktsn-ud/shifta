export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_ONLY_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY_REGEX.test(value)) {
    throw new Error("DATE_FORMAT_INVALID");
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
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

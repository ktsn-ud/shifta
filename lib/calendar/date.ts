const DATE_PART_PADDING = 2;

function pad(value: number): string {
  return String(value).padStart(DATE_PART_PADDING, "0");
}

export function toDateKey(date: Date): string {
  return (
    String(date.getFullYear()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
}

export function dateKeyFromApiDate(value: string): string {
  const date = new Date(value);
  return (
    String(date.getUTCFullYear()) +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate())
  );
}

export function toDateOnlyString(date: Date): string {
  return toDateKey(date);
}

export function dateFromDateKey(key: string): Date | null {
  const [yearString, monthString, dayString] = key.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (
    Number.isInteger(year) === false ||
    Number.isInteger(month) === false ||
    Number.isInteger(day) === false
  ) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function addMonths(base: Date, months: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + months, 1);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function formatMonthLabel(date: Date): string {
  return String(date.getFullYear()) + "年" + String(date.getMonth() + 1) + "月";
}

export function toMonthInputValue(date: Date): string {
  return String(date.getFullYear()) + "-" + pad(date.getMonth() + 1);
}

export function fromMonthInputValue(value: string): Date | null {
  const [yearString, monthString] = value.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  if (Number.isInteger(year) === false || Number.isInteger(month) === false) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

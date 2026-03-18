const DATE_PART_PADDING = 2;

function pad(value: number): string {
  return String(value).padStart(DATE_PART_PADDING, "0");
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateKeyFromApiDate(value: string): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
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
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function toMonthInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function fromMonthInputValue(value: string): Date | null {
  const [yearString, monthString] = value.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

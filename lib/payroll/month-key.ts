const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonthKeyToDate(monthKey: string): Date {
  if (!MONTH_KEY_REGEX.test(monthKey)) {
    throw new Error("MONTH_KEY_INVALID");
  }

  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  return new Date(Date.UTC(year, month - 1, 1));
}

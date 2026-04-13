export type ClosingDayType = "DAY_OF_MONTH" | "END_OF_MONTH";

export type PayrollCycleSetting = {
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
};

export type PayrollPeriod = {
  paymentDate: Date;
  periodStartDate: Date;
  periodEndDate: Date;
};

const PAYROLL_DAY_MIN = 1;
const PAYROLL_DAY_MAX = 31;

function daysInMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function createUtcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function clampDay(day: number, year: number, monthIndex: number): number {
  return Math.min(day, daysInMonthUtc(year, monthIndex));
}

function normalizeMonthDate(monthDate: Date): Date {
  return createUtcDate(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1);
}

function shiftMonth(monthDate: Date, monthOffset: number): Date {
  return createUtcDate(
    monthDate.getUTCFullYear(),
    monthDate.getUTCMonth() + monthOffset,
    1,
  );
}

function addDays(date: Date, days: number): Date {
  return createUtcDate(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
  );
}

function assertValidPayrollDay(day: number, fieldName: string): void {
  if (
    Number.isInteger(day) === false ||
    day < PAYROLL_DAY_MIN ||
    day > PAYROLL_DAY_MAX
  ) {
    throw new Error(`${fieldName}_INVALID`);
  }
}

function resolveClosingDateForMonth(
  monthDate: Date,
  setting: PayrollCycleSetting,
): Date {
  const month = normalizeMonthDate(monthDate);
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();

  if (setting.closingDayType === "END_OF_MONTH") {
    return createUtcDate(year, monthIndex, daysInMonthUtc(year, monthIndex));
  }

  if (setting.closingDay === null) {
    throw new Error("CLOSING_DAY_REQUIRED");
  }

  assertValidPayrollDay(setting.closingDay, "CLOSING_DAY");
  return createUtcDate(
    year,
    monthIndex,
    clampDay(setting.closingDay, year, monthIndex),
  );
}

function findLatestClosingDateOnOrBefore(
  anchorDate: Date,
  setting: PayrollCycleSetting,
): Date {
  const anchorMonth = normalizeMonthDate(anchorDate);
  const currentMonthClosingDate = resolveClosingDateForMonth(
    anchorMonth,
    setting,
  );

  if (currentMonthClosingDate.getTime() <= anchorDate.getTime()) {
    return currentMonthClosingDate;
  }

  return resolveClosingDateForMonth(shiftMonth(anchorMonth, -1), setting);
}

export function resolvePayrollPeriodForMonth(
  monthDate: Date,
  setting: PayrollCycleSetting,
): PayrollPeriod {
  assertValidPayrollDay(setting.payday, "PAYDAY");

  const month = normalizeMonthDate(monthDate);
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const paymentDate = createUtcDate(
    year,
    monthIndex,
    clampDay(setting.payday, year, monthIndex),
  );

  const periodEndDate = findLatestClosingDateOnOrBefore(paymentDate, setting);
  const previousClosingDate = findLatestClosingDateOnOrBefore(
    addDays(periodEndDate, -1),
    setting,
  );

  return {
    paymentDate,
    periodStartDate: addDays(previousClosingDate, 1),
    periodEndDate,
  };
}

import type { PayrollRule, Shift } from "@/lib/generated/prisma/client";
import type { HolidayType } from "@/lib/generated/prisma/enums";

type DecimalLike = number | string | { toString: () => string };

export type PayrollResult = {
  totalWage: number;
  dayWage: number;
  overtimeWage: number;
  nightWage: number;
  workHours: number;
  overtimeHours: number;
  nightHours: number;
  lessonCount?: number;
};

const MINUTES_IN_DAY = 24 * 60;

function decimalToNumber(
  value: DecimalLike | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = Number(value.toString());
  if (Number.isFinite(numeric) === false) {
    return fallback;
  }

  return numeric;
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function toMinutes(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

function overlapMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

function calculateWorkedHours(shift: Shift): number {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  const adjustedEnd = end <= start ? end + MINUTES_IN_DAY : end;

  const workedMinutes = Math.max(0, adjustedEnd - start - shift.breakMinutes);
  return workedMinutes / 60;
}

function calculateNightHours(shift: Shift, payrollRule: PayrollRule): number {
  const shiftStart = toMinutes(shift.startTime);
  const shiftEndRaw = toMinutes(shift.endTime);
  const shiftEnd =
    shiftEndRaw <= shiftStart ? shiftEndRaw + MINUTES_IN_DAY : shiftEndRaw;

  const nightStart = toMinutes(payrollRule.nightStart);
  const nightEnd = toMinutes(payrollRule.nightEnd);

  const baseNightIntervals: Array<[number, number]> =
    nightEnd <= nightStart
      ? [
          [nightStart, MINUTES_IN_DAY],
          [0, nightEnd],
        ]
      : [[nightStart, nightEnd]];

  const nightIntervals = [
    ...baseNightIntervals,
    ...baseNightIntervals.map(
      ([start, end]) =>
        [start + MINUTES_IN_DAY, end + MINUTES_IN_DAY] as [number, number],
    ),
  ];

  const overlap = nightIntervals.reduce((total, [start, end]) => {
    return total + overlapMinutes(shiftStart, shiftEnd, start, end);
  }, 0);

  return overlap / 60;
}

function isHolidayDate(date: Date, holidayType: HolidayType): boolean {
  if (holidayType === "NONE") {
    return false;
  }

  if (holidayType === "HOLIDAY") {
    return false;
  }

  if (holidayType === "WEEKEND" || holidayType === "WEEKEND_HOLIDAY") {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }

  return false;
}

function getHourlyWage(shift: Shift, payrollRule: PayrollRule): number {
  const baseHourlyWage = decimalToNumber(payrollRule.baseHourlyWage);

  if (isHolidayDate(shift.date, payrollRule.holidayType)) {
    return decimalToNumber(payrollRule.holidayHourlyWage, baseHourlyWage);
  }

  return baseHourlyWage;
}

export function calculateOtherShiftWage(
  shift: Shift,
  payrollRule: PayrollRule,
): PayrollResult {
  if (shift.shiftType === "LESSON") {
    throw new Error("calculateOtherShiftWage は LESSON 型シフトを扱えません");
  }

  const workHours = calculateWorkedHours(shift);
  const nightHoursRaw = calculateNightHours(shift, payrollRule);
  const nightHours = Math.min(workHours, nightHoursRaw);
  const overtimeHours = Math.max(
    0,
    workHours - decimalToNumber(payrollRule.dailyOvertimeThreshold),
  );

  const hourlyWage = getHourlyWage(shift, payrollRule);
  const overtimeMultiplier = decimalToNumber(payrollRule.overtimeMultiplier, 1);
  const nightMultiplier = decimalToNumber(payrollRule.nightMultiplier, 1);

  const dayWage = workHours * hourlyWage;
  const overtimeWage = overtimeHours * hourlyWage * overtimeMultiplier;
  const nightWage = nightHours * hourlyWage * Math.max(0, nightMultiplier - 1);
  const totalWage = dayWage + overtimeWage + nightWage;

  return {
    totalWage: roundCurrency(totalWage),
    dayWage: roundCurrency(dayWage),
    overtimeWage: roundCurrency(overtimeWage),
    nightWage: roundCurrency(nightWage),
    workHours: roundHours(workHours),
    overtimeHours: roundHours(overtimeHours),
    nightHours: roundHours(nightHours),
  };
}

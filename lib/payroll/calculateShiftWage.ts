import type { PayrollRule, Shift } from "@/lib/generated/prisma/client";
import {
  calculateNightHours,
  calculateOvertimeHours,
  isHolidayDate,
} from "@/lib/payroll/timeClassification";

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

function calculateWorkedHours(shift: Shift): number {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  const adjustedEnd = end <= start ? end + 24 * 60 : end;
  const workedMinutes = Math.max(0, adjustedEnd - start - shift.breakMinutes);
  return workedMinutes / 60;
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
  const nightHoursRaw = calculateNightHours(
    shift.startTime,
    shift.endTime,
    payrollRule.nightStart,
    payrollRule.nightEnd,
  );
  const nightHours = Math.min(workHours, nightHoursRaw);
  const overtimeHours = calculateOvertimeHours(
    workHours,
    decimalToNumber(payrollRule.dailyOvertimeThreshold),
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

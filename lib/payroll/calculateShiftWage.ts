import type { PayrollRule, Shift } from "@/lib/generated/prisma/client";
import {
  calculateNightHours,
  calculateOvertimeHours,
  isHolidayDate,
} from "@/lib/payroll/timeClassification";

type DecimalLike = number | string | { toString: () => string };

export type PayrollResult = {
  totalWage: number;
  baseWage: number;
  holidayWage: number;
  overtimeWage: number;
  nightWage: number;
  workHours: number;
  baseHours: number;
  holidayHours: number;
  overtimeHours: number;
  nightHours: number;
  dayWage: number;
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

function readPayrollRuleDecimal(
  payrollRule: PayrollRule,
  keys: string[],
  fallback = 0,
): number {
  const raw = payrollRule as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = raw[key];
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      (typeof value === "object" &&
        value !== null &&
        "toString" in value &&
        typeof (value as { toString: unknown }).toString === "function")
    ) {
      return decimalToNumber(value as DecimalLike, fallback);
    }
  }

  return fallback;
}

export function calculateShiftWage(
  shift: Shift,
  payrollRule: PayrollRule,
): PayrollResult {
  const workHours = calculateWorkedHours(shift);
  const nightHoursRaw = calculateNightHours(shift.startTime, shift.endTime);
  const nightHours = Math.min(workHours, nightHoursRaw);
  const baseHours = Math.max(0, workHours - nightHours);
  const holidayHours = isHolidayDate(shift.date, payrollRule.holidayType)
    ? workHours
    : 0;
  const overtimeHours = calculateOvertimeHours(
    workHours,
    decimalToNumber(payrollRule.dailyOvertimeThreshold),
  );

  const baseHourlyWage = decimalToNumber(payrollRule.baseHourlyWage);
  const holidayAllowanceHourly = readPayrollRuleDecimal(
    payrollRule,
    ["holidayAllowanceHourly", "holidayHourlyWage"],
    0,
  );
  const nightPremiumRate = readPayrollRuleDecimal(
    payrollRule,
    ["nightPremiumRate", "nightMultiplier"],
    0,
  );

  const baseWageRounded = roundCurrency(baseHourlyWage * baseHours);
  const nightWageRounded = roundCurrency(
    baseHourlyWage * (1 + Math.max(0, nightPremiumRate)) * nightHours,
  );
  const holidayWageRounded = roundCurrency(
    holidayAllowanceHourly * holidayHours,
  );
  const overtimeWageRounded = 0;
  const totalWage =
    baseWageRounded +
    nightWageRounded +
    holidayWageRounded +
    overtimeWageRounded;

  return {
    totalWage,
    baseWage: baseWageRounded,
    holidayWage: holidayWageRounded,
    overtimeWage: overtimeWageRounded,
    nightWage: nightWageRounded,
    workHours: roundHours(workHours),
    baseHours: roundHours(baseHours),
    holidayHours: roundHours(holidayHours),
    overtimeHours: roundHours(overtimeHours),
    nightHours: roundHours(nightHours),
    dayWage: baseWageRounded,
  };
}

export const calculateOtherShiftWage = calculateShiftWage;

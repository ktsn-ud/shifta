import type { HolidayType } from "@/lib/generated/prisma/enums";
import {
  calculateNightHours,
  calculateOvertimeHours,
  isHolidayDate,
} from "@/lib/payroll/timeClassification";
import {
  decimalToNumber,
  roundCurrency,
  roundHours,
  type DecimalLike,
} from "@/lib/payroll/numeric";

export type ShiftWageInput = {
  date: Date;
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
};

export type PayrollRuleWageInput = {
  baseHourlyWage: DecimalLike;
  holidayAllowanceHourly?: DecimalLike;
  nightPremiumRate?: DecimalLike;
  overtimePremiumRate?: DecimalLike;
  dailyOvertimeThreshold: DecimalLike;
  holidayType: HolidayType;
};

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

function toMinutes(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

function calculateWorkedHours(shift: ShiftWageInput): number {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  const adjustedEnd = end <= start ? end + 24 * 60 : end;
  const workedMinutes = Math.max(0, adjustedEnd - start - shift.breakMinutes);
  return workedMinutes / 60;
}

export function calculateShiftWage(
  shift: ShiftWageInput,
  payrollRule: PayrollRuleWageInput,
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
  const holidayAllowanceHourly = decimalToNumber(
    payrollRule.holidayAllowanceHourly,
  );
  const nightPremiumRate = decimalToNumber(payrollRule.nightPremiumRate);

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

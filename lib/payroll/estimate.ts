type DecimalLike = number | string | { toString: () => string };

type LessonRange = {
  startPeriod: number;
  endPeriod: number;
  timetableSetId: string;
};

type ShiftForEstimate = {
  date: Date;
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
  shiftType: "NORMAL" | "LESSON";
  lessonRange: LessonRange | null;
};

type PayrollRuleForEstimate = {
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: DecimalLike;
};

function decimalToNumber(value: DecimalLike): number {
  const numeric = Number(value.toString());
  if (Number.isFinite(numeric) === false) {
    return 0;
  }
  return numeric;
}

function calculateTotalMinutes(startTime: Date, endTime: Date): number {
  const startMinutes = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
  const endMinutes = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
  const adjustedEnd =
    endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
  return adjustedEnd - startMinutes;
}

export function calculateWorkedMinutes(shift: ShiftForEstimate): number {
  const totalMinutes = calculateTotalMinutes(shift.startTime, shift.endTime);
  const workedMinutes = totalMinutes - shift.breakMinutes;

  if (workedMinutes < 0) {
    return 0;
  }

  return workedMinutes;
}

export function findApplicablePayrollRule(
  rules: PayrollRuleForEstimate[],
  shiftDate: Date,
): PayrollRuleForEstimate | null {
  const shiftTime = shiftDate.getTime();

  for (const rule of rules) {
    const isAfterStart = shiftTime >= rule.startDate.getTime();
    const isBeforeEnd =
      rule.endDate === null || shiftTime < rule.endDate.getTime();

    if (isAfterStart && isBeforeEnd) {
      return rule;
    }
  }

  return null;
}

export function estimateShiftPay(
  shift: ShiftForEstimate,
  rule: PayrollRuleForEstimate | null,
): number | null {
  if (rule === null) {
    return null;
  }

  const workedMinutes = calculateWorkedMinutes(shift);
  const workedHours = workedMinutes / 60;
  const amount = decimalToNumber(rule.baseHourlyWage) * workedHours;
  return Math.round(amount);
}

export type { PayrollRuleForEstimate, ShiftForEstimate };

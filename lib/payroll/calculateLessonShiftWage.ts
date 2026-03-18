import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
} from "@/lib/generated/prisma/client";
import type { PayrollResult } from "@/lib/payroll/calculateShiftWage";

type DecimalLike = number | string | { toString: () => string };

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

export function calculateLessonShiftWage(
  shift: Shift,
  shiftLessonRange: ShiftLessonRange,
  payrollRule: PayrollRule,
): PayrollResult {
  if (shift.shiftType !== "LESSON") {
    throw new Error("calculateLessonShiftWage は LESSON 型シフト専用です");
  }

  const lessonCount =
    shiftLessonRange.endPeriod - shiftLessonRange.startPeriod + 1;
  if (lessonCount <= 0) {
    throw new Error("startPeriod は endPeriod 以下である必要があります");
  }

  const perLessonWage = decimalToNumber(payrollRule.perLessonWage);
  if (perLessonWage <= 0) {
    throw new Error("perLessonWage が不正です");
  }

  const totalWage = Math.round(lessonCount * perLessonWage);

  return {
    totalWage,
    dayWage: 0,
    overtimeWage: 0,
    nightWage: 0,
    workHours: 0,
    overtimeHours: 0,
    nightHours: 0,
    lessonCount,
  };
}

import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
} from "@/lib/generated/prisma/client";
import {
  calculateShiftWage,
  type PayrollResult,
} from "@/lib/payroll/calculateShiftWage";

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

  const baseResult = calculateShiftWage(shift, payrollRule);

  return {
    ...baseResult,
    lessonCount,
  };
}

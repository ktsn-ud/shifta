import type { ShiftLessonRange } from "@/lib/generated/prisma/client";
import {
  calculateShiftWage,
  type PayrollRuleWageInput,
  type PayrollResult,
  type ShiftWageInput,
} from "@/lib/payroll/calculateShiftWage";

type LessonShiftInput = ShiftWageInput & {
  shiftType: string;
};

type LessonRangeInput = Pick<ShiftLessonRange, "startPeriod" | "endPeriod">;

export function calculateLessonShiftWage(
  shift: LessonShiftInput,
  shiftLessonRange: LessonRangeInput,
  payrollRule: PayrollRuleWageInput,
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

import type { DecimalLike } from "@/lib/payroll/numeric";

export type PayrollWorkplaceType = "GENERAL" | "CRAM_SCHOOL";
export type PayrollShiftType = "NORMAL" | "LESSON";

type HourlyWageRule = {
  baseHourlyWage: DecimalLike;
  administrativeHourlyWage?: DecimalLike | null;
};

/**
 * 塾の通常シフト（事務・会議・準備等）だけは事務時給を優先する。
 * 未設定の既存ルールは基本時給へフォールバックして互換性を保つ。
 */
export function resolveHourlyWage(
  workplaceType: PayrollWorkplaceType,
  shiftType: PayrollShiftType,
  rule: HourlyWageRule,
): DecimalLike {
  if (
    workplaceType === "CRAM_SCHOOL" &&
    shiftType === "NORMAL" &&
    rule.administrativeHourlyWage !== null &&
    rule.administrativeHourlyWage !== undefined
  ) {
    return rule.administrativeHourlyWage;
  }

  return rule.baseHourlyWage;
}

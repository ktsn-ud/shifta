import {
  resolvePaymentMonthForShiftDate,
  type PayrollCycleSetting,
} from "@/lib/payroll/pay-period";

function toMonthKeyUtc(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export type PayrollShiftPaymentMonthInput = {
  date: Date;
  payrollCycle: PayrollCycleSetting;
};

/**
 * Resolves every payment month affected by a shift mutation.
 *
 * A null result means the affected month cannot be determined safely and the
 * caller must fall back to broad payroll snapshot invalidation.
 */
export function resolveAffectedPaymentMonthKeys(
  shifts: PayrollShiftPaymentMonthInput[],
): string[] | null {
  if (shifts.length === 0) {
    return null;
  }

  try {
    return Array.from(
      new Set(
        shifts.map(({ date, payrollCycle }) =>
          toMonthKeyUtc(resolvePaymentMonthForShiftDate(date, payrollCycle)),
        ),
      ),
    ).sort((left, right) => left.localeCompare(right));
  } catch {
    return null;
  }
}

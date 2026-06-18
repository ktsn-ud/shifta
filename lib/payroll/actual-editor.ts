import { startOfMonthUtc, toMonthKeyUtc } from "@/lib/payroll/actual-payroll";
import { getPayrollDetailsMonthlyForUser } from "@/lib/payroll/details";

export type ActualPayrollEditorRow = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  periodStartDate: string;
  periodEndDate: string;
  estimatedAmount: number;
  taxableAmount: number | null;
  nonTaxableAmount: number | null;
  totalActualAmount: number | null;
  displayAmount: number;
  differenceAmount: number;
  note: string | null;
  hasActualPayroll: boolean;
};

export type ActualPayrollEditorResult = {
  month: string;
  rows: ActualPayrollEditorRow[];
};

export async function getActualPayrollEditorForUser(
  userId: string,
  month: Date,
): Promise<ActualPayrollEditorResult> {
  const selectedMonth = startOfMonthUtc(month);
  const details = await getPayrollDetailsMonthlyForUser(userId, selectedMonth);

  return {
    month: toMonthKeyUtc(selectedMonth),
    rows: details.byWorkplace.map((item) => ({
      workplaceId: item.workplaceId,
      workplaceName: item.workplaceName,
      workplaceColor: item.workplaceColor,
      periodStartDate: item.periodStartDate,
      periodEndDate: item.periodEndDate,
      estimatedAmount: item.displayValue.estimatedAmount,
      taxableAmount: item.actualPayroll?.taxableAmount ?? null,
      nonTaxableAmount: item.actualPayroll?.nonTaxableAmount ?? null,
      totalActualAmount: item.actualPayroll?.totalAmount ?? null,
      displayAmount: item.displayValue.displayAmount,
      differenceAmount: item.displayValue.differenceAmount,
      note: item.actualPayroll?.note ?? null,
      hasActualPayroll: item.displayValue.isActualApplied,
    })),
  };
}

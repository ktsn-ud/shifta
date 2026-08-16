import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

export type PayrollAnnualPreviewResult = {
  data: {
    years: Array<{
      year: number;
      taxableAmount: number;
      nonTaxableAmount: number;
      totalAmount: number;
    }>;
  };
};

export async function getPayrollAnnualPreviewForUser(
  userId: string,
  years: number[],
): Promise<PayrollAnnualPreviewResult> {
  const normalizedYears = Array.from(new Set(years)).sort(
    (left, right) => left - right,
  );
  const summaries = await Promise.all(
    normalizedYears.map((year) => getPayrollSummaryForUser(userId, year)),
  );

  return {
    data: {
      years: summaries.map((summary) => ({
        year: summary.year,
        taxableAmount: summary.yearlyTotals.grandTotals.taxableAmount,
        nonTaxableAmount: summary.yearlyTotals.grandTotals.nonTaxableAmount,
        totalAmount: summary.yearlyTotals.grandTotals.totalAmount,
      })),
    },
  };
}

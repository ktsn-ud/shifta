import { toMonthKeyUtc } from "@/lib/payroll/actual-payroll";
import { prisma } from "@/lib/prisma";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

export type PayrollAnnualPreviewResult = {
  data: {
    years: Array<{
      year: number;
      taxableAmount: number;
      nonTaxableAmount: number;
      totalAmount: number;
    }>;
    actualPayrollKeys: Array<{
      workplaceId: string;
      paymentMonth: string;
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
  const startYear = normalizedYears[0];
  const endYear = normalizedYears.at(-1);
  const actualPayrolls =
    startYear === undefined || endYear === undefined
      ? []
      : await prisma.actualPayroll.findMany({
          where: {
            workplace: { userId },
            paymentMonth: {
              gte: new Date(Date.UTC(startYear, 0, 1)),
              lt: new Date(Date.UTC(endYear + 1, 0, 1)),
            },
          },
          select: { workplaceId: true, paymentMonth: true },
        });

  return {
    data: {
      years: summaries.map((summary) => ({
        year: summary.year,
        taxableAmount: summary.yearlyTotals.grandTotals.taxableAmount,
        nonTaxableAmount: summary.yearlyTotals.grandTotals.nonTaxableAmount,
        totalAmount: summary.yearlyTotals.grandTotals.totalAmount,
      })),
      actualPayrollKeys: actualPayrolls.map((item) => ({
        workplaceId: item.workplaceId,
        paymentMonth: toMonthKeyUtc(item.paymentMonth),
      })),
    },
  };
}

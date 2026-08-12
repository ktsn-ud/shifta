import { type PayrollPeriod } from "@/lib/payroll/pay-period";
import { toPayrollPeriodMapKey } from "@/lib/payroll/period-key";

type WorkplaceWithId = {
  id: string;
};

export function createPayrollPeriodSummaryGetter<T>(params: {
  periodByWorkplaceMonth: Map<string, PayrollPeriod>;
  summarize: (workplaceId: string, period: PayrollPeriod) => T;
}): (workplace: WorkplaceWithId, monthKey: string) => T {
  const summaryByWorkplaceMonth = new Map<string, { value: T }>();

  return (workplace, monthKey) => {
    const periodKey = toPayrollPeriodMapKey(workplace.id, monthKey);
    const cachedSummary = summaryByWorkplaceMonth.get(periodKey);
    if (cachedSummary) {
      return cachedSummary.value;
    }

    const period = params.periodByWorkplaceMonth.get(periodKey);
    if (!period) {
      throw new Error(`PAYROLL_PERIOD_NOT_FOUND: ${periodKey}`);
    }

    const summary = params.summarize(workplace.id, period);
    summaryByWorkplaceMonth.set(periodKey, { value: summary });
    return summary;
  };
}

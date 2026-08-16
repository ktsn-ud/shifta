import type { Prisma } from "@/lib/generated/prisma/client";
import { parseMonthKeyToDate } from "@/lib/payroll/month-key";
import {
  calculateShiftPayrollResult,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { type PayrollPeriod } from "@/lib/payroll/pay-period";
import {
  loadPayrollSnapshot,
  toPayrollPeriodMapKey,
} from "@/lib/payroll/snapshot";

type PreviewBaselineByWorkplace = {
  workplaceId: string;
  wage: number;
  transportationAllowance: number;
  totalAmount: number;
  periodStartDate: string;
  periodEndDate: string;
};

type PreviewBaselineMonth = {
  month: string;
  totalWage: number;
  totalTransportationAllowance: number;
  totalAmount: number;
  byWorkplace: PreviewBaselineByWorkplace[];
};

export type PayrollPreviewBaselineResult = {
  data: {
    months: PreviewBaselineMonth[];
  };
};

type ShiftWithPreviewRelations = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
  };
}>;

function toDateOnlyUtc(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function summarizeWorkplaceByPeriod(
  workplaceId: string,
  period: PayrollPeriod,
  shiftsByWorkplace: Map<string, ShiftWithPreviewRelations[]>,
  rulesByWorkplace: PayrollRulesByWorkplace,
): { wage: number; transportationAllowance: number } {
  const shifts = shiftsByWorkplace.get(workplaceId) ?? [];
  const periodStartTime = period.periodStartDate.getTime();
  const periodEndTime = period.periodEndDate.getTime();
  let wage = 0;
  let transportationAllowance = 0;

  for (const shift of shifts) {
    const shiftTime = shift.date.getTime();
    if (shiftTime < periodStartTime) {
      continue;
    }
    if (shiftTime > periodEndTime) {
      break;
    }

    wage += calculateShiftPayrollResult(shift, rulesByWorkplace).totalWage;
    transportationAllowance += shift.transportationAllowance;
  }

  return { wage: Math.round(wage), transportationAllowance };
}

export async function getPayrollPreviewBaselineForUser(
  userId: string,
  months: string[],
): Promise<PayrollPreviewBaselineResult> {
  const monthKeys = Array.from(new Set(months)).sort((left, right) =>
    left.localeCompare(right),
  );

  if (monthKeys.length === 0) {
    return { data: { months: [] } };
  }

  const monthDates = monthKeys.map(parseMonthKeyToDate);
  const {
    workplaces,
    periodByWorkplaceMonth,
    shiftsByWorkplace,
    rulesByWorkplace,
  } = await loadPayrollSnapshot({
    userId,
    monthDates,
  });

  if (workplaces.length === 0) {
    return {
      data: {
        months: monthKeys.map((month) => ({
          month,
          totalWage: 0,
          totalTransportationAllowance: 0,
          totalAmount: 0,
          byWorkplace: [],
        })),
      },
    };
  }

  const monthResults = monthKeys.map((monthKey): PreviewBaselineMonth => {
    let totalWage = 0;
    let totalTransportationAllowance = 0;
    const byWorkplace: PreviewBaselineByWorkplace[] = [];

    for (const workplace of workplaces) {
      const period = periodByWorkplaceMonth.get(
        toPayrollPeriodMapKey(workplace.id, monthKey),
      );
      if (!period) {
        continue;
      }

      const summarized = summarizeWorkplaceByPeriod(
        workplace.id,
        period,
        shiftsByWorkplace,
        rulesByWorkplace,
      );
      totalWage += summarized.wage;
      totalTransportationAllowance += summarized.transportationAllowance;

      if (summarized.wage === 0 && summarized.transportationAllowance === 0) {
        continue;
      }

      byWorkplace.push({
        workplaceId: workplace.id,
        wage: summarized.wage,
        transportationAllowance: summarized.transportationAllowance,
        totalAmount: summarized.wage + summarized.transportationAllowance,
        periodStartDate: toDateOnlyUtc(period.periodStartDate),
        periodEndDate: toDateOnlyUtc(period.periodEndDate),
      });
    }

    return {
      month: monthKey,
      totalWage: Math.round(totalWage),
      totalTransportationAllowance: Math.round(totalTransportationAllowance),
      totalAmount: Math.round(totalWage + totalTransportationAllowance),
      byWorkplace: byWorkplace.sort(
        (left, right) => right.totalAmount - left.totalAmount,
      ),
    };
  });

  return {
    data: {
      months: monthResults,
    },
  };
}

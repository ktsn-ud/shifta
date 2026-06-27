import type { Prisma } from "@/lib/generated/prisma/client";
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
  periodStartDate: string;
  periodEndDate: string;
};

type PreviewBaselineMonth = {
  month: string;
  totalWage: number;
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

function parseMonthKeyToDate(monthKey: string): Date {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  return new Date(Date.UTC(year, month - 1, 1));
}

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
): number {
  const shifts = shiftsByWorkplace.get(workplaceId) ?? [];
  const periodStartTime = period.periodStartDate.getTime();
  const periodEndTime = period.periodEndDate.getTime();
  let wage = 0;

  for (const shift of shifts) {
    const shiftTime = shift.date.getTime();
    if (shiftTime < periodStartTime) {
      continue;
    }
    if (shiftTime > periodEndTime) {
      break;
    }

    wage += calculateShiftPayrollResult(shift, rulesByWorkplace).totalWage;
  }

  return Math.round(wage);
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
          byWorkplace: [],
        })),
      },
    };
  }

  const monthResults = monthKeys.map((monthKey): PreviewBaselineMonth => {
    let totalWage = 0;
    const byWorkplace: PreviewBaselineByWorkplace[] = [];

    for (const workplace of workplaces) {
      const period = periodByWorkplaceMonth.get(
        toPayrollPeriodMapKey(workplace.id, monthKey),
      );
      if (!period) {
        continue;
      }

      const wage = summarizeWorkplaceByPeriod(
        workplace.id,
        period,
        shiftsByWorkplace,
        rulesByWorkplace,
      );
      totalWage += wage;

      if (wage === 0) {
        continue;
      }

      byWorkplace.push({
        workplaceId: workplace.id,
        wage,
        periodStartDate: toDateOnlyUtc(period.periodStartDate),
        periodEndDate: toDateOnlyUtc(period.periodEndDate),
      });
    }

    return {
      month: monthKey,
      totalWage: Math.round(totalWage),
      byWorkplace: byWorkplace.sort((left, right) => right.wage - left.wage),
    };
  });

  return {
    data: {
      months: monthResults,
    },
  };
}

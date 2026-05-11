import type { Prisma } from "@/lib/generated/prisma/client";
import {
  calculateShiftPayrollResult,
  groupPayrollRulesByWorkplace,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import {
  resolvePayrollPeriodForMonth,
  type ClosingDayType,
  type PayrollPeriod,
} from "@/lib/payroll/pay-period";
import { prisma } from "@/lib/prisma";

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

type WorkplaceWithPayrollCycle = {
  id: string;
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
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

function toMonthKey(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toDateOnlyUtc(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPeriodMapKey(workplaceId: string, monthKey: string): string {
  return `${workplaceId}:${monthKey}`;
}

function groupShiftsByWorkplace(
  shifts: ShiftWithPreviewRelations[],
): Map<string, ShiftWithPreviewRelations[]> {
  const map = new Map<string, ShiftWithPreviewRelations[]>();

  for (const shift of shifts) {
    const bucket = map.get(shift.workplaceId) ?? [];
    bucket.push(shift);
    map.set(shift.workplaceId, bucket);
  }

  return map;
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
  const workplaces = await prisma.workplace.findMany({
    where: { userId },
    select: {
      id: true,
      closingDayType: true,
      closingDay: true,
      payday: true,
    },
    orderBy: { createdAt: "asc" },
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

  const workplaceIds = workplaces.map((workplace) => workplace.id);
  const periodByWorkplaceMonth = new Map<string, PayrollPeriod>();
  let fetchStartDate: Date | null = null;
  let fetchEndDate: Date | null = null;

  for (const workplace of workplaces) {
    for (const monthDate of monthDates) {
      const period = resolvePayrollPeriodForMonth(monthDate, {
        closingDayType: workplace.closingDayType,
        closingDay: workplace.closingDay,
        payday: workplace.payday,
      });
      const monthKey = toMonthKey(monthDate);
      periodByWorkplaceMonth.set(
        toPeriodMapKey(workplace.id, monthKey),
        period,
      );

      if (!fetchStartDate || period.periodStartDate < fetchStartDate) {
        fetchStartDate = period.periodStartDate;
      }
      if (!fetchEndDate || period.periodEndDate > fetchEndDate) {
        fetchEndDate = period.periodEndDate;
      }
    }
  }

  if (!fetchStartDate || !fetchEndDate) {
    throw new Error("PAYROLL_PREVIEW_PERIOD_NOT_FOUND");
  }

  const [shifts, payrollRules] = await Promise.all([
    prisma.shift.findMany({
      where: {
        workplaceId: {
          in: workplaceIds,
        },
        date: {
          gte: fetchStartDate,
          lte: fetchEndDate,
        },
      },
      include: {
        lessonRange: true,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.payrollRule.findMany({
      where: {
        workplaceId: {
          in: workplaceIds,
        },
        startDate: {
          lte: fetchEndDate,
        },
        OR: [
          { endDate: null },
          {
            endDate: {
              gt: fetchStartDate,
            },
          },
        ],
      },
      orderBy: [{ workplaceId: "asc" }, { startDate: "asc" }],
    }),
  ]);

  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);
  const shiftsByWorkplace = groupShiftsByWorkplace(shifts);

  const monthResults = monthKeys.map((monthKey): PreviewBaselineMonth => {
    let totalWage = 0;
    const byWorkplace: PreviewBaselineByWorkplace[] = [];

    for (const workplace of workplaces as WorkplaceWithPayrollCycle[]) {
      const period = periodByWorkplaceMonth.get(
        toPeriodMapKey(workplace.id, monthKey),
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

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  getActualPayrollMap,
  startOfMonthUtc,
  toMonthKeyUtc,
  type ActualPayrollRecord,
} from "@/lib/payroll/actual-payroll";
import {
  resolvePayrollPeriodForMonth,
  type ClosingDayType,
  type PayrollPeriod,
} from "@/lib/payroll/pay-period";
import {
  groupPayrollRulesByWorkplace,
  type PayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { prisma } from "@/lib/prisma";

export type PayrollSnapshotWorkplace = {
  id: string;
  name: string;
  color: string;
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
};

export type PayrollSnapshotShift = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
  };
}>;

export type PayrollSnapshot = {
  workplaces: PayrollSnapshotWorkplace[];
  workplaceIds: string[];
  monthKeys: string[];
  periodByWorkplaceMonth: Map<string, PayrollPeriod>;
  shiftsByWorkplace: Map<string, PayrollSnapshotShift[]>;
  rulesByWorkplace: PayrollRulesByWorkplace;
  actualPayrollByWorkplaceMonth: Map<string, ActualPayrollRecord>;
};

type LoadPayrollSnapshotParams = {
  userId: string;
  monthDates: Date[];
  includeActualPayroll?: boolean;
};

function groupShiftsByWorkplace(
  shifts: PayrollSnapshotShift[],
): Map<string, PayrollSnapshotShift[]> {
  const grouped = new Map<string, PayrollSnapshotShift[]>();

  for (const shift of shifts) {
    const bucket = grouped.get(shift.workplaceId) ?? [];
    bucket.push(shift);
    grouped.set(shift.workplaceId, bucket);
  }

  return grouped;
}

export function toPayrollPeriodMapKey(
  workplaceId: string,
  monthKey: string,
): string {
  return `${workplaceId}:${monthKey}`;
}

export async function loadPayrollSnapshot(
  params: LoadPayrollSnapshotParams,
): Promise<PayrollSnapshot> {
  const normalizedMonths = new Map<string, Date>();
  for (const monthDate of params.monthDates) {
    const normalizedMonth = startOfMonthUtc(monthDate);
    normalizedMonths.set(toMonthKeyUtc(normalizedMonth), normalizedMonth);
  }

  const monthKeys = Array.from(normalizedMonths.keys()).sort((left, right) =>
    left.localeCompare(right),
  );
  const monthDates = monthKeys.map((monthKey) => {
    const monthDate = normalizedMonths.get(monthKey);
    if (!monthDate) {
      throw new Error(`PAYROLL_MONTH_NOT_FOUND: ${monthKey}`);
    }

    return monthDate;
  });

  const workplaces = await prisma.workplace.findMany({
    where: { userId: params.userId },
    select: {
      id: true,
      name: true,
      color: true,
      closingDayType: true,
      closingDay: true,
      payday: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const workplaceIds = workplaces.map((workplace) => workplace.id);
  if (workplaceIds.length === 0 || monthDates.length === 0) {
    return {
      workplaces,
      workplaceIds,
      monthKeys,
      periodByWorkplaceMonth: new Map(),
      shiftsByWorkplace: new Map(),
      rulesByWorkplace: new Map(),
      actualPayrollByWorkplaceMonth: new Map(),
    };
  }

  let fetchStartDate: Date | null = null;
  let fetchEndDate: Date | null = null;
  const periodByWorkplaceMonth = new Map<string, PayrollPeriod>();

  for (const workplace of workplaces) {
    for (const monthDate of monthDates) {
      const monthKey = toMonthKeyUtc(monthDate);
      const period = resolvePayrollPeriodForMonth(monthDate, {
        closingDayType: workplace.closingDayType,
        closingDay: workplace.closingDay,
        payday: workplace.payday,
      });

      periodByWorkplaceMonth.set(
        toPayrollPeriodMapKey(workplace.id, monthKey),
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
    throw new Error("PAYROLL_PERIOD_NOT_FOUND");
  }

  const [shifts, payrollRules, actualPayrollByWorkplaceMonth] =
    await Promise.all([
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
            {
              endDate: null,
            },
            {
              endDate: {
                gt: fetchStartDate,
              },
            },
          ],
        },
        orderBy: [{ workplaceId: "asc" }, { startDate: "asc" }],
      }),
      params.includeActualPayroll
        ? getActualPayrollMap({
            workplaceIds,
            monthKeys,
          })
        : Promise.resolve(new Map<string, ActualPayrollRecord>()),
    ]);

  return {
    workplaces,
    workplaceIds,
    monthKeys,
    periodByWorkplaceMonth,
    shiftsByWorkplace: groupShiftsByWorkplace(shifts),
    rulesByWorkplace: groupPayrollRulesByWorkplace(payrollRules),
    actualPayrollByWorkplaceMonth,
  };
}

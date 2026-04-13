import { summarizeByPeriod } from "@/lib/payroll/summarizeByPeriod";
import { prisma } from "@/lib/prisma";

type PayrollSummaryByWorkplace = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  wage: number;
  workHours: number;
};

export type PayrollSummaryResult = {
  totalWage: number;
  totalWorkHours: number;
  totalNightHours: number;
  totalOvertimeHours: number;
  byWorkplace: PayrollSummaryByWorkplace[];
  previousMonthWage: number;
  currentMonthCumulative: number;
  yearlyTotal: number;
};

function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function shiftMonth(date: Date, monthOffset: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1),
  );
}

export async function getPayrollSummaryForUser(
  userId: string,
  month: Date,
): Promise<PayrollSummaryResult> {
  const selectedMonthStartDate = startOfMonth(month);
  const selectedMonthEndDate = endOfMonth(month);
  const previousMonthDate = shiftMonth(selectedMonthStartDate, -1);
  const previousStartDate = startOfMonth(previousMonthDate);
  const previousEndDate = endOfMonth(previousMonthDate);
  const cumulativeStartDate = startOfYear(selectedMonthStartDate);
  const yearlyEndDate = endOfYear(selectedMonthStartDate);

  const shifts = await prisma.shift.findMany({
    where: {
      workplace: { userId },
      date: {
        gte: previousStartDate,
        lte: yearlyEndDate,
      },
    },
    include: {
      lessonRange: true,
      workplace: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const workplaceIds = Array.from(
    new Set(shifts.map((shift) => shift.workplaceId)),
  );

  const payrollRules = workplaceIds.length
    ? await prisma.payrollRule.findMany({
        where: {
          workplaceId: {
            in: workplaceIds,
          },
        },
        orderBy: [{ workplaceId: "asc" }, { startDate: "asc" }],
      })
    : [];

  const currentSummary = summarizeByPeriod(
    shifts,
    payrollRules,
    selectedMonthStartDate,
    selectedMonthEndDate,
  );
  const previousSummary = summarizeByPeriod(
    shifts,
    payrollRules,
    previousStartDate,
    previousEndDate,
  );
  const cumulativeSummary = summarizeByPeriod(
    shifts,
    payrollRules,
    cumulativeStartDate,
    selectedMonthEndDate,
  );
  const yearlySummary = summarizeByPeriod(
    shifts,
    payrollRules,
    cumulativeStartDate,
    yearlyEndDate,
  );

  return {
    ...currentSummary,
    previousMonthWage: previousSummary.totalWage,
    currentMonthCumulative: cumulativeSummary.totalWage,
    yearlyTotal: yearlySummary.totalWage,
  };
}

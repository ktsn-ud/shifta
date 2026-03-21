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

function shiftMonthClamped(date: Date, monthOffset: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + monthOffset;
  const day = date.getUTCDate();

  const firstDateInTargetMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(
      firstDateInTargetMonth.getUTCFullYear(),
      firstDateInTargetMonth.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      firstDateInTargetMonth.getUTCFullYear(),
      firstDateInTargetMonth.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
}

function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export async function getPayrollSummaryForUser(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<PayrollSummaryResult> {
  const previousStartDate = shiftMonthClamped(startDate, -1);
  const previousEndDate = shiftMonthClamped(endDate, -1);
  const cumulativeStartDate = startOfYear(endDate);

  const fetchStartDate =
    previousStartDate < cumulativeStartDate
      ? previousStartDate
      : cumulativeStartDate;

  const shifts = await prisma.shift.findMany({
    where: {
      workplace: { userId },
      date: {
        gte: fetchStartDate,
        lte: endDate,
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
    startDate,
    endDate,
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
    endDate,
  );

  return {
    ...currentSummary,
    previousMonthWage: previousSummary.totalWage,
    currentMonthCumulative: cumulativeSummary.totalWage,
    yearlyTotal: cumulativeSummary.totalWage,
  };
}

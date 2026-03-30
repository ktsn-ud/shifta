import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  DashboardPageClient,
  DashboardPageLoadingSkeleton,
} from "@/components/dashboard/dashboard-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import {
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";
import { type MonthShift } from "@/hooks/use-month-shifts";
import { type Prisma } from "@/lib/generated/prisma/client";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
import { prisma } from "@/lib/prisma";

type ShiftWithRelations = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
    workplace: true;
  };
}>;

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function DashboardPageFallback() {
  return <DashboardPageLoadingSkeleton />;
}

function resolveInitialMonth(monthParam: string | string[] | undefined): Date {
  if (typeof monthParam !== "string") {
    return startOfMonth(new Date());
  }

  const parsedMonth = fromMonthInputValue(monthParam);
  return startOfMonth(parsedMonth ?? new Date());
}

async function getMonthShiftsWithEstimate(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<MonthShift[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      workplace: { userId },
      date: {
        gte: parseDateOnly(startDate),
        lte: parseDateOnly(endDate),
      },
    },
    include: {
      lessonRange: true,
      workplace: true,
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });

  if (shifts.length === 0) {
    return [];
  }

  const workplaceIds = Array.from(
    new Set(shifts.map((shift) => shift.workplaceId)),
  );
  const payrollRules = await prisma.payrollRule.findMany({
    where: {
      workplaceId: {
        in: workplaceIds,
      },
    },
    orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
  });
  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);

  return shifts.map((shift: ShiftWithRelations) => {
    const workedMinutes = calculateWorkedMinutes({
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      shiftType: shift.shiftType,
      lessonRange: shift.lessonRange
        ? {
            startPeriod: shift.lessonRange.startPeriod,
            endPeriod: shift.lessonRange.endPeriod,
          }
        : null,
    });

    const selectedRule = findApplicablePayrollRule(
      rulesByWorkplace,
      shift.workplaceId,
      shift.date,
    );

    const estimatedPay = selectedRule
      ? calculateShiftPayrollResultByRule(shift, selectedRule).totalWage
      : null;

    return {
      id: shift.id,
      workplaceId: shift.workplaceId,
      date: shift.date.toISOString(),
      startTime: shift.startTime.toISOString(),
      endTime: shift.endTime.toISOString(),
      breakMinutes: shift.breakMinutes,
      shiftType: shift.shiftType,
      googleSyncStatus:
        shift.googleSyncStatus === "SUCCESS" ||
        shift.googleSyncStatus === "FAILED"
          ? shift.googleSyncStatus
          : "PENDING",
      googleSyncError: shift.googleSyncError,
      googleSyncedAt: shift.googleSyncedAt?.toISOString() ?? null,
      workedMinutes,
      estimatedPay,
      workplace: {
        id: shift.workplace.id,
        name: shift.workplace.name,
        color: shift.workplace.color,
        type: shift.workplace.type,
      },
      lessonRange: shift.lessonRange
        ? {
            id: shift.lessonRange.id,
            shiftId: shift.lessonRange.shiftId,
            startPeriod: shift.lessonRange.startPeriod,
            endPeriod: shift.lessonRange.endPeriod,
          }
        : null,
    };
  });
}

async function getUnconfirmedShiftCount(userId: string): Promise<number> {
  return prisma.shift.count({
    where: {
      workplace: {
        userId,
      },
      date: {
        lte: startOfUtcDay(new Date()),
      },
      isConfirmed: false,
    },
  });
}

async function DashboardPageContent({ month }: { month: Date }) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const startDate = toDateOnlyString(startOfMonth(month));
  const endDate = toDateOnlyString(endOfMonth(month));
  const [initialMonthShifts, initialUnconfirmedShiftCount] = await Promise.all([
    getMonthShiftsWithEstimate(current.user.id, startDate, endDate),
    getUnconfirmedShiftCount(current.user.id),
  ]);

  return (
    <DashboardPageClient
      currentUserId={current.user.id}
      initialMonthShifts={initialMonthShifts}
      initialMonthStartDate={startDate}
      initialMonthEndDate={endDate}
      initialUnconfirmedShiftCount={initialUnconfirmedShiftCount}
    />
  );
}

type DashboardPageSearchParams = {
  month?: string | string[];
};

type DashboardPageProps = {
  searchParams?: DashboardPageSearchParams | Promise<DashboardPageSearchParams>;
};

export default async function Page({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as DashboardPageSearchParams);
  const month = resolveInitialMonth(resolvedSearchParams.month);

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardPageContent month={month} />
    </Suspense>
  );
}

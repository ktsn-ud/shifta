import { redirect } from "next/navigation";
import { ShiftListPageClient } from "@/components/shifts/shift-list-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import {
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { type MonthShift } from "@/hooks/use-month-shifts";
import { type Prisma } from "@/lib/generated/prisma/client";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { prisma } from "@/lib/prisma";

type ShiftListPageSearchParams = {
  month?: string | string[];
};

type ShiftListPageProps = {
  searchParams?: ShiftListPageSearchParams | Promise<ShiftListPageSearchParams>;
};

type ShiftWithRelations = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
    workplace: true;
  };
}>;

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
    const normalizedShiftType =
      shift.shiftType === "LESSON" ? "LESSON" : "NORMAL";
    const workedMinutes = calculateWorkedMinutes({
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      shiftType: normalizedShiftType,
      lessonRange: shift.lessonRange
        ? {
            timetableSetId:
              (
                shift.lessonRange as {
                  timetableSetId?: string;
                }
              ).timetableSetId ?? "",
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
      shiftType: normalizedShiftType,
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
            timetableSetId:
              (
                shift.lessonRange as {
                  timetableSetId?: string;
                }
              ).timetableSetId ?? "",
            startPeriod: shift.lessonRange.startPeriod,
            endPeriod: shift.lessonRange.endPeriod,
          }
        : null,
    };
  });
}

export default async function ShiftListPage({
  searchParams,
}: ShiftListPageProps) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as ShiftListPageSearchParams);
  const month = resolveInitialMonth(resolvedSearchParams.month);
  const monthStart = startOfMonth(month);
  const monthValue = toMonthInputValue(monthStart);
  const startDate = toDateOnlyString(monthStart);
  const endDate = toDateOnlyString(endOfMonth(monthStart));
  const initialMonthShifts = await getMonthShiftsWithEstimate(
    current.user.id,
    startDate,
    endDate,
  );

  return (
    <ShiftListPageClient
      currentUserId={current.user.id}
      initialMonth={monthValue}
      initialMonthShifts={initialMonthShifts}
      initialMonthStartDate={startDate}
      initialMonthEndDate={endDate}
    />
  );
}

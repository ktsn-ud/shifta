import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShiftConfirmPageLoadingSkeleton } from "@/components/shifts/ShiftConfirmLoadingSkeleton";
import { ShiftConfirmPageClient } from "@/components/shifts/shift-confirm-page-client";
import {
  type ConfirmedShiftWorkplaceGroup,
  type UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
import { requireCurrentUser } from "@/lib/api/current-user";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { prisma } from "@/lib/prisma";

const DATE_PART_PADDING = 2;

function pad(value: number): string {
  return String(value).padStart(DATE_PART_PADDING, "0");
}

function toDateOnlyString(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function toTimeOnlyString(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateWithWeekday(dateOnly: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(parseDateOnly(dateOnly));
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function getCurrentMonthRangeUtc(base: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)),
    end: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1)),
  };
}

async function getShiftConfirmationInitialData(userId: string): Promise<{
  unconfirmedShifts: UnconfirmedShiftItem[];
  confirmedShiftGroups: ConfirmedShiftWorkplaceGroup[];
}> {
  const [unconfirmedShiftsRaw, confirmedShiftsRaw] = await Promise.all([
    prisma.shift.findMany({
      where: {
        workplace: {
          userId,
        },
        date: {
          lte: startOfUtcDay(new Date()),
        },
        isConfirmed: false,
      },
      include: {
        workplace: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.shift.findMany({
      where: {
        workplace: {
          userId,
        },
        date: {
          gte: getCurrentMonthRangeUtc(new Date()).start,
          lt: getCurrentMonthRangeUtc(new Date()).end,
        },
        isConfirmed: true,
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
      orderBy: [
        {
          workplace: {
            name: "asc",
          },
        },
        { date: "asc" },
        { startTime: "asc" },
      ],
    }),
  ]);

  const workplaceIds = Array.from(
    new Set(confirmedShiftsRaw.map((shift) => shift.workplaceId)),
  );
  const payrollRules =
    workplaceIds.length > 0
      ? await prisma.payrollRule.findMany({
          where: {
            workplaceId: {
              in: workplaceIds,
            },
          },
          orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
        })
      : [];
  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);

  const unconfirmedShifts = unconfirmedShiftsRaw.map((shift) => ({
    id: shift.id,
    date: formatDateWithWeekday(toDateOnlyString(shift.date)),
    workplaceName: shift.workplace.name,
    workplaceColor: shift.workplace.color,
    comment: shift.comment,
    startTime: toTimeOnlyString(shift.startTime),
    endTime: toTimeOnlyString(shift.endTime),
    breakMinutes: shift.breakMinutes,
  }));

  const grouped = new Map<string, ConfirmedShiftWorkplaceGroup>();

  for (const shift of confirmedShiftsRaw) {
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

    const wage = selectedRule
      ? calculateShiftPayrollResultByRule(shift, selectedRule).totalWage
      : null;

    const entry = {
      id: shift.id,
      date: formatDateWithWeekday(toDateOnlyString(shift.date)),
      comment: shift.comment,
      startTime: toTimeOnlyString(shift.startTime),
      endTime: toTimeOnlyString(shift.endTime),
      workDurationHours: workedMinutes / 60,
      wage,
    };

    const existing = grouped.get(shift.workplace.id);
    if (existing) {
      existing.shifts.push(entry);
      continue;
    }

    grouped.set(shift.workplace.id, {
      workplaceId: shift.workplace.id,
      workplaceName: shift.workplace.name,
      workplaceColor: shift.workplace.color,
      shifts: [entry],
    });
  }

  return {
    unconfirmedShifts,
    confirmedShiftGroups: Array.from(grouped.values()),
  };
}

function ShiftConfirmPageFallback() {
  return <ShiftConfirmPageLoadingSkeleton />;
}

async function ShiftConfirmPageContent() {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialData = await getShiftConfirmationInitialData(current.user.id);

  return (
    <ShiftConfirmPageClient
      initialUnconfirmedShifts={initialData.unconfirmedShifts}
      initialConfirmedShiftGroups={initialData.confirmedShiftGroups}
    />
  );
}

export default function ShiftConfirmPage() {
  return (
    <Suspense fallback={<ShiftConfirmPageFallback />}>
      <ShiftConfirmPageContent />
    </Suspense>
  );
}

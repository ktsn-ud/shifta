import type { ConfirmedShiftWorkplaceGroup } from "@/components/shifts/shift-confirmation-types";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import {
  buildPayrollRuleWhereForDateRange,
  resolvePayrollRuleDateRange,
} from "@/lib/payroll/rule-query";
import { prisma } from "@/lib/prisma";

const DATE_PART_PADDING = 2;
const dateWithWeekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "UTC",
});

export type UnconfirmedShiftApiItem = {
  id: string;
  workplaceId: string;
  comment: string | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isConfirmed: boolean;
  workplace: {
    id: string;
    name: string;
    color: string;
  };
};

export type ConfirmedCurrentMonthShiftApiItem = {
  id: string;
  comment: string | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workDurationHours: number;
  wage: number | null;
  isConfirmed: boolean;
  workplace: {
    id: string;
    name: string;
    color: string;
  };
};

export type ShiftConfirmationInitialData = {
  unconfirmedShifts: UnconfirmedShiftItem[];
  confirmedShiftGroups: ConfirmedShiftWorkplaceGroup[];
};

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
  return dateWithWeekdayFormatter.format(parseDateOnly(dateOnly));
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

async function getUnconfirmedShiftRows(userId: string) {
  return prisma.shift.findMany({
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
  });
}

async function getConfirmedCurrentMonthShiftRows(userId: string) {
  return prisma.shift.findMany({
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
  });
}

function mapUnconfirmedShiftApiItems(
  unconfirmedShiftsRaw: Awaited<ReturnType<typeof getUnconfirmedShiftRows>>,
): UnconfirmedShiftApiItem[] {
  return unconfirmedShiftsRaw.map((shift) => ({
    id: shift.id,
    workplaceId: shift.workplace.id,
    comment: shift.comment,
    date: toDateOnlyString(shift.date),
    startTime: toTimeOnlyString(shift.startTime),
    endTime: toTimeOnlyString(shift.endTime),
    breakMinutes: shift.breakMinutes,
    isConfirmed: shift.isConfirmed,
    workplace: shift.workplace,
  }));
}

async function mapConfirmedCurrentMonthShiftApiItems(
  confirmedShiftsRaw: Awaited<
    ReturnType<typeof getConfirmedCurrentMonthShiftRows>
  >,
): Promise<ConfirmedCurrentMonthShiftApiItem[]> {
  const workplaceIds = Array.from(
    new Set(confirmedShiftsRaw.map((shift) => shift.workplaceId)),
  );
  const payrollRuleDateRange = resolvePayrollRuleDateRange(confirmedShiftsRaw);
  const payrollRules =
    workplaceIds.length > 0 && payrollRuleDateRange
      ? await prisma.payrollRule.findMany({
          where: buildPayrollRuleWhereForDateRange(
            workplaceIds,
            payrollRuleDateRange,
          ),
          orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
        })
      : [];
  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);

  return confirmedShiftsRaw.map((shift) => {
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

    return {
      id: shift.id,
      comment: shift.comment,
      date: toDateOnlyString(shift.date),
      startTime: toTimeOnlyString(shift.startTime),
      endTime: toTimeOnlyString(shift.endTime),
      breakMinutes: shift.breakMinutes,
      workDurationHours: workedMinutes / 60,
      wage,
      isConfirmed: shift.isConfirmed,
      workplace: shift.workplace,
    };
  });
}

export async function getUnconfirmedShiftApiItems(
  userId: string,
): Promise<UnconfirmedShiftApiItem[]> {
  const rows = await getUnconfirmedShiftRows(userId);
  return mapUnconfirmedShiftApiItems(rows);
}

export async function getConfirmedCurrentMonthShiftApiItems(
  userId: string,
): Promise<ConfirmedCurrentMonthShiftApiItem[]> {
  const rows = await getConfirmedCurrentMonthShiftRows(userId);
  return mapConfirmedCurrentMonthShiftApiItems(rows);
}

export async function getShiftConfirmationInitialData(
  userId: string,
): Promise<ShiftConfirmationInitialData> {
  const [unconfirmedRows, confirmedRows] = await Promise.all([
    getUnconfirmedShiftRows(userId),
    getConfirmedCurrentMonthShiftRows(userId),
  ]);
  const [unconfirmedApiItems, confirmedApiItems] = await Promise.all([
    Promise.resolve(mapUnconfirmedShiftApiItems(unconfirmedRows)),
    mapConfirmedCurrentMonthShiftApiItems(confirmedRows),
  ]);

  const unconfirmedShifts = unconfirmedApiItems.map((shift) => ({
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: formatDateWithWeekday(shift.date),
    workplaceName: shift.workplace.name,
    workplaceColor: shift.workplace.color,
    comment: shift.comment,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
  }));

  const grouped = new Map<string, ConfirmedShiftWorkplaceGroup>();

  for (const shift of confirmedApiItems) {
    const workplaceId = shift.workplace.id;
    const existing = grouped.get(workplaceId);
    const entry = {
      id: shift.id,
      date: formatDateWithWeekday(shift.date),
      comment: shift.comment,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDurationHours: shift.workDurationHours,
      wage: shift.wage,
    };

    if (existing) {
      existing.shifts.push(entry);
      continue;
    }

    grouped.set(workplaceId, {
      workplaceId,
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

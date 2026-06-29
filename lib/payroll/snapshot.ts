import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import type { PayrollRule, Prisma } from "@/lib/generated/prisma/client";
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
import { userPayrollSnapshotTag } from "@/lib/cache/tags";

type PayrollSnapshotRule = PayrollRule;

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

type SerializedPayrollPeriod = {
  paymentDate: string;
  periodStartDate: string;
  periodEndDate: string;
};

type SerializedPayrollSnapshotShift = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isConfirmed: boolean;
  shiftType: "NORMAL" | "LESSON";
  comment: string | null;
  googleEventId: string | null;
  googleSyncStatus: string;
  googleSyncError: string | null;
  googleSyncedAt: string | null;
  createdAt: string;
  lessonRange: {
    id: string;
    shiftId: string;
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

type SerializedPayrollRule = {
  id: string;
  workplaceId: string;
  startDate: string;
  endDate: string | null;
  baseHourlyWage: string;
  holidayAllowanceHourly: string;
  nightPremiumRate: string;
  overtimePremiumRate: string;
  dailyOvertimeThreshold: string;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
};

type SerializedPayrollSnapshot = {
  workplaces: PayrollSnapshotWorkplace[];
  workplaceIds: string[];
  monthKeys: string[];
  periodByWorkplaceMonthEntries: Array<[string, SerializedPayrollPeriod]>;
  shifts: SerializedPayrollSnapshotShift[];
  payrollRules: SerializedPayrollRule[];
  actualPayrollByWorkplaceMonthEntries: Array<[string, ActualPayrollRecord]>;
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

function toSerializedPeriod(period: PayrollPeriod): SerializedPayrollPeriod {
  return {
    paymentDate: period.paymentDate.toISOString(),
    periodStartDate: period.periodStartDate.toISOString(),
    periodEndDate: period.periodEndDate.toISOString(),
  };
}

function fromSerializedPeriod(period: SerializedPayrollPeriod): PayrollPeriod {
  return {
    paymentDate: new Date(period.paymentDate),
    periodStartDate: new Date(period.periodStartDate),
    periodEndDate: new Date(period.periodEndDate),
  };
}

function toSerializedShift(
  shift: PayrollSnapshotShift,
): SerializedPayrollSnapshotShift {
  return {
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: shift.date.toISOString(),
    startTime: shift.startTime.toISOString(),
    endTime: shift.endTime.toISOString(),
    breakMinutes: shift.breakMinutes,
    isConfirmed: shift.isConfirmed,
    shiftType: shift.shiftType,
    comment: shift.comment,
    googleEventId: shift.googleEventId,
    googleSyncStatus: shift.googleSyncStatus,
    googleSyncError: shift.googleSyncError,
    googleSyncedAt: shift.googleSyncedAt?.toISOString() ?? null,
    createdAt: shift.createdAt.toISOString(),
    lessonRange: shift.lessonRange
      ? {
          id: shift.lessonRange.id,
          shiftId: shift.lessonRange.shiftId,
          timetableSetId: shift.lessonRange.timetableSetId,
          startPeriod: shift.lessonRange.startPeriod,
          endPeriod: shift.lessonRange.endPeriod,
        }
      : null,
  };
}

function fromSerializedShift(
  shift: SerializedPayrollSnapshotShift,
): PayrollSnapshotShift {
  return {
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: new Date(shift.date),
    startTime: new Date(shift.startTime),
    endTime: new Date(shift.endTime),
    breakMinutes: shift.breakMinutes,
    isConfirmed: shift.isConfirmed,
    shiftType: shift.shiftType,
    comment: shift.comment,
    googleEventId: shift.googleEventId,
    googleSyncStatus: shift.googleSyncStatus,
    googleSyncError: shift.googleSyncError,
    googleSyncedAt: shift.googleSyncedAt
      ? new Date(shift.googleSyncedAt)
      : null,
    createdAt: new Date(shift.createdAt),
    lessonRange: shift.lessonRange
      ? {
          id: shift.lessonRange.id,
          shiftId: shift.lessonRange.shiftId,
          timetableSetId: shift.lessonRange.timetableSetId,
          startPeriod: shift.lessonRange.startPeriod,
          endPeriod: shift.lessonRange.endPeriod,
        }
      : null,
  };
}

function toSerializedPayrollRule(rule: {
  id: string;
  workplaceId: string;
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: { toString(): string };
  holidayAllowanceHourly: { toString(): string };
  nightPremiumRate: { toString(): string };
  overtimePremiumRate: { toString(): string };
  dailyOvertimeThreshold: { toString(): string };
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
}): SerializedPayrollRule {
  return {
    id: rule.id,
    workplaceId: rule.workplaceId,
    startDate: rule.startDate.toISOString(),
    endDate: rule.endDate?.toISOString() ?? null,
    baseHourlyWage: rule.baseHourlyWage.toString(),
    holidayAllowanceHourly: rule.holidayAllowanceHourly.toString(),
    nightPremiumRate: rule.nightPremiumRate.toString(),
    overtimePremiumRate: rule.overtimePremiumRate.toString(),
    dailyOvertimeThreshold: rule.dailyOvertimeThreshold.toString(),
    holidayType: rule.holidayType,
  };
}

function fromSerializedPayrollRule(
  rule: SerializedPayrollRule,
): PayrollSnapshotRule {
  return {
    id: rule.id,
    workplaceId: rule.workplaceId,
    startDate: new Date(rule.startDate),
    endDate: rule.endDate ? new Date(rule.endDate) : null,
    baseHourlyWage: rule.baseHourlyWage as unknown as Prisma.Decimal,
    holidayAllowanceHourly:
      rule.holidayAllowanceHourly as unknown as Prisma.Decimal,
    nightPremiumRate: rule.nightPremiumRate as unknown as Prisma.Decimal,
    overtimePremiumRate: rule.overtimePremiumRate as unknown as Prisma.Decimal,
    dailyOvertimeThreshold:
      rule.dailyOvertimeThreshold as unknown as Prisma.Decimal,
    holidayType: rule.holidayType,
  };
}

function toMonthKeys(monthDates: Date[]): string[] {
  const normalizedMonths = new Map<string, Date>();

  for (const monthDate of monthDates) {
    const normalizedMonth = startOfMonthUtc(monthDate);
    normalizedMonths.set(toMonthKeyUtc(normalizedMonth), normalizedMonth);
  }

  return Array.from(normalizedMonths.keys()).sort((left, right) =>
    left.localeCompare(right),
  );
}

function parseMonthKeyToDate(monthKey: string): Date {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  return new Date(Date.UTC(year, month - 1, 1));
}

function serializeSnapshot(
  snapshot: Omit<PayrollSnapshot, "shiftsByWorkplace" | "rulesByWorkplace"> & {
    shifts: PayrollSnapshotShift[];
    payrollRules: PayrollSnapshotRule[];
  },
): SerializedPayrollSnapshot {
  return {
    workplaces: snapshot.workplaces,
    workplaceIds: snapshot.workplaceIds,
    monthKeys: snapshot.monthKeys,
    periodByWorkplaceMonthEntries: Array.from(
      snapshot.periodByWorkplaceMonth.entries(),
      ([key, period]) => [key, toSerializedPeriod(period)],
    ),
    shifts: snapshot.shifts.map(toSerializedShift),
    payrollRules: snapshot.payrollRules.map(toSerializedPayrollRule),
    actualPayrollByWorkplaceMonthEntries: Array.from(
      snapshot.actualPayrollByWorkplaceMonth.entries(),
    ),
  };
}

function deserializeSnapshot(
  snapshot: SerializedPayrollSnapshot,
): PayrollSnapshot {
  const shifts = snapshot.shifts.map(fromSerializedShift);
  const payrollRules = snapshot.payrollRules.map(fromSerializedPayrollRule);

  return {
    workplaces: snapshot.workplaces,
    workplaceIds: snapshot.workplaceIds,
    monthKeys: snapshot.monthKeys,
    periodByWorkplaceMonth: new Map(
      snapshot.periodByWorkplaceMonthEntries.map(([key, period]) => [
        key,
        fromSerializedPeriod(period),
      ]),
    ),
    shiftsByWorkplace: groupShiftsByWorkplace(shifts),
    rulesByWorkplace: groupPayrollRulesByWorkplace(payrollRules),
    actualPayrollByWorkplaceMonth: new Map(
      snapshot.actualPayrollByWorkplaceMonthEntries,
    ),
  };
}

async function loadPayrollSnapshotSource(params: {
  userId: string;
  monthKeys: string[];
  includeActualPayroll: boolean;
}): Promise<SerializedPayrollSnapshot> {
  const monthDates = params.monthKeys.map(parseMonthKeyToDate);

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
      monthKeys: params.monthKeys,
      periodByWorkplaceMonthEntries: [],
      shifts: [],
      payrollRules: [],
      actualPayrollByWorkplaceMonthEntries: [],
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
            monthKeys: params.monthKeys,
          })
        : Promise.resolve(new Map<string, ActualPayrollRecord>()),
    ]);

  return serializeSnapshot({
    workplaces,
    workplaceIds,
    monthKeys: params.monthKeys,
    periodByWorkplaceMonth,
    shifts,
    payrollRules,
    actualPayrollByWorkplaceMonth,
  });
}

const loadCachedPayrollSnapshot = cache(
  async (
    userId: string,
    monthKeysSignature: string,
    includeActualPayroll: boolean,
  ): Promise<SerializedPayrollSnapshot> =>
    loadCachedPayrollSnapshotEntry(
      userId,
      monthKeysSignature,
      includeActualPayroll,
    ),
);

async function loadCachedPayrollSnapshotEntry(
  userId: string,
  monthKeysSignature: string,
  includeActualPayroll: boolean,
): Promise<SerializedPayrollSnapshot> {
  "use cache";

  cacheLife("minutes");
  cacheTag(userPayrollSnapshotTag(userId));

  const monthKeys =
    monthKeysSignature.length > 0 ? monthKeysSignature.split(",") : [];

  return loadPayrollSnapshotSource({
    userId,
    monthKeys,
    includeActualPayroll,
  });
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
  const monthKeys = toMonthKeys(params.monthDates);

  if (monthKeys.length === 0) {
    return {
      workplaces: [],
      workplaceIds: [],
      monthKeys: [],
      periodByWorkplaceMonth: new Map(),
      shiftsByWorkplace: new Map(),
      rulesByWorkplace: new Map(),
      actualPayrollByWorkplaceMonth: new Map(),
    };
  }

  const serialized = await loadCachedPayrollSnapshot(
    params.userId,
    monthKeys.join(","),
    params.includeActualPayroll ?? false,
  );

  return deserializeSnapshot(serialized);
}

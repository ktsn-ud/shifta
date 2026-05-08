import { parseDateOnly } from "@/lib/api/date-time";
import { type Prisma } from "@/lib/generated/prisma/client";
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

type ShiftWithRelations = Prisma.ShiftGetPayload<{
  include: {
    lessonRange: true;
    workplace: true;
  };
}>;

type MonthShiftQueryParams = {
  userId: string;
  startDate: string;
  endDate: string;
  includeEstimate: boolean;
  workplaceIds?: string[];
};

type MonthShiftDto = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftType: "NORMAL" | "LESSON";
  comment: string | null;
  googleSyncStatus: "PENDING" | "SUCCESS" | "FAILED";
  googleSyncError: string | null;
  googleSyncedAt: string | null;
  workedMinutes: number;
  estimatedPay: number | null;
  workplace: {
    id: string;
    name: string;
    color: string;
    type: "GENERAL" | "CRAM_SCHOOL";
  };
  lessonRange: {
    id: string;
    shiftId: string;
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

function toMonthShiftDto(
  shift: ShiftWithRelations,
  estimatedPay: number | null,
): MonthShiftDto {
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

  return {
    id: shift.id,
    workplaceId: shift.workplaceId,
    date: shift.date.toISOString(),
    startTime: shift.startTime.toISOString(),
    endTime: shift.endTime.toISOString(),
    breakMinutes: shift.breakMinutes,
    shiftType: normalizedShiftType,
    comment: shift.comment,
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
}

export async function getMonthShifts(
  params: MonthShiftQueryParams,
): Promise<MonthShiftDto[]> {
  const { userId, startDate, endDate, includeEstimate, workplaceIds } = params;

  const normalizedWorkplaceIds = workplaceIds
    ? Array.from(new Set(workplaceIds))
    : null;
  if (normalizedWorkplaceIds && normalizedWorkplaceIds.length === 0) {
    return [];
  }

  const shifts = await prisma.shift.findMany({
    where: {
      workplace: { userId },
      ...(normalizedWorkplaceIds
        ? {
            workplaceId: {
              in: normalizedWorkplaceIds,
            },
          }
        : {}),
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

  if (!includeEstimate) {
    return shifts.map((shift) => toMonthShiftDto(shift, null));
  }

  const relatedWorkplaceIds = Array.from(
    new Set(shifts.map((shift) => shift.workplaceId)),
  );
  const payrollRuleDateRange = resolvePayrollRuleDateRange(shifts);
  if (!payrollRuleDateRange || relatedWorkplaceIds.length === 0) {
    return shifts.map((shift) => toMonthShiftDto(shift, null));
  }

  const payrollRules = await prisma.payrollRule.findMany({
    where: buildPayrollRuleWhereForDateRange(
      relatedWorkplaceIds,
      payrollRuleDateRange,
    ),
    orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
  });
  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);

  return shifts.map((shift) => {
    const selectedRule = findApplicablePayrollRule(
      rulesByWorkplace,
      shift.workplaceId,
      shift.date,
    );
    const estimatedPay = selectedRule
      ? calculateShiftPayrollResultByRule(shift, selectedRule).totalWage
      : null;

    return toMonthShiftDto(shift, estimatedPay);
  });
}

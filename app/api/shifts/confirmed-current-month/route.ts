import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
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
import { jsonNoStore } from "@/lib/api/cache-control";

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

function getCurrentMonthRangeUtc(base: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)),
    end: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1)),
  };
}

export async function GET() {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { start, end } = getCurrentMonthRangeUtc(new Date());
    const shifts = await prisma.shift.findMany({
      where: {
        workplace: {
          userId: current.user.id,
        },
        date: {
          gte: start,
          lt: end,
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

    const workplaceIds = Array.from(
      new Set(shifts.map((shift) => shift.workplaceId)),
    );
    const payrollRuleDateRange = resolvePayrollRuleDateRange(shifts);
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

    return jsonNoStore({
      shifts: shifts.map((shift) => {
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
      }),
    });
  } catch (error) {
    console.error("GET /api/shifts/confirmed-current-month failed", error);
    return jsonError("確定済みシフトの取得に失敗しました", 500);
  }
}

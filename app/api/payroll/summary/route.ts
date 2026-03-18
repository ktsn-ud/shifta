import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time";
import { jsonError } from "@/lib/api/http";
import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
  Workplace,
} from "@/lib/generated/prisma/client";
import { calculateLessonShiftWage } from "@/lib/payroll/calculateLessonShiftWage";
import {
  calculateOtherShiftWage,
  type PayrollResult,
} from "@/lib/payroll/calculateShiftWage";
import { prisma } from "@/lib/prisma";

const summaryQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "startDate は YYYY-MM-DD形式で入力してください"),
    endDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "endDate は YYYY-MM-DD形式で入力してください"),
  })
  .refine(
    (value) => parseDateOnly(value.startDate) <= parseDateOnly(value.endDate),
    {
      message: "startDate は endDate 以下で指定してください",
      path: ["startDate"],
    },
  );

type ShiftWithRelations = Shift & {
  lessonRange: ShiftLessonRange | null;
  workplace: Pick<Workplace, "id" | "name" | "color">;
};

type PeriodSummary = {
  totalWage: number;
  totalWorkHours: number;
  totalNightHours: number;
  totalOvertimeHours: number;
  byWorkplace: Array<{
    workplaceId: string;
    workplaceName: string;
    workplaceColor: string;
    wage: number;
    workHours: number;
  }>;
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

function isWithin(date: Date, startDate: Date, endDate: Date): boolean {
  const time = date.getTime();
  return time >= startDate.getTime() && time <= endDate.getTime();
}

function findApplicableRule(
  rulesByWorkplace: Map<string, PayrollRule[]>,
  workplaceId: string,
  shiftDate: Date,
): PayrollRule | null {
  const rules = rulesByWorkplace.get(workplaceId) ?? [];
  const shiftTime = shiftDate.getTime();

  for (const rule of rules) {
    const startTime = rule.startDate.getTime();
    const endTime = rule.endDate?.getTime() ?? Number.POSITIVE_INFINITY;

    if (startTime <= shiftTime && shiftTime < endTime) {
      return rule;
    }
  }

  return null;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateShiftResult(
  shift: ShiftWithRelations,
  rulesByWorkplace: Map<string, PayrollRule[]>,
): PayrollResult {
  const rule = findApplicableRule(
    rulesByWorkplace,
    shift.workplaceId,
    shift.date,
  );
  if (!rule) {
    throw new Error(`該当する給与ルールが見つかりません: shiftId=${shift.id}`);
  }

  if (shift.shiftType === "LESSON") {
    if (!shift.lessonRange) {
      throw new Error(
        `LESSON型のコマ範囲が見つかりません: shiftId=${shift.id}`,
      );
    }
    return calculateLessonShiftWage(shift, shift.lessonRange, rule);
  }

  return calculateOtherShiftWage(shift, rule);
}

function summarizePeriod(
  shifts: ShiftWithRelations[],
  rulesByWorkplace: Map<string, PayrollRule[]>,
  startDate: Date,
  endDate: Date,
): PeriodSummary {
  const targetShifts = shifts.filter((shift) =>
    isWithin(shift.date, startDate, endDate),
  );

  const byWorkplace = new Map<
    string,
    {
      workplaceId: string;
      workplaceName: string;
      workplaceColor: string;
      wage: number;
      workHours: number;
    }
  >();

  let totalWage = 0;
  let totalWorkHours = 0;
  let totalNightHours = 0;
  let totalOvertimeHours = 0;

  for (const shift of targetShifts) {
    const result = calculateShiftResult(shift, rulesByWorkplace);

    totalWage += result.totalWage;
    totalWorkHours += result.workHours;
    totalNightHours += result.nightHours;
    totalOvertimeHours += result.overtimeHours;

    const existing = byWorkplace.get(shift.workplaceId);
    if (existing) {
      existing.wage += result.totalWage;
      existing.workHours += result.workHours;
    } else {
      byWorkplace.set(shift.workplaceId, {
        workplaceId: shift.workplace.id,
        workplaceName: shift.workplace.name,
        workplaceColor: shift.workplace.color,
        wage: result.totalWage,
        workHours: result.workHours,
      });
    }
  }

  return {
    totalWage: Math.round(totalWage),
    totalWorkHours: roundHours(totalWorkHours),
    totalNightHours: roundHours(totalNightHours),
    totalOvertimeHours: roundHours(totalOvertimeHours),
    byWorkplace: Array.from(byWorkplace.values())
      .map((item) => ({
        ...item,
        wage: Math.round(item.wage),
        workHours: roundHours(item.workHours),
      }))
      .sort((left, right) => right.wage - left.wage),
  };
}

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = summaryQuerySchema.safeParse({
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const startDate = parseDateOnly(query.data.startDate);
    const endDate = parseDateOnly(query.data.endDate);
    const previousStartDate = shiftMonthClamped(startDate, -1);
    const previousEndDate = shiftMonthClamped(endDate, -1);
    const cumulativeStartDate = startOfYear(endDate);

    const fetchStartDate =
      previousStartDate < cumulativeStartDate
        ? previousStartDate
        : cumulativeStartDate;

    const shifts = await prisma.shift.findMany({
      where: {
        workplace: { userId: current.user.id },
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

    const rulesByWorkplace = new Map<string, PayrollRule[]>();
    if (workplaceIds.length > 0) {
      const rules = await prisma.payrollRule.findMany({
        where: {
          workplaceId: {
            in: workplaceIds,
          },
        },
        orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
      });

      for (const rule of rules) {
        const existing = rulesByWorkplace.get(rule.workplaceId) ?? [];
        existing.push(rule);
        rulesByWorkplace.set(rule.workplaceId, existing);
      }
    }

    const currentSummary = summarizePeriod(
      shifts,
      rulesByWorkplace,
      startDate,
      endDate,
    );
    const previousSummary = summarizePeriod(
      shifts,
      rulesByWorkplace,
      previousStartDate,
      previousEndDate,
    );
    const cumulativeSummary = summarizePeriod(
      shifts,
      rulesByWorkplace,
      cumulativeStartDate,
      endDate,
    );

    return NextResponse.json({
      ...currentSummary,
      previousMonthWage: previousSummary.totalWage,
      currentMonthCumulative: cumulativeSummary.totalWage,
      yearlyTotal: cumulativeSummary.totalWage,
    });
  } catch (error) {
    console.error("GET /api/payroll/summary failed", error);
    return jsonError("給与集計の取得に失敗しました", 500);
  }
}

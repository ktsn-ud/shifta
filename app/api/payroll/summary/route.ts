import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time";
import { jsonError } from "@/lib/api/http";
import { summarizeByPeriod } from "@/lib/payroll/summarizeByPeriod";
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

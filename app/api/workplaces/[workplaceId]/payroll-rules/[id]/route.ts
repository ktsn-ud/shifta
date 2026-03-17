import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/lib/api/current-user"
import { parseDateOnly, parseTimeOnly, DATE_ONLY_REGEX, TIME_ONLY_REGEX } from "@/lib/api/date-time"
import { jsonError, parseJsonBody } from "@/lib/api/http"
import { requireOwnedWorkplace } from "@/lib/api/workplace"
import { prisma } from "@/lib/prisma"

const payrollRuleSchema = z
  .object({
    startDate: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    endDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください")
      .nullable()
      .optional(),
    baseHourlyWage: z.coerce.number().positive(),
    perLessonWage: z.coerce.number().positive().nullable().optional(),
    holidayHourlyWage: z.coerce.number().positive().nullable().optional(),
    nightMultiplier: z.coerce.number().min(1),
    overtimeMultiplier: z.coerce.number().min(1),
    nightStart: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    nightEnd: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    dailyOvertimeThreshold: z.coerce.number().positive(),
    holidayType: z.enum(["NONE", "WEEKEND", "HOLIDAY", "WEEKEND_HOLIDAY"]),
  })
  .strict()

type Context = {
  params: Promise<{ workplaceId: string; id: string }>
}

type NormalizedPayrollRule = {
  startDate: Date
  endDate: Date | null
  baseHourlyWage: number
  perLessonWage: number | null
  holidayHourlyWage: number | null
  nightMultiplier: number
  overtimeMultiplier: number
  nightStart: Date
  nightEnd: Date
  dailyOvertimeThreshold: number
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY"
}

function normalizePayrollRule(input: z.infer<typeof payrollRuleSchema>): NormalizedPayrollRule {
  const startDate = parseDateOnly(input.startDate)
  const endDate = input.endDate ? parseDateOnly(input.endDate) : null

  if (endDate && endDate <= startDate) {
    throw new Error("DATE_RANGE_INVALID")
  }

  return {
    startDate,
    endDate,
    baseHourlyWage: input.baseHourlyWage,
    perLessonWage: input.perLessonWage ?? null,
    holidayHourlyWage: input.holidayHourlyWage ?? null,
    nightMultiplier: input.nightMultiplier,
    overtimeMultiplier: input.overtimeMultiplier,
    nightStart: parseTimeOnly(input.nightStart),
    nightEnd: parseTimeOnly(input.nightEnd),
    dailyOvertimeThreshold: input.dailyOvertimeThreshold,
    holidayType: input.holidayType,
  }
}

function isOverlapping(
  startA: Date,
  endA: Date | null,
  startB: Date,
  endB: Date | null,
): boolean {
  const startATime = startA.getTime()
  const startBTime = startB.getTime()
  const endATime = endA ? endA.getTime() : Number.POSITIVE_INFINITY
  const endBTime = endB ? endB.getTime() : Number.POSITIVE_INFINITY

  return startATime < endBTime && startBTime < endATime
}

async function findOverlappingRules(
  workplaceId: string,
  normalized: NormalizedPayrollRule,
  excludeId?: string,
) {
  const rules = await prisma.payrollRule.findMany({
    where: {
      workplaceId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  })

  return rules.filter((rule) =>
    isOverlapping(normalized.startDate, normalized.endDate, rule.startDate, rule.endDate),
  )
}

function validateByWorkplaceType(
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
  normalized: NormalizedPayrollRule,
): string | null {
  if (workplaceType === "GENERAL" && normalized.baseHourlyWage <= 0) {
    return "GENERAL勤務先では baseHourlyWage を正の数で指定してください"
  }

  if (workplaceType === "CRAM_SCHOOL") {
    if (normalized.perLessonWage === null || normalized.perLessonWage <= 0) {
      return "CRAM_SCHOOL勤務先では perLessonWage を正の数で指定してください"
    }
  }

  return null
}

async function findPayrollRule(id: string, workplaceId: string) {
  return prisma.payrollRule.findFirst({
    where: {
      id,
      workplaceId,
    },
  })
}

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { workplaceId, id } = await context.params
    const workplaceResult = await requireOwnedWorkplace(workplaceId, current.user.id)
    if ("response" in workplaceResult) {
      return workplaceResult.response
    }

    const rule = await findPayrollRule(id, workplaceId)
    if (!rule) {
      return jsonError("給与ルールが見つかりません", 404)
    }

    return NextResponse.json({ data: rule })
  } catch (error) {
    console.error("GET /api/workplaces/:workplaceId/payroll-rules/:id failed", error)
    return jsonError("給与ルールの取得に失敗しました", 500)
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { workplaceId, id } = await context.params
    const workplaceResult = await requireOwnedWorkplace(workplaceId, current.user.id)
    if ("response" in workplaceResult) {
      return workplaceResult.response
    }

    const existing = await findPayrollRule(id, workplaceId)
    if (!existing) {
      return jsonError("給与ルールが見つかりません", 404)
    }

    const body = await parseJsonBody(request, payrollRuleSchema)
    if (!body.success) {
      return body.response
    }

    let normalized: NormalizedPayrollRule
    try {
      normalized = normalizePayrollRule(body.data)
    } catch (error) {
      if (error instanceof Error && error.message === "DATE_RANGE_INVALID") {
        return jsonError("endDate は startDate より後の日付にしてください", 400)
      }
      return jsonError("日付または時刻の形式が不正です", 400)
    }

    const typeValidationError = validateByWorkplaceType(
      workplaceResult.workplace.type,
      normalized,
    )
    if (typeValidationError) {
      return jsonError(typeValidationError, 400)
    }

    const overlaps = await findOverlappingRules(workplaceId, normalized, id)

    const rule = await prisma.payrollRule.update({
      where: { id },
      data: {
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        baseHourlyWage: normalized.baseHourlyWage.toString(),
        perLessonWage:
          normalized.perLessonWage === null ? null : normalized.perLessonWage.toString(),
        holidayHourlyWage:
          normalized.holidayHourlyWage === null
            ? null
            : normalized.holidayHourlyWage.toString(),
        nightMultiplier: normalized.nightMultiplier.toString(),
        overtimeMultiplier: normalized.overtimeMultiplier.toString(),
        nightStart: normalized.nightStart,
        nightEnd: normalized.nightEnd,
        dailyOvertimeThreshold: normalized.dailyOvertimeThreshold.toString(),
        holidayType: normalized.holidayType,
      },
    })

    return NextResponse.json({
      data: rule,
      warning:
        overlaps.length > 0
          ? {
              message: "同一勤務先内で適用期間が重複しています",
              overlappingRuleIds: overlaps.map((item) => item.id),
            }
          : null,
    })
  } catch (error) {
    console.error("PUT /api/workplaces/:workplaceId/payroll-rules/:id failed", error)
    return jsonError("給与ルールの更新に失敗しました", 500)
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { workplaceId, id } = await context.params
    const workplaceResult = await requireOwnedWorkplace(workplaceId, current.user.id)
    if ("response" in workplaceResult) {
      return workplaceResult.response
    }

    const existing = await findPayrollRule(id, workplaceId)
    if (!existing) {
      return jsonError("給与ルールが見つかりません", 404)
    }

    await prisma.payrollRule.delete({ where: { id } })

    return NextResponse.json({
      data: {
        id,
        deleted: true,
      },
    })
  } catch (error) {
    console.error("DELETE /api/workplaces/:workplaceId/payroll-rules/:id failed", error)
    return jsonError("給与ルールの削除に失敗しました", 500)
  }
}

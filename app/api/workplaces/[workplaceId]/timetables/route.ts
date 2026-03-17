import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/lib/api/current-user"
import { parseTimeOnly, toMinutes, TIME_ONLY_REGEX } from "@/lib/api/date-time"
import { jsonError, parseJsonBody } from "@/lib/api/http"
import { requireOwnedWorkplace } from "@/lib/api/workplace"
import { prisma } from "@/lib/prisma"

const timetableSchema = z
  .object({
    type: z.enum(["NORMAL", "INTENSIVE"]),
    period: z.coerce.number().int().positive(),
    startTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    endTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  })
  .strict()

type Context = {
  params: Promise<{ workplaceId: string }>
}

function validateTimeRange(startTime: string, endTime: string): boolean {
  return toMinutes(startTime) < toMinutes(endTime)
}

async function hasDuplicateTimetable(
  workplaceId: string,
  type: "NORMAL" | "INTENSIVE",
  period: number,
  excludeId?: string,
) {
  const existing = await prisma.timetable.findFirst({
    where: {
      workplaceId,
      type,
      period,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })

  return Boolean(existing)
}

export async function POST(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { workplaceId } = await context.params
    const workplaceResult = await requireOwnedWorkplace(workplaceId, current.user.id)
    if ("response" in workplaceResult) {
      return workplaceResult.response
    }

    if (workplaceResult.workplace.type !== "CRAM_SCHOOL") {
      return jsonError("時間割はCRAM_SCHOOL勤務先でのみ操作できます", 400)
    }

    const body = await parseJsonBody(request, timetableSchema)
    if (!body.success) {
      return body.response
    }

    if (!validateTimeRange(body.data.startTime, body.data.endTime)) {
      return jsonError("startTime は endTime より前にしてください", 400)
    }

    const duplicated = await hasDuplicateTimetable(
      workplaceId,
      body.data.type,
      body.data.period,
    )
    if (duplicated) {
      return jsonError("同じ type と period の時間割が既に存在します", 409)
    }

    const timetable = await prisma.timetable.create({
      data: {
        workplaceId,
        type: body.data.type,
        period: body.data.period,
        startTime: parseTimeOnly(body.data.startTime),
        endTime: parseTimeOnly(body.data.endTime),
      },
    })

    return NextResponse.json({ data: timetable }, { status: 201 })
  } catch (error) {
    console.error("POST /api/workplaces/:workplaceId/timetables failed", error)
    return jsonError("時間割の作成に失敗しました", 500)
  }
}

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { workplaceId } = await context.params
    const workplaceResult = await requireOwnedWorkplace(workplaceId, current.user.id)
    if ("response" in workplaceResult) {
      return workplaceResult.response
    }

    if (workplaceResult.workplace.type !== "CRAM_SCHOOL") {
      return jsonError("時間割はCRAM_SCHOOL勤務先でのみ操作できます", 400)
    }

    const timetables = await prisma.timetable.findMany({
      where: { workplaceId },
      orderBy: [{ type: "asc" }, { period: "asc" }],
    })

    return NextResponse.json({ data: timetables })
  } catch (error) {
    console.error("GET /api/workplaces/:workplaceId/timetables failed", error)
    return jsonError("時間割一覧の取得に失敗しました", 500)
  }
}

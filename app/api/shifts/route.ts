import { type Prisma } from "@/lib/generated/prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/lib/api/current-user"
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time"
import { jsonError, parseJsonBody } from "@/lib/api/http"
import { requireOwnedWorkplace } from "@/lib/api/workplace"
import { prisma } from "@/lib/prisma"
import { buildShiftData, ShiftValidationError, shiftInputSchema } from "./_shared"

const shiftListQuerySchema = z
  .object({
    workplaceId: z.string().min(1).optional(),
    startDate: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください").optional(),
    endDate: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください").optional(),
  })
  .refine(
    (value) => {
      if (!value.startDate || !value.endDate) {
        return true
      }

      return parseDateOnly(value.startDate) <= parseDateOnly(value.endDate)
    },
    {
      message: "startDate は endDate 以下で指定してください",
    },
  )

export async function POST(request: Request) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const body = await parseJsonBody(request, shiftInputSchema)
    if (!body.success) {
      return body.response
    }

    const workplaceResult = await requireOwnedWorkplace(
      body.data.workplaceId,
      current.user.id,
    )
    if ("response" in workplaceResult) {
      return workplaceResult.response
    }

    let built: Awaited<ReturnType<typeof buildShiftData>>
    try {
      built = await buildShiftData(body.data, workplaceResult.workplace.type)
    } catch (error) {
      if (error instanceof ShiftValidationError) {
        return jsonError(error.message, 400)
      }
      throw error
    }

    const created = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({ data: built.shiftData })

      if (built.lessonRange) {
        await tx.shiftLessonRange.create({
          data: {
            shiftId: shift.id,
            startPeriod: built.lessonRange.startPeriod,
            endPeriod: built.lessonRange.endPeriod,
          },
        })
      }

      return tx.shift.findUnique({
        where: { id: shift.id },
        include: {
          lessonRange: true,
          workplace: true,
        },
      })
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    console.error("POST /api/shifts failed", error)
    return jsonError("シフトの作成に失敗しました", 500)
  }
}

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const url = new URL(request.url)
    const query = shiftListQuerySchema.safeParse({
      workplaceId: url.searchParams.get("workplaceId") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    })

    if (!query.success) {
      return jsonError("クエリパラメータが不正です", 400, query.error.flatten())
    }

    if (query.data.workplaceId) {
      const workplaceResult = await requireOwnedWorkplace(
        query.data.workplaceId,
        current.user.id,
      )

      if ("response" in workplaceResult) {
        return workplaceResult.response
      }
    }

    const where: Prisma.ShiftWhereInput = {
      workplace: { userId: current.user.id },
    }

    if (query.data.workplaceId) {
      where.workplaceId = query.data.workplaceId
    }

    if (query.data.startDate || query.data.endDate) {
      where.date = {
        ...(query.data.startDate ? { gte: parseDateOnly(query.data.startDate) } : {}),
        ...(query.data.endDate ? { lte: parseDateOnly(query.data.endDate) } : {}),
      }
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        lessonRange: true,
        workplace: true,
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    })

    return NextResponse.json({ data: shifts })
  } catch (error) {
    console.error("GET /api/shifts failed", error)
    return jsonError("シフト一覧の取得に失敗しました", 500)
  }
}

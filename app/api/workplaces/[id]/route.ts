import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/lib/api/current-user"
import { jsonError, parseJsonBody } from "@/lib/api/http"
import { prisma } from "@/lib/prisma"

const colorRegex = /^#[0-9A-Fa-f]{6}$/

type Context = {
  params: Promise<{ id: string }>
}

const updateWorkplaceSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]).optional(),
    color: z
      .string()
      .regex(colorRegex, "HEX形式(#RRGGBB)で入力してください")
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "更新対象がありません",
  })

async function findOwnedWorkplace(id: string, userId: string) {
  return prisma.workplace.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      _count: {
        select: {
          shifts: true,
          payrollRules: true,
          timetables: true,
        },
      },
    },
  })
}

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { id } = await context.params
    const workplace = await findOwnedWorkplace(id, current.user.id)

    if (!workplace) {
      return jsonError("勤務先が見つかりません", 404)
    }

    return NextResponse.json({ data: workplace })
  } catch (error) {
    console.error("GET /api/workplaces/:id failed", error)
    return jsonError("勤務先の取得に失敗しました", 500)
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { id } = await context.params
    const existing = await findOwnedWorkplace(id, current.user.id)
    if (!existing) {
      return jsonError("勤務先が見つかりません", 404)
    }

    const body = await parseJsonBody(request, updateWorkplaceSchema)
    if (!body.success) {
      return body.response
    }

    const workplace = await prisma.workplace.update({
      where: { id },
      data: body.data,
    })

    return NextResponse.json({ data: workplace })
  } catch (error) {
    console.error("PUT /api/workplaces/:id failed", error)
    return jsonError("勤務先の更新に失敗しました", 500)
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const { id } = await context.params
    const existing = await findOwnedWorkplace(id, current.user.id)
    if (!existing) {
      return jsonError("勤務先が見つかりません", 404)
    }

    const relatedCounts = {
      shifts: existing._count.shifts,
      payrollRules: existing._count.payrollRules,
      timetables: existing._count.timetables,
    }

    await prisma.workplace.delete({ where: { id } })

    return NextResponse.json({
      data: {
        id,
        deleted: true,
        relatedCounts,
      },
      warning:
        relatedCounts.shifts + relatedCounts.payrollRules + relatedCounts.timetables > 0
          ? "関連データをCASCADE削除しました"
          : null,
    })
  } catch (error) {
    console.error("DELETE /api/workplaces/:id failed", error)
    return jsonError("勤務先の削除に失敗しました", 500)
  }
}

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireCurrentUser } from "@/lib/api/current-user"
import { jsonError, parseJsonBody } from "@/lib/api/http"
import { prisma } from "@/lib/prisma"

const colorRegex = /^#[0-9A-Fa-f]{6}$/

const createWorkplaceSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    color: z.string().regex(colorRegex, "HEX形式(#RRGGBB)で入力してください"),
  })
  .strict()

export async function POST(request: Request) {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const body = await parseJsonBody(request, createWorkplaceSchema)
    if (!body.success) {
      return body.response
    }

    const workplace = await prisma.workplace.create({
      data: {
        userId: current.user.id,
        name: body.data.name,
        type: body.data.type,
        color: body.data.color,
      },
    })

    return NextResponse.json({ data: workplace }, { status: 201 })
  } catch (error) {
    console.error("POST /api/workplaces failed", error)
    return jsonError("勤務先の作成に失敗しました", 500)
  }
}

export async function GET() {
  try {
    const current = await requireCurrentUser()
    if ("response" in current) {
      return current.response
    }

    const workplaces = await prisma.workplace.findMany({
      where: { userId: current.user.id },
      include: {
        _count: {
          select: {
            shifts: true,
            payrollRules: true,
            timetables: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ data: workplaces })
  } catch (error) {
    console.error("GET /api/workplaces failed", error)
    return jsonError("勤務先一覧の取得に失敗しました", 500)
  }
}

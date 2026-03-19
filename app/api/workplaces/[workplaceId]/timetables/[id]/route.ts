import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseTimeOnly, toMinutes, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import {
  jsonError,
  parseJsonBody,
  verifyMutationRequest,
} from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";

const timetableSchema = z
  .object({
    type: z.enum(["NORMAL", "INTENSIVE"]),
    period: z.coerce.number().int().positive(),
    startTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    endTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  })
  .strict();

type Context = {
  params: Promise<{ workplaceId: string; id: string }>;
};

function validateTimeRange(startTime: string, endTime: string): boolean {
  return toMinutes(startTime) < toMinutes(endTime);
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
  });

  return Boolean(existing);
}

async function findTimetable(id: string, workplaceId: string) {
  return prisma.timetable.findFirst({
    where: {
      id,
      workplaceId,
    },
  });
}

export async function PUT(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId, id } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    if (workplaceResult.workplace.type !== "CRAM_SCHOOL") {
      return jsonError("時間割はCRAM_SCHOOL勤務先でのみ操作できます", 400);
    }

    const existing = await findTimetable(id, workplaceId);
    if (!existing) {
      return jsonError("時間割が見つかりません", 404);
    }

    const body = await parseJsonBody(request, timetableSchema);
    if (!body.success) {
      return body.response;
    }

    if (!validateTimeRange(body.data.startTime, body.data.endTime)) {
      return jsonError("startTime は endTime より前にしてください", 400);
    }

    const duplicated = await hasDuplicateTimetable(
      workplaceId,
      body.data.type,
      body.data.period,
      id,
    );
    if (duplicated) {
      return jsonError("同じ type と period の時間割が既に存在します", 409);
    }

    const timetable = await prisma.timetable.update({
      where: { id },
      data: {
        type: body.data.type,
        period: body.data.period,
        startTime: parseTimeOnly(body.data.startTime),
        endTime: parseTimeOnly(body.data.endTime),
      },
    });

    return NextResponse.json({ data: timetable });
  } catch (error) {
    console.error(
      "PUT /api/workplaces/:workplaceId/timetables/:id failed",
      error,
    );
    return jsonError("時間割の更新に失敗しました", 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const csrfError = verifyMutationRequest(request);
    if (csrfError) {
      return csrfError;
    }

    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId, id } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    if (workplaceResult.workplace.type !== "CRAM_SCHOOL") {
      return jsonError("時間割はCRAM_SCHOOL勤務先でのみ操作できます", 400);
    }

    const existing = await findTimetable(id, workplaceId);
    if (!existing) {
      return jsonError("時間割が見つかりません", 404);
    }

    await prisma.timetable.delete({ where: { id } });

    return NextResponse.json({
      data: {
        id,
        deleted: true,
      },
    });
  } catch (error) {
    console.error(
      "DELETE /api/workplaces/:workplaceId/timetables/:id failed",
      error,
    );
    return jsonError("時間割の削除に失敗しました", 500);
  }
}

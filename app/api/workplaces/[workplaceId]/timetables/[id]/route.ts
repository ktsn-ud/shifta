import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
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

const timetableItemSchema = z
  .object({
    period: z.coerce.number().int().positive(),
    startTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    endTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  })
  .strict();

const timetableSetSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    sortOrder: z.coerce.number().int().min(0).optional(),
    items: z.array(timetableItemSchema).min(1),
  })
  .strict();

type Context = {
  params: Promise<{ workplaceId: string; id: string }>;
};

type TimetableSetWithItems = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  timetables: Array<{
    id: string;
    timetableSetId: string;
    period: number;
    startTime: Date;
    endTime: Date;
  }>;
};

function toTimeOnly(value: Date): string {
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function validateItems(items: Array<z.infer<typeof timetableItemSchema>>) {
  for (const item of items) {
    if (toMinutes(item.startTime) >= toMinutes(item.endTime)) {
      return "startTime は endTime より前にしてください";
    }
  }

  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.period)) {
      return "同じ時間割セット内で period が重複しています";
    }
    seen.add(item.period);
  }

  return null;
}

function buildSetResponse(set: TimetableSetWithItems) {
  return {
    id: set.id,
    workplaceId: set.workplaceId,
    name: set.name,
    sortOrder: set.sortOrder,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    items: set.timetables.map((timetable) => ({
      id: timetable.id,
      timetableSetId: timetable.timetableSetId,
      period: timetable.period,
      startTime: timetable.startTime.toISOString(),
      endTime: timetable.endTime.toISOString(),
      startTimeLabel: toTimeOnly(timetable.startTime),
      endTimeLabel: toTimeOnly(timetable.endTime),
    })),
  };
}

async function findSetMeta(id: string, workplaceId: string) {
  return prisma.timetableSet.findFirst({
    where: {
      id,
      workplaceId,
    },
    select: {
      id: true,
      sortOrder: true,
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

    const existing = await findSetMeta(id, workplaceId);
    if (!existing) {
      return jsonError("時間割セットが見つかりません", 404);
    }

    const body = await parseJsonBody(request, timetableSetSchema);
    if (!body.success) {
      return body.response;
    }

    const validationError = validateItems(body.data.items);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const duplicatedByName = await tx.timetableSet.findFirst({
        where: {
          workplaceId,
          name: body.data.name,
          id: {
            not: id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicatedByName) {
        throw new Error("DUPLICATED_TIMETABLE_SET_NAME");
      }

      await tx.timetableSet.update({
        where: { id },
        data: {
          name: body.data.name,
          sortOrder: body.data.sortOrder ?? existing.sortOrder,
        },
      });

      await tx.timetable.deleteMany({
        where: {
          timetableSetId: id,
        },
      });

      await tx.timetable.createMany({
        data: body.data.items.map((item) => ({
          id: randomUUID(),
          timetableSetId: id,
          period: item.period,
          startTime: parseTimeOnly(item.startTime),
          endTime: parseTimeOnly(item.endTime),
        })),
      });

      return tx.timetableSet.findUnique({
        where: {
          id,
        },
        include: {
          timetables: {
            orderBy: {
              period: "asc",
            },
          },
        },
      });
    });

    if (!updated) {
      return jsonError("時間割セットの更新に失敗しました", 500);
    }

    return NextResponse.json({ data: buildSetResponse(updated) });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "DUPLICATED_TIMETABLE_SET_NAME"
    ) {
      return jsonError("同じ名前の時間割セットが既に存在します", 409);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError("同じ名前の時間割セットが既に存在します", 409);
    }

    console.error(
      "PUT /api/workplaces/:workplaceId/timetables/:id failed",
      error,
    );
    return jsonError("時間割セットの更新に失敗しました", 500);
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

    const existing = await findSetMeta(id, workplaceId);
    if (!existing) {
      return jsonError("時間割セットが見つかりません", 404);
    }

    const inUse = await prisma.shiftLessonRange.findFirst({
      where: {
        timetableSetId: id,
      },
      select: {
        id: true,
      },
    });

    if (inUse) {
      return jsonError(
        "この時間割セットはシフトで使用中のため削除できません",
        409,
      );
    }

    await prisma.timetableSet.deleteMany({
      where: {
        id,
        workplaceId,
      },
    });

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
    return jsonError("時間割セットの削除に失敗しました", 500);
  }
}

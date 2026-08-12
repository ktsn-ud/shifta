import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseTimeOnly, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";
import { buildSuccessSyncResponse } from "@/lib/google-calendar/sync-response";
import {
  toTimeOnly,
  validateTimetableItems,
} from "@/lib/actions/workplace-core/timetable-utils";
import {
  MAX_TIMETABLE_PERIOD,
  MAX_TIMETABLE_ITEMS_PER_SET,
  TIMETABLE_PERIOD_LIMIT_MESSAGE,
  TIMETABLE_ITEMS_PER_SET_LIMIT_MESSAGE,
} from "@/lib/validation/batch-limits";

const timetableItemSchema = z.strictObject({
  period: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_TIMETABLE_PERIOD, TIMETABLE_PERIOD_LIMIT_MESSAGE),
  startTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  endTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
});

const timetableSetSchema = z.strictObject({
  name: z.string().trim().min(1).max(50),
  sortOrder: z.coerce.number().int().min(0).optional(),
  items: z
    .array(timetableItemSchema)
    .min(1)
    .max(MAX_TIMETABLE_ITEMS_PER_SET, TIMETABLE_ITEMS_PER_SET_LIMIT_MESSAGE),
});

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

export async function updateTimetableRouteAction(
  request: Request,
  context: Context,
) {
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

    const validationError = validateTimetableItems(body.data.items);
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

      await Promise.all([
        tx.timetableSet.update({
          where: { id },
          data: {
            name: body.data.name,
            sortOrder: body.data.sortOrder ?? existing.sortOrder,
          },
        }),
        tx.timetable.deleteMany({
          where: {
            timetableSetId: id,
          },
        }),
      ]);

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

    return jsonNoStore({
      data: buildSetResponse(updated),
      sync: buildSuccessSyncResponse(),
    });
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

export async function deleteTimetableRouteAction(_: Request, context: Context) {
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

    return jsonNoStore({
      data: {
        id,
        deleted: true,
      },
      sync: buildSuccessSyncResponse(),
    });
  } catch (error) {
    console.error(
      "DELETE /api/workplaces/:workplaceId/timetables/:id failed",
      error,
    );
    return jsonError("時間割セットの削除に失敗しました", 500);
  }
}

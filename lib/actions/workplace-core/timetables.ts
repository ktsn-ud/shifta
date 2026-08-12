import { connection } from "next/server";
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
import { getCachedTimetableSetsForWorkplace } from "@/lib/cache/workplace-read-cache";
import {
  toTimeOnly,
  validateTimetableItems,
} from "@/lib/actions/workplace-core/timetable-utils";
import {
  BULK_TIMETABLE_SET_COUNT_LIMIT_MESSAGE,
  MAX_BULK_TIMETABLE_SET_COUNT,
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

const timetableSetBulkSchema = z.strictObject({
  sets: z
    .array(timetableSetSchema)
    .min(1)
    .max(MAX_BULK_TIMETABLE_SET_COUNT, BULK_TIMETABLE_SET_COUNT_LIMIT_MESSAGE),
});

const timetableSetCreateSchema = z.union([
  timetableSetSchema,
  timetableSetBulkSchema,
]);

type Context = {
  params: Promise<{ workplaceId: string }>;
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

function buildSetResponse(sets: TimetableSetWithItems[]) {
  return sets.map((set) => ({
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
  }));
}

function normalizeCreateInputs(
  input: z.infer<typeof timetableSetCreateSchema>,
): Array<z.infer<typeof timetableSetSchema>> {
  if ("sets" in input) {
    return input.sets;
  }

  return [input];
}

export async function createTimetableRouteAction(
  request: Request,
  context: Context,
) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
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

    const body = await parseJsonBody(request, timetableSetCreateSchema);
    if (!body.success) {
      return body.response;
    }

    const inputs = normalizeCreateInputs(body.data);
    for (const input of inputs) {
      const validationError = validateTimetableItems(input.items);
      if (validationError) {
        return jsonError(validationError, 400);
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const normalizedInputs = inputs.map((input) => ({
        ...input,
        name: input.name.trim(),
      }));

      const requestedNameSet = new Set<string>();
      for (const input of normalizedInputs) {
        if (requestedNameSet.has(input.name)) {
          throw new Error("DUPLICATED_TIMETABLE_SET_NAME");
        }
        requestedNameSet.add(input.name);
      }

      const requestedNames = Array.from(requestedNameSet);
      if (requestedNames.length > 0) {
        const existing = await tx.timetableSet.findMany({
          where: {
            workplaceId,
            name: {
              in: requestedNames,
            },
          },
          select: {
            id: true,
          },
        });
        if (existing.length > 0) {
          throw new Error("DUPLICATED_TIMETABLE_SET_NAME");
        }
      }

      const maxSort = await tx.timetableSet.aggregate({
        where: {
          workplaceId,
        },
        _max: {
          sortOrder: true,
        },
      });

      let nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;
      const setRows = normalizedInputs.map((input) => {
        const sortOrder = input.sortOrder ?? nextSortOrder;
        if (input.sortOrder === undefined) {
          nextSortOrder += 1;
        }

        return {
          id: randomUUID(),
          workplaceId,
          name: input.name,
          sortOrder,
        };
      });

      await tx.timetableSet.createMany({
        data: setRows,
      });

      const timetableRows = setRows.flatMap((setRow, index) => {
        const input = normalizedInputs[index];
        return input.items.map((item) => ({
          id: randomUUID(),
          timetableSetId: setRow.id,
          period: item.period,
          startTime: parseTimeOnly(item.startTime),
          endTime: parseTimeOnly(item.endTime),
        }));
      });

      await tx.timetable.createMany({
        data: timetableRows,
      });

      const createdSets = await tx.timetableSet.findMany({
        where: {
          id: {
            in: setRows.map((set) => set.id),
          },
        },
        include: {
          timetables: {
            orderBy: {
              period: "asc",
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      return buildSetResponse(createdSets);
    });

    if (created.length === 0) {
      return jsonError("時間割セットの作成に失敗しました", 500);
    }

    if (created.length === 1 && !("sets" in body.data)) {
      return jsonNoStore(
        {
          data: created[0],
          sync: buildSuccessSyncResponse(),
        },
        { status: 201 },
      );
    }

    return jsonNoStore(
      {
        data: created,
        sync: buildSuccessSyncResponse(),
      },
      { status: 201 },
    );
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

    console.error("POST /api/workplaces/:workplaceId/timetables failed", error);
    return jsonError("時間割セットの作成に失敗しました", 500);
  }
}

export async function GET(_: Request, context: Context) {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
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

    const sets = await getCachedTimetableSetsForWorkplace(
      current.user.id,
      workplaceId,
    );

    return jsonNoStore({
      data: sets.map((set) => ({ ...set, items: set.timetables })),
    });
  } catch (error) {
    console.error("GET /api/workplaces/:workplaceId/timetables failed", error);
    return jsonError("時間割一覧の取得に失敗しました", 500);
  }
}

import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseTimeOnly, toMinutes, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";

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

const timetableSetBulkSchema = z
  .object({
    sets: z.array(timetableSetSchema).min(1),
  })
  .strict();

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

function toTimeOnly(value: Date): string {
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function validateTimeRange(startTime: string, endTime: string): boolean {
  return toMinutes(startTime) < toMinutes(endTime);
}

function validateItems(items: Array<z.infer<typeof timetableItemSchema>>) {
  for (const item of items) {
    if (!validateTimeRange(item.startTime, item.endTime)) {
      return "startTime は endTime より前にしてください";
    }
  }

  const duplicated = new Set<number>();
  const seen = new Set<number>();

  for (const item of items) {
    if (seen.has(item.period)) {
      duplicated.add(item.period);
    }
    seen.add(item.period);
  }

  if (duplicated.size > 0) {
    return "同じ時間割セット内で period が重複しています";
  }

  return null;
}

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

export async function POST(request: Request, context: Context) {
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
      const validationError = validateItems(input.items);
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
      return jsonNoStore({ data: created[0] }, { status: 201 });
    }

    return jsonNoStore({ data: created }, { status: 201 });
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

    const sets = await prisma.timetableSet.findMany({
      where: {
        workplaceId,
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

    return jsonNoStore({
      data: buildSetResponse(sets),
    });
  } catch (error) {
    console.error("GET /api/workplaces/:workplaceId/timetables failed", error);
    return jsonError("時間割一覧の取得に失敗しました", 500);
  }
}

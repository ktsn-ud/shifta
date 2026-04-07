import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseTimeOnly, toMinutes, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
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

type TimetableSetRow = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type TimetableRow = {
  id: string;
  timetableSetId: string;
  period: number;
  startTime: Date;
  endTime: Date;
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

function buildSetResponse(sets: TimetableSetRow[], timetables: TimetableRow[]) {
  const timetablesBySet = new Map<string, TimetableRow[]>();

  for (const timetable of timetables) {
    const rows = timetablesBySet.get(timetable.timetableSetId) ?? [];
    rows.push(timetable);
    timetablesBySet.set(timetable.timetableSetId, rows);
  }

  return sets.map((set) => ({
    id: set.id,
    workplaceId: set.workplaceId,
    name: set.name,
    sortOrder: set.sortOrder,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    items: (timetablesBySet.get(set.id) ?? [])
      .sort((left, right) => left.period - right.period)
      .map((timetable) => ({
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
      const existing = await tx.$queryRaw<Array<{ name: string }>>`
        SELECT "name"
        FROM "TimetableSet"
        WHERE "workplaceId" = ${workplaceId}
      `;

      const existingNameSet = new Set(existing.map((row) => row.name));
      const requestNameSet = new Set<string>();

      for (const input of inputs) {
        const normalizedName = input.name.trim();
        if (
          requestNameSet.has(normalizedName) ||
          existingNameSet.has(normalizedName)
        ) {
          throw new Error("DUPLICATED_TIMETABLE_SET_NAME");
        }
        requestNameSet.add(normalizedName);
      }

      const maxSort = await tx.$queryRaw<Array<{ value: number | null }>>`
        SELECT MAX("sortOrder")::int AS "value"
        FROM "TimetableSet"
        WHERE "workplaceId" = ${workplaceId}
      `;

      let nextSortOrder = (maxSort[0]?.value ?? -1) + 1;
      const createdIds: string[] = [];

      for (const input of inputs) {
        const setId = randomUUID();
        const sortOrder = input.sortOrder ?? nextSortOrder;
        if (input.sortOrder === undefined) {
          nextSortOrder += 1;
        }
        createdIds.push(setId);

        await tx.$executeRaw`
          INSERT INTO "TimetableSet"
            ("id", "workplaceId", "name", "sortOrder", "createdAt", "updatedAt")
          VALUES
            (${setId}, ${workplaceId}, ${input.name.trim()}, ${sortOrder}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        for (const item of input.items) {
          const timetableId = randomUUID();
          await tx.$executeRaw`
            INSERT INTO "Timetable"
              ("id", "timetableSetId", "period", "startTime", "endTime")
            VALUES
              (${timetableId}, ${setId}, ${item.period}, ${parseTimeOnly(item.startTime)}, ${parseTimeOnly(item.endTime)})
          `;
        }
      }

      const createdSets: ReturnType<typeof buildSetResponse>[number][] = [];
      for (const createdId of createdIds) {
        const sets = await tx.$queryRaw<Array<TimetableSetRow>>`
          SELECT "id", "workplaceId", "name", "sortOrder", "createdAt", "updatedAt"
          FROM "TimetableSet"
          WHERE "id" = ${createdId}
        `;

        const timetables = await tx.$queryRaw<Array<TimetableRow>>`
          SELECT "id", "timetableSetId", "period", "startTime", "endTime"
          FROM "Timetable"
          WHERE "timetableSetId" = ${createdId}
          ORDER BY "period" ASC
        `;

        const responseItem = buildSetResponse(sets, timetables)[0];
        if (responseItem) {
          createdSets.push(responseItem);
        }
      }

      return createdSets;
    });

    if (created.length === 0) {
      return jsonError("時間割セットの作成に失敗しました", 500);
    }

    if (created.length === 1 && !("sets" in body.data)) {
      return NextResponse.json({ data: created[0] }, { status: 201 });
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "DUPLICATED_TIMETABLE_SET_NAME"
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

    const sets = await prisma.$queryRaw<Array<TimetableSetRow>>`
      SELECT "id", "workplaceId", "name", "sortOrder", "createdAt", "updatedAt"
      FROM "TimetableSet"
      WHERE "workplaceId" = ${workplaceId}
      ORDER BY "sortOrder" ASC, "createdAt" ASC
    `;

    if (sets.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const timetables = await prisma.$queryRaw<Array<TimetableRow>>`
      SELECT "id", "timetableSetId", "period", "startTime", "endTime"
      FROM "Timetable"
      WHERE "timetableSetId" IN (
        SELECT "id" FROM "TimetableSet" WHERE "workplaceId" = ${workplaceId}
      )
      ORDER BY "timetableSetId" ASC, "period" ASC
    `;

    return NextResponse.json({ data: buildSetResponse(sets, timetables) });
  } catch (error) {
    console.error("GET /api/workplaces/:workplaceId/timetables failed", error);
    return jsonError("時間割一覧の取得に失敗しました", 500);
  }
}

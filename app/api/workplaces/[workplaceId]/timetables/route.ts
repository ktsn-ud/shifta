import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseTimeOnly, toMinutes, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";

const timetableItemSchema = z
  .object({
    type: z.enum(["NORMAL", "INTENSIVE"]),
    period: z.coerce.number().int().positive(),
    startTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    endTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  })
  .strict();

const timetableCreateSchema = z.union([
  timetableItemSchema,
  z
    .object({
      items: z.array(timetableItemSchema).min(1),
    })
    .strict(),
]);

type Context = {
  params: Promise<{ workplaceId: string }>;
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

function toCreateItems(
  data: z.infer<typeof timetableCreateSchema>,
): Array<z.infer<typeof timetableItemSchema>> {
  if ("items" in data) {
    return data.items;
  }

  return [data];
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

    const body = await parseJsonBody(request, timetableCreateSchema);
    if (!body.success) {
      return body.response;
    }

    const createItems = toCreateItems(body.data);

    for (const item of createItems) {
      if (!validateTimeRange(item.startTime, item.endTime)) {
        return jsonError("startTime は endTime より前にしてください", 400);
      }
    }

    const duplicateKeys = new Set<string>();
    const seenKeys = new Set<string>();
    for (const item of createItems) {
      const key = `${item.type}:${item.period}`;
      if (seenKeys.has(key)) {
        duplicateKeys.add(key);
      }
      seenKeys.add(key);
    }
    if (duplicateKeys.size > 0) {
      return jsonError("同じ type と period の時間割が既に存在します", 409);
    }

    if (createItems.length === 1) {
      const duplicated = await hasDuplicateTimetable(
        workplaceId,
        createItems[0]!.type,
        createItems[0]!.period,
      );
      if (duplicated) {
        return jsonError("同じ type と period の時間割が既に存在します", 409);
      }
    } else {
      const existed = await prisma.timetable.findMany({
        where: {
          workplaceId,
          OR: createItems.map((item) => ({
            type: item.type,
            period: item.period,
          })),
        },
        select: { id: true },
      });
      if (existed.length > 0) {
        return jsonError("同じ type と period の時間割が既に存在します", 409);
      }
    }

    const created = await prisma.$transaction(
      createItems.map((item) =>
        prisma.timetable.create({
          data: {
            workplaceId,
            type: item.type,
            period: item.period,
            startTime: parseTimeOnly(item.startTime),
            endTime: parseTimeOnly(item.endTime),
          },
        }),
      ),
    );

    if ("items" in body.data) {
      return NextResponse.json(
        {
          data: created,
          count: created.length,
        },
        { status: 201 },
      );
    }

    return NextResponse.json({ data: created[0] }, { status: 201 });
  } catch (error) {
    console.error("POST /api/workplaces/:workplaceId/timetables failed", error);
    return jsonError("時間割の作成に失敗しました", 500);
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

    const timetables = await prisma.timetable.findMany({
      where: { workplaceId },
      orderBy: [{ type: "asc" }, { period: "asc" }],
    });

    return NextResponse.json({ data: timetables });
  } catch (error) {
    console.error("GET /api/workplaces/:workplaceId/timetables failed", error);
    return jsonError("時間割一覧の取得に失敗しました", 500);
  }
}

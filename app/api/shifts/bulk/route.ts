import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { syncShiftsAfterBulkCreate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";
import {
  buildShiftData,
  type BuiltShiftData,
  lessonRangeSchema,
  type LessonTimeRangeResolver,
  resolveLessonTimeRangeFromRows,
  shiftCommentSchema,
  ShiftValidationError,
  type ShiftInput,
} from "../_shared";

export const maxDuration = 60;

const bulkShiftItemSchema = z
  .object({
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    shiftType: z.enum(["NORMAL", "LESSON"]),
    comment: shiftCommentSchema,
    startTime: z
      .string()
      .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください")
      .optional(),
    endTime: z
      .string()
      .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください")
      .optional(),
    breakMinutes: z.coerce.number().int().min(0).default(0),
    lessonRange: lessonRangeSchema.optional(),
  })
  .strict();

const bulkCreateSchema = z
  .object({
    workplaceId: z.string().min(1),
    shifts: z.array(bulkShiftItemSchema).min(1),
  })
  .strict();

type CreatedShift = {
  id: string;
};

type BulkShiftItem = z.infer<typeof bulkShiftItemSchema>;

function revalidateShiftRelatedPaths(): void {
  revalidatePath("/my");
  revalidatePath("/my/shifts/list");
  revalidatePath("/my/shifts/confirm");
  revalidatePath("/my/summary");
  revalidatePath("/my/payroll-details/monthly");
  revalidatePath("/my/payroll-details/workplace-yearly");
}

async function createBulkLessonTimeRangeResolver(
  workplaceId: string,
  shifts: BulkShiftItem[],
): Promise<LessonTimeRangeResolver | undefined> {
  const timetableSetIds = Array.from(
    new Set(
      shifts
        .filter(
          (
            shift,
          ): shift is BulkShiftItem & {
            lessonRange: { timetableSetId: string };
          } => shift.shiftType === "LESSON" && shift.lessonRange !== undefined,
        )
        .map((shift) => shift.lessonRange.timetableSetId),
    ),
  );

  if (timetableSetIds.length === 0) {
    return undefined;
  }

  const [ownedSets, timetableRows] = await Promise.all([
    prisma.timetableSet.findMany({
      where: {
        id: { in: timetableSetIds },
        workplaceId,
      },
      select: {
        id: true,
      },
    }),
    prisma.timetable.findMany({
      where: {
        timetableSetId: {
          in: timetableSetIds,
        },
      },
      select: {
        timetableSetId: true,
        period: true,
        startTime: true,
        endTime: true,
      },
      orderBy: [{ timetableSetId: "asc" }, { period: "asc" }],
    }),
  ]);

  const ownedSetIds = new Set(ownedSets.map((set) => set.id));
  const periodMapBySetId = new Map<
    string,
    Map<number, { period: number; startTime: Date; endTime: Date }>
  >();

  for (const row of timetableRows) {
    if (!ownedSetIds.has(row.timetableSetId)) {
      continue;
    }

    const periods = periodMapBySetId.get(row.timetableSetId) ?? new Map();
    periods.set(row.period, {
      period: row.period,
      startTime: row.startTime,
      endTime: row.endTime,
    });
    periodMapBySetId.set(row.timetableSetId, periods);
  }

  return async (resolverWorkplaceId, lessonRange) => {
    if (resolverWorkplaceId !== workplaceId) {
      throw new ShiftValidationError("選択した時間割セットが見つかりません");
    }

    if (!ownedSetIds.has(lessonRange.timetableSetId)) {
      throw new ShiftValidationError("選択した時間割セットが見つかりません");
    }

    const periodMap = periodMapBySetId.get(lessonRange.timetableSetId);
    if (!periodMap) {
      throw new ShiftValidationError("指定コマ範囲の時間割が不足しています");
    }

    const timetables: Array<{
      period: number;
      startTime: Date;
      endTime: Date;
    }> = [];
    for (
      let period = lessonRange.startPeriod;
      period <= lessonRange.endPeriod;
      period += 1
    ) {
      const row = periodMap.get(period);
      if (!row) {
        throw new ShiftValidationError("指定コマ範囲の時間割が不足しています");
      }
      timetables.push(row);
    }

    return resolveLessonTimeRangeFromRows(lessonRange, timetables);
  };
}

async function createShiftsInTransaction(
  builtItems: BuiltShiftData[],
): Promise<CreatedShift[]> {
  if (builtItems.length === 0) {
    return [];
  }

  const shiftRows = builtItems.map((built) => ({
    id: randomUUID(),
    ...built.shiftData,
  }));

  const lessonRangeRows = builtItems.flatMap((built, index) => {
    const shiftId = shiftRows[index]?.id;
    if (!built.lessonRange || !shiftId) {
      return [];
    }

    return [
      {
        shiftId,
        timetableSetId: built.lessonRange.timetableSetId,
        startPeriod: built.lessonRange.startPeriod,
        endPeriod: built.lessonRange.endPeriod,
      },
    ];
  });

  await prisma.$transaction(async (tx) => {
    await tx.shift.createMany({ data: shiftRows });

    if (lessonRangeRows.length > 0) {
      await tx.shiftLessonRange.createMany({
        data: lessonRangeRows.map((row) => ({
          id: randomUUID(),
          shiftId: row.shiftId,
          timetableSetId: row.timetableSetId,
          startPeriod: row.startPeriod,
          endPeriod: row.endPeriod,
        })),
      });
    }
  });

  return shiftRows.map((row) => ({ id: row.id }));
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const body = await parseJsonBody(request, bulkCreateSchema);
    if (!body.success) {
      return body.response;
    }

    const workplaceResult = await requireOwnedWorkplace(
      body.data.workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    const builtItems: BuiltShiftData[] = [];
    const lessonTimeRangeResolver = await createBulkLessonTimeRangeResolver(
      body.data.workplaceId,
      body.data.shifts,
    );

    for (let index = 0; index < body.data.shifts.length; index += 1) {
      const item = body.data.shifts[index];

      try {
        const built = await buildShiftData(
          {
            ...(item as Omit<ShiftInput, "workplaceId">),
            workplaceId: body.data.workplaceId,
          },
          workplaceResult.workplace.type,
          {
            lessonTimeRangeResolver,
          },
        );

        builtItems.push(built);
      } catch (error) {
        if (error instanceof ShiftValidationError) {
          return jsonError("シフトの入力値が不正です", 400, {
            index,
            date: item.date,
            detail: error.message,
          });
        }

        throw error;
      }
    }

    const createdShifts = await createShiftsInTransaction(builtItems);
    const createdShiftIds = createdShifts.map((shift) => shift.id);

    const latest =
      createdShiftIds.length > 0
        ? await prisma.shift.findMany({
            where: {
              id: {
                in: createdShiftIds,
              },
            },
            include: {
              lessonRange: true,
              workplace: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  type: true,
                },
              },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
          })
        : [];

    after(async () => {
      try {
        const syncResults = await syncShiftsAfterBulkCreate(
          createdShiftIds,
          current.user.id,
        );
        const syncedCount = syncResults.filter((result) => result.ok).length;
        const failedCount = syncResults.length - syncedCount;

        console.info("POST /api/shifts/bulk background sync completed", {
          userId: current.user.id,
          total: syncResults.length,
          synced: syncedCount,
          failed: failedCount,
        });
      } catch (error) {
        console.error("POST /api/shifts/bulk background sync failed", {
          userId: current.user.id,
          shiftCount: createdShiftIds.length,
          error,
        });
      }
    });

    revalidateShiftRelatedPaths();

    return NextResponse.json(
      {
        data: latest,
        summary: {
          total: createdShiftIds.length,
          synced: 0,
          failed: 0,
          pending: createdShiftIds.length,
        },
        sync: {
          ok: true,
          errorMessage: null,
          errorCode: null,
          requiresCalendarSetup: false,
          pending: createdShiftIds.length > 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/shifts/bulk failed", error);
    return jsonError("シフト一括登録に失敗しました", 500);
  }
}

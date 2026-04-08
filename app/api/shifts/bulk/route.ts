import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
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
  ShiftValidationError,
  type ShiftInput,
} from "../_shared";

export const maxDuration = 60;

const bulkShiftItemSchema = z
  .object({
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    shiftType: z.enum(["NORMAL", "LESSON"]),
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

    for (const row of lessonRangeRows) {
      await tx.$executeRaw`
        INSERT INTO "ShiftLessonRange"
          ("id", "shiftId", "timetableSetId", "startPeriod", "endPeriod")
        VALUES
          (${randomUUID()}, ${row.shiftId}, ${row.timetableSetId}, ${row.startPeriod}, ${row.endPeriod})
      `;
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

    for (let index = 0; index < body.data.shifts.length; index += 1) {
      const item = body.data.shifts[index];

      try {
        const built = await buildShiftData(
          {
            ...(item as Omit<ShiftInput, "workplaceId">),
            workplaceId: body.data.workplaceId,
          },
          workplaceResult.workplace.type,
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
              workplace: true,
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

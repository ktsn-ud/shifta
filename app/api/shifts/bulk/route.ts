import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { syncShiftsAfterBulkCreate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";
import {
  buildShiftData,
  lessonRangeSchema,
  ShiftValidationError,
  type ShiftInput,
} from "../_shared";

const commonShiftItemSchema = z
  .object({
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    shiftType: z.enum(["NORMAL", "LESSON", "OTHER"]),
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

const legacyLessonItemSchema = z
  .object({
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    shiftType: z.literal("LESSON"),
    breakMinutes: z.coerce.number().int().min(0).default(0),
    lessonType: z.enum(["NORMAL", "INTENSIVE"]),
    startPeriod: z.coerce.number().int().positive(),
    endPeriod: z.coerce.number().int().positive(),
  })
  .strict();

const bulkShiftItemSchema = z.union([
  commonShiftItemSchema,
  legacyLessonItemSchema,
]);

const bulkCreateSchema = z
  .object({
    workplaceId: z.string().min(1),
    shifts: z.array(bulkShiftItemSchema).min(1),
  })
  .strict();

type BulkShiftItem = z.infer<typeof bulkShiftItemSchema>;

type NormalizedBulkShiftItem = Omit<
  ShiftInput,
  "workplaceId" | "googleEventId"
>;

type CreatedShift = {
  id: string;
};

function normalizeBulkShiftItem(item: BulkShiftItem): NormalizedBulkShiftItem {
  if ("lessonType" in item) {
    return {
      date: item.date,
      shiftType: "LESSON",
      breakMinutes: item.breakMinutes,
      lessonRange: {
        lessonType: item.lessonType,
        startPeriod: item.startPeriod,
        endPeriod: item.endPeriod,
      },
    };
  }

  return item;
}

async function createShiftsInTransaction(
  builtItems: Awaited<ReturnType<typeof buildShiftData>>[],
): Promise<CreatedShift[]> {
  return prisma.$transaction(async (tx) => {
    const created: CreatedShift[] = [];

    for (const built of builtItems) {
      const shift = await tx.shift.create({
        data: built.shiftData,
        select: {
          id: true,
        },
      });

      if (built.lessonRange) {
        await tx.shiftLessonRange.create({
          data: {
            shiftId: shift.id,
            startPeriod: built.lessonRange.startPeriod,
            endPeriod: built.lessonRange.endPeriod,
          },
        });
      }

      created.push({ id: shift.id });
    }

    return created;
  });
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

    const normalizedItems = body.data.shifts.map(normalizeBulkShiftItem);

    const builtItems: Awaited<ReturnType<typeof buildShiftData>>[] = [];

    for (let index = 0; index < normalizedItems.length; index += 1) {
      const item = normalizedItems[index];

      try {
        const built = await buildShiftData(
          {
            ...item,
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

    const syncResults = await syncShiftsAfterBulkCreate(
      createdShiftIds,
      current.user.id,
    );

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

    const syncedCount = syncResults.filter((result) => result.ok).length;

    return NextResponse.json(
      {
        data: latest,
        summary: {
          total: createdShiftIds.length,
          synced: syncedCount,
          failed: createdShiftIds.length - syncedCount,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/shifts/bulk failed", error);
    return jsonError("シフト一括登録に失敗しました", 500);
  }
}

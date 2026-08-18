import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { consumeBulkShiftCreateRateLimit } from "@/lib/api/bulk-shift-rate-limit";
import {
  DATE_ONLY_REGEX,
  isValidDateOnly,
  TIME_ONLY_REGEX,
} from "@/lib/api/date-time";
import {
  jsonError,
  parseJsonBody,
  verifyMutationRequest,
} from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { syncShiftsAfterBulkCreate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";
import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
import { resolveAffectedPaymentMonthKeys } from "@/lib/payroll/affected-payment-month";
import { buildPendingSyncResponse } from "@/lib/google-calendar/sync-response";
import {
  BULK_SHIFT_LIMIT_MESSAGE,
  MAX_BULK_SHIFT_COUNT,
} from "@/lib/validation/batch-limits";
import {
  BREAK_MINUTES_INTEGER_MESSAGE,
  BREAK_MINUTES_RANGE_MESSAGE,
  MAX_BREAK_MINUTES,
} from "@/lib/shifts/break-validation";
import {
  buildShiftData,
  type BuiltShiftData,
  lessonRangeSchema,
  type LessonTimeRangeResolver,
  resolveLessonTimeRangeFromRows,
  shiftCommentSchema,
  transportationAllowanceSchema,
  ShiftValidationError,
  type ShiftInput,
} from "../_shared";

export { PATCH } from "../bulk-edit/route";

export const maxDuration = 60;

const bulkShiftItemSchema = z.strictObject({
  date: z
    .string()
    .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください")
    .refine(isValidDateOnly, "実在する日付を入力してください"),
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
  breakMinutes: z.coerce
    .number()
    .int(BREAK_MINUTES_INTEGER_MESSAGE)
    .min(0, BREAK_MINUTES_RANGE_MESSAGE)
    .max(MAX_BREAK_MINUTES, BREAK_MINUTES_RANGE_MESSAGE)
    .default(0),
  transportationAllowance: transportationAllowanceSchema,
  lessonRange: lessonRangeSchema.optional(),
});

const bulkCreateSchema = z.strictObject({
  workplaceId: z.string().min(1),
  shifts: z
    .array(bulkShiftItemSchema)
    .min(1)
    .max(MAX_BULK_SHIFT_COUNT, BULK_SHIFT_LIMIT_MESSAGE),
});

type CreatedShift = {
  id: string;
};

type BulkShiftItem = z.infer<typeof bulkShiftItemSchema>;

class BulkShiftBuildError extends Error {
  constructor(
    readonly index: number,
    readonly date: string,
    detail: string,
  ) {
    super(detail);
    this.name = "BulkShiftBuildError";
  }
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

async function buildBulkShiftItems(input: {
  workplaceId: string;
  workplaceType: "GENERAL" | "CRAM_SCHOOL";
  shifts: BulkShiftItem[];
  lessonTimeRangeResolver?: LessonTimeRangeResolver;
}): Promise<BuiltShiftData[]> {
  const { lessonTimeRangeResolver, shifts, workplaceId, workplaceType } = input;

  return Promise.all(
    shifts.map(async (item, index) => {
      try {
        return await buildShiftData(
          {
            ...(item as Omit<ShiftInput, "workplaceId">),
            workplaceId,
          },
          workplaceType,
          {
            lessonTimeRangeResolver,
          },
        );
      } catch (error) {
        if (error instanceof ShiftValidationError) {
          throw new BulkShiftBuildError(index, item.date, error.message);
        }

        throw error;
      }
    }),
  );
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const csrfError = verifyMutationRequest(request);
    if (csrfError) {
      return csrfError;
    }

    const rateLimit = consumeBulkShiftCreateRateLimit(current.user.id);
    if (!rateLimit.allowed) {
      return jsonError(
        "一括シフト登録の回数が多すぎます。しばらくしてからもう一度お試しください。",
        429,
        undefined,
        {
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
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

    const lessonTimeRangeResolver = await createBulkLessonTimeRangeResolver(
      body.data.workplaceId,
      body.data.shifts,
    );

    let builtItems: BuiltShiftData[];
    try {
      builtItems = await buildBulkShiftItems({
        workplaceId: body.data.workplaceId,
        workplaceType: workplaceResult.workplace.type,
        shifts: body.data.shifts,
        lessonTimeRangeResolver,
      });
    } catch (error) {
      if (error instanceof BulkShiftBuildError) {
        return jsonError("シフトの入力値が不正です", 400, {
          index: error.index,
          date: error.date,
          detail: error.message,
        });
      }

      throw error;
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

    const paymentMonthKeys = resolveAffectedPaymentMonthKeys(
      builtItems.map((built) => ({
        date: built.shiftData.date,
        payrollCycle: workplaceResult.workplace,
      })),
    );

    revalidateShiftDomainTags({
      userId: current.user.id,
      workplaceId: body.data.workplaceId,
      ...(paymentMonthKeys ? { paymentMonthKeys } : {}),
    });

    return jsonNoStore(
      {
        data: latest,
        summary: {
          total: createdShiftIds.length,
          synced: 0,
          failed: 0,
          pending: createdShiftIds.length,
        },
        sync: createdShiftIds.length > 0 ? buildPendingSyncResponse() : null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/shifts/bulk failed", error);
    return jsonError("シフト一括登録に失敗しました", 500);
  }
}

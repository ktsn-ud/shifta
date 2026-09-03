import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonNoStore } from "@/lib/api/cache-control";
import {
  jsonError,
  parseJsonBody,
  verifyMutationRequest,
} from "@/lib/api/http";
import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
import { syncShiftsAfterBulkUpdate } from "@/lib/google-calendar/syncStatus";
import { buildPendingSyncResponse } from "@/lib/google-calendar/sync-response";
import { resolveAffectedPaymentMonthKeys } from "@/lib/payroll/affected-payment-month";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getMonthShifts } from "@/lib/shifts/month-shifts";
import {
  buildShiftData,
  createBulkLessonTimeRangeResolver,
  lessonRangeSchema,
  shiftCommentSchema,
  ShiftValidationError,
  transportationAllowanceSchema,
} from "../_shared";
import {
  BREAK_MINUTES_INTEGER_MESSAGE,
  BREAK_MINUTES_RANGE_MESSAGE,
  MAX_BREAK_MINUTES,
} from "@/lib/shifts/break-validation";
import { TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { consumeBulkShiftEditRateLimit } from "@/lib/api/bulk-shift-rate-limit";
import {
  BULK_SHIFT_EDIT_LIMIT_MESSAGE,
  MAX_BULK_SHIFT_EDIT_COUNT,
} from "@/lib/validation/batch-limits";

const normalEditSchema = z.strictObject({
  id: z.string().min(1),
  shiftType: z.literal("NORMAL"),
  startTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  endTime: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
  breakMinutes: z.coerce
    .number()
    .int(BREAK_MINUTES_INTEGER_MESSAGE)
    .min(0, BREAK_MINUTES_RANGE_MESSAGE)
    .max(MAX_BREAK_MINUTES, BREAK_MINUTES_RANGE_MESSAGE),
  transportationAllowance: transportationAllowanceSchema,
  comment: shiftCommentSchema,
});

const lessonEditSchema = z.strictObject({
  id: z.string().min(1),
  shiftType: z.literal("LESSON"),
  lessonRange: lessonRangeSchema,
  transportationAllowance: transportationAllowanceSchema,
  comment: shiftCommentSchema,
});

const bulkEditSchema = z.strictObject({
  shifts: z
    .array(z.union([normalEditSchema, lessonEditSchema]))
    .min(1)
    .max(MAX_BULK_SHIFT_EDIT_COUNT, BULK_SHIFT_EDIT_LIMIT_MESSAGE),
});

type BulkEdit = z.infer<typeof bulkEditSchema>["shifts"][number];

function formatTimeValue(value: Date): string {
  return `${value.getUTCHours().toString().padStart(2, "0")}:${value
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}:${value.getUTCSeconds().toString().padStart(2, "0")}`;
}

export async function PATCH(request: Request) {
  const csrfError = verifyMutationRequest(request);
  if (csrfError) {
    return csrfError;
  }

  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const rateLimit = consumeBulkShiftEditRateLimit(current.user.id);
    if (!rateLimit.allowed) {
      return jsonError(
        "一括シフト更新の回数が多すぎます。しばらくしてからもう一度お試しください。",
        429,
        undefined,
        { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const body = await parseJsonBody(request, bulkEditSchema);
    if (!body.success) {
      return body.response;
    }

    const editsById = new Map<string, BulkEdit>();
    for (const edit of body.data.shifts) {
      if (editsById.has(edit.id)) {
        return jsonError("同じシフトを重複して更新できません", 400, {
          shiftId: edit.id,
        });
      }
      editsById.set(edit.id, edit);
    }

    const shiftIds = Array.from(editsById.keys());
    const existingRecords = await prisma.shift.findMany({
      where: { id: { in: shiftIds } },
      include: {
        workplace: {
          select: {
            id: true,
            userId: true,
            type: true,
            closingDayType: true,
            closingDay: true,
            payday: true,
          },
        },
      },
    });
    if (existingRecords.length !== shiftIds.length) {
      return jsonError("更新対象のシフトが見つかりません", 404);
    }
    if (
      existingRecords.some(
        (shift) => shift.workplace.userId !== current.user.id,
      )
    ) {
      return jsonError("このシフトを更新する権限がありません", 403);
    }
    const existingById = new Map(
      existingRecords.map((shift) => [shift.id, shift]),
    );
    const existing = [] as typeof existingRecords;
    for (const shiftId of shiftIds) {
      const shift = existingById.get(shiftId);
      if (!shift) {
        return jsonError("更新対象のシフトが見つかりません", 404);
      }
      existing.push(shift);
    }

    for (const shift of existing) {
      const edit = editsById.get(shift.id);
      if (!edit || edit.shiftType !== shift.shiftType) {
        return jsonError("シフト種別は変更できません", 400, {
          shiftId: shift.id,
        });
      }
    }

    const lessonTimeRangeResolver = await createBulkLessonTimeRangeResolver(
      existing.flatMap((shift) => {
        const edit = editsById.get(shift.id);
        return edit?.shiftType === "LESSON"
          ? [
              {
                workplaceId: shift.workplaceId,
                lessonRange: edit.lessonRange,
              },
            ]
          : [];
      }),
    );

    const buildResults = await Promise.allSettled(
      existing.map(async (shift) => {
        const edit = editsById.get(shift.id);
        if (!edit) {
          throw new Error("更新内容が見つかりません");
        }
        return buildShiftData(
          edit.shiftType === "NORMAL"
            ? {
                workplaceId: shift.workplaceId,
                date: shift.date.toISOString().slice(0, 10),
                shiftType: "NORMAL",
                startTime: edit.startTime,
                endTime: edit.endTime,
                breakMinutes: edit.breakMinutes,
                transportationAllowance: edit.transportationAllowance,
                comment: edit.comment,
              }
            : {
                workplaceId: shift.workplaceId,
                date: shift.date.toISOString().slice(0, 10),
                shiftType: "LESSON",
                lessonRange: edit.lessonRange,
                breakMinutes: 0,
                transportationAllowance: edit.transportationAllowance,
                comment: edit.comment,
              },
          shift.workplace.type,
          { lessonTimeRangeResolver },
        );
      }),
    );
    const builtById = new Map<
      string,
      Awaited<ReturnType<typeof buildShiftData>>
    >();
    for (const [index, result] of buildResults.entries()) {
      if (result.status === "rejected") {
        if (result.reason instanceof ShiftValidationError) {
          return jsonError(result.reason.message, 400, {
            shiftId: existing[index].id,
          });
        }
        throw result.reason;
      }
      builtById.set(existing[index].id, result.value);
    }

    const updateRows = existing.map((shift) => {
      const built = builtById.get(shift.id);
      if (!built) {
        throw new Error("更新内容が見つかりません");
      }
      return {
        id: shift.id,
        workplaceId: shift.workplaceId,
        startTime: formatTimeValue(built.shiftData.startTime),
        endTime: formatTimeValue(built.shiftData.endTime),
        breakMinutes: built.shiftData.breakMinutes,
        transportationAllowance: built.shiftData.transportationAllowance,
        shiftType: built.shiftData.shiftType,
        comment: built.shiftData.comment,
        lessonRange: built.lessonRange,
      };
    });
    const lessonRangeRows = updateRows.flatMap((row) =>
      row.lessonRange
        ? [
            {
              id: randomUUID(),
              shiftId: row.id,
              ...row.lessonRange,
            },
          ]
        : [],
    );

    const updatedShifts = await prisma.$transaction(async (tx) => {
      const updatedShiftRows = await tx.$queryRaw<
        Array<{ id: string; date: Date }>
      >`
        UPDATE "Shift" AS target
        SET
          "startTime" = updates."startTime",
          "endTime" = updates."endTime",
          "breakMinutes" = updates."breakMinutes",
          "transportationAllowance" = updates."transportationAllowance",
          "shiftType" = updates."shiftType",
          "comment" = updates."comment"
        FROM (
          VALUES ${Prisma.join(
            updateRows.map(
              (row) => Prisma.sql`(
                CAST(${row.id} AS text),
                CAST(${row.workplaceId} AS text),
                CAST(${row.startTime} AS time),
                CAST(${row.endTime} AS time),
                CAST(${row.breakMinutes} AS integer),
                CAST(${row.transportationAllowance} AS integer),
                CAST(${row.shiftType} AS "ShiftType"),
                CAST(${row.comment} AS varchar(100))
              )`,
            ),
          )}
        ) AS updates(
          "id",
          "workplaceId",
          "startTime",
          "endTime",
          "breakMinutes",
          "transportationAllowance",
          "shiftType",
          "comment"
        )
        WHERE target."id" = updates."id"
          AND target."workplaceId" = updates."workplaceId"
        RETURNING target."id", target."date"
      `;

      if (updatedShiftRows.length !== updateRows.length) {
        throw new Error("更新対象のシフト件数が一致しません");
      }

      if (lessonRangeRows.length > 0) {
        const upsertedLessonRangeCount = await tx.$executeRaw`
          INSERT INTO "ShiftLessonRange" (
            "id",
            "shiftId",
            "timetableSetId",
            "startPeriod",
            "endPeriod"
          )
          VALUES ${Prisma.join(
            lessonRangeRows.map(
              (row) => Prisma.sql`(
                CAST(${row.id} AS text),
                CAST(${row.shiftId} AS text),
                CAST(${row.timetableSetId} AS text),
                CAST(${row.startPeriod} AS integer),
                CAST(${row.endPeriod} AS integer)
              )`,
            ),
          )}
          ON CONFLICT ("shiftId") DO UPDATE
          SET
            "timetableSetId" = EXCLUDED."timetableSetId",
            "startPeriod" = EXCLUDED."startPeriod",
            "endPeriod" = EXCLUDED."endPeriod"
        `;

        if (upsertedLessonRangeCount !== lessonRangeRows.length) {
          throw new Error("授業コマ範囲の更新件数が一致しません");
        }
      }

      return updatedShiftRows;
    });

    const updatedDateById = new Map(
      updatedShifts.map((shift) => [shift.id, shift.date]),
    );
    const updated = existing.map((shift) => {
      const date = updatedDateById.get(shift.id);
      if (!date) {
        throw new Error("更新後のシフト日付が見つかりません");
      }
      return { date, workplace: shift.workplace };
    });

    const paymentMonthKeys = resolveAffectedPaymentMonthKeys(
      updated.map((shift) => ({
        date: shift.date,
        payrollCycle: shift.workplace,
      })),
    );
    revalidateShiftDomainTags({
      userId: current.user.id,
      workplaceIds: existing.map((shift) => shift.workplaceId),
      ...(paymentMonthKeys ? { paymentMonthKeys } : {}),
    });

    const dates = updated.map((shift) => shift.date.toISOString().slice(0, 10));
    const data =
      dates.length > 0
        ? (
            await getMonthShifts({
              userId: current.user.id,
              startDate: dates.reduce((left, right) =>
                left < right ? left : right,
              ),
              endDate: dates.reduce((left, right) =>
                left > right ? left : right,
              ),
              includeEstimate: true,
            })
          ).filter((shift) => editsById.has(shift.id))
        : [];

    after(async () => {
      try {
        await syncShiftsAfterBulkUpdate(shiftIds, current.user.id);
      } catch (error) {
        console.error("PATCH /api/shifts/bulk-edit background sync failed", {
          userId: current.user.id,
          shiftIds,
          error,
        });
      }
    });

    return jsonNoStore({
      data,
      summary: { total: data.length, failed: 0 },
      sync: buildPendingSyncResponse(),
      syncStatus: "pending",
    });
  } catch (error) {
    console.error("PATCH /api/shifts/bulk-edit failed", error);
    return jsonError("シフトの一括更新に失敗しました", 500);
  }
}

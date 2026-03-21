import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { TIME_ONLY_REGEX, toMinutes } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { syncShiftAfterUpdate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";

type Context = {
  params: Promise<{ id: string }>;
};

const DATE_PART_PADDING = 2;

const confirmShiftInputSchema = z
  .object({
    startTime: z
      .string()
      .regex(TIME_ONLY_REGEX, "開始時刻はHH:MM形式で入力してください")
      .optional(),
    endTime: z
      .string()
      .regex(TIME_ONLY_REGEX, "終了時刻はHH:MM形式で入力してください")
      .optional(),
    breakMinutes: z.coerce.number().int().min(0).optional(),
  })
  .strict();

function pad(value: number): string {
  return String(value).padStart(DATE_PART_PADDING, "0");
}

function toTimeOnlyString(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function toDateOnlyString(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function parseTimeOnly(value: string): Date {
  const [hour, minute] = value.split(":");

  return new Date(Date.UTC(1970, 0, 1, Number(hour), Number(minute), 0));
}

export async function PATCH(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { id } = await context.params;
    const existing = await prisma.shift.findFirst({
      where: {
        id,
        workplace: {
          userId: current.user.id,
        },
      },
    });
    if (!existing) {
      return jsonError("シフトが見つかりません", 404);
    }

    const body = await parseJsonBody(request, confirmShiftInputSchema);
    if (!body.success) {
      return body.response;
    }

    const nextStartTime =
      body.data.startTime ?? toTimeOnlyString(existing.startTime);
    const nextEndTime = body.data.endTime ?? toTimeOnlyString(existing.endTime);
    const nextBreakMinutes = body.data.breakMinutes ?? existing.breakMinutes;

    if (toMinutes(nextStartTime) >= toMinutes(nextEndTime)) {
      return jsonError("開始時刻は終了時刻より前にしてください", 400);
    }

    if (nextBreakMinutes < 0) {
      return jsonError("休憩時間は0以上で入力してください", 400);
    }

    const updated = await prisma.shift.update({
      where: {
        id: existing.id,
      },
      data: {
        startTime: parseTimeOnly(nextStartTime),
        endTime: parseTimeOnly(nextEndTime),
        breakMinutes: nextBreakMinutes,
        isConfirmed: true,
      },
    });

    after(async () => {
      try {
        await syncShiftAfterUpdate(updated.id, current.user.id);
      } catch (error) {
        console.error("PATCH /api/shifts/:id/confirm background sync failed", {
          userId: current.user.id,
          shiftId: updated.id,
          error,
        });
      }
    });
    const responsePayload = {
      id: updated.id,
      isConfirmed: updated.isConfirmed,
      date: toDateOnlyString(updated.date),
      startTime: toTimeOnlyString(updated.startTime),
      endTime: toTimeOnlyString(updated.endTime),
      breakMinutes: updated.breakMinutes,
    };

    return NextResponse.json({
      ...responsePayload,
      syncStatus: "pending",
    });
  } catch (error) {
    console.error("PATCH /api/shifts/:id/confirm failed", error);
    return jsonError("シフト確定に失敗しました", 500);
  }
}

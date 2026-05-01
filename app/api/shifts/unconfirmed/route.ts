import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

const DATE_PART_PADDING = 2;

function pad(value: number): string {
  return String(value).padStart(DATE_PART_PADDING, "0");
}

function toDateOnlyString(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function toTimeOnlyString(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export async function GET() {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const today = startOfUtcDay(new Date());
    const shifts = await prisma.shift.findMany({
      where: {
        workplace: {
          userId: current.user.id,
        },
        date: {
          lte: today,
        },
        isConfirmed: false,
      },
      include: {
        workplace: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({
      shifts: shifts.map((shift) => ({
        id: shift.id,
        comment: shift.comment,
        date: toDateOnlyString(shift.date),
        startTime: toTimeOnlyString(shift.startTime),
        endTime: toTimeOnlyString(shift.endTime),
        breakMinutes: shift.breakMinutes,
        isConfirmed: shift.isConfirmed,
        workplace: shift.workplace,
      })),
    });
  } catch (error) {
    console.error("GET /api/shifts/unconfirmed failed", error);
    return jsonError("未確定シフトの取得に失敗しました", 500);
  }
}

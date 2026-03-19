import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
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

function getCurrentMonthRangeUtc(base: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)),
    end: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1)),
  };
}

export async function GET() {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { start, end } = getCurrentMonthRangeUtc(new Date());
    const shifts = await prisma.shift.findMany({
      where: {
        workplace: {
          userId: current.user.id,
        },
        date: {
          gte: start,
          lt: end,
        },
        isConfirmed: true,
      },
      include: {
        workplace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        {
          workplace: {
            name: "asc",
          },
        },
        { date: "asc" },
        { startTime: "asc" },
      ],
    });

    return NextResponse.json({
      shifts: shifts.map((shift) => {
        const workedMinutes = calculateWorkedMinutes({
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes,
          shiftType: shift.shiftType,
          lessonRange: null,
        });

        return {
          id: shift.id,
          date: toDateOnlyString(shift.date),
          startTime: toTimeOnlyString(shift.startTime),
          endTime: toTimeOnlyString(shift.endTime),
          breakMinutes: shift.breakMinutes,
          workDurationHours: workedMinutes / 60,
          isConfirmed: shift.isConfirmed,
          workplace: shift.workplace,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/shifts/confirmed-current-month failed", error);
    return jsonError("確定済みシフトの取得に失敗しました", 500);
  }
}

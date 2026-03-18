import type {
  Shift,
  ShiftLessonRange,
  User,
  Workplace,
} from "@/lib/generated/prisma/client";
import {
  estimateShiftPay,
  findApplicablePayrollRule,
  type PayrollRuleForEstimate,
} from "@/lib/payroll/estimate";
import { prisma } from "@/lib/prisma";
import { getCalendarClientByUserId } from "./client";
import { SHIFTA_CALENDAR_TIMEZONE } from "./constants";

type ShiftWithLessonRange = Shift & {
  lessonRange: ShiftLessonRange | null;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateOnly(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
    value.getUTCDate(),
  )}`;
}

function formatTimeOnly(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function toMinutes(time: Date): number {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

function addDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return formatDateOnly(next);
}

function buildEventDateTime(shift: Shift): { start: string; end: string } {
  const dateOnly = formatDateOnly(shift.date);
  const startTime = formatTimeOnly(shift.startTime);
  const endTime = formatTimeOnly(shift.endTime);
  const endDateOnly =
    toMinutes(shift.endTime) <= toMinutes(shift.startTime)
      ? addDay(dateOnly)
      : dateOnly;

  return {
    start: `${dateOnly}T${startTime}:00`,
    end: `${endDateOnly}T${endTime}:00`,
  };
}

function mapWorkplaceColorToGoogleColorId(color: string): string {
  const normalized = color.toUpperCase();

  const mapping: Record<string, string> = {
    "#A4BDFC": "1",
    "#7AE7BF": "2",
    "#DBADFF": "3",
    "#FF887C": "4",
    "#FBD75B": "5",
    "#FFB878": "6",
    "#46D6DB": "7",
    "#E1E1E1": "8",
    "#5484ED": "9",
    "#51B749": "10",
    "#DC2127": "11",
  };

  if (mapping[normalized]) {
    return mapping[normalized];
  }

  if (normalized === "#FF0000") {
    return "11";
  }
  if (normalized === "#4285F4") {
    return "9";
  }
  if (normalized === "#EA4335") {
    return "4";
  }

  return "1";
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

async function estimateShiftWageForEvent(
  shift: ShiftWithLessonRange,
): Promise<number | null> {
  const rules = await prisma.payrollRule.findMany({
    where: {
      workplaceId: shift.workplaceId,
    },
    orderBy: [{ startDate: "desc" }],
  });

  const selected = findApplicablePayrollRule(
    rules as PayrollRuleForEstimate[],
    shift.date,
  );

  return estimateShiftPay(
    {
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      shiftType: shift.shiftType,
      lessonRange: shift.lessonRange
        ? {
            startPeriod: shift.lessonRange.startPeriod,
            endPeriod: shift.lessonRange.endPeriod,
          }
        : null,
    },
    selected,
  );
}

async function buildEventDescription(
  shift: ShiftWithLessonRange,
  workplace: Workplace,
): Promise<string> {
  const estimatedWage = await estimateShiftWageForEvent(shift);

  return [
    `勤務先: ${workplace.name}`,
    `時間: ${formatTimeOnly(shift.startTime)} - ${formatTimeOnly(shift.endTime)} (休憩${shift.breakMinutes}分)`,
    `タイプ: ${shift.shiftType}`,
    `給与: ${formatCurrency(estimatedWage)}（予想）`,
  ].join("\n");
}

export async function createCalendarEvent(
  shift: ShiftWithLessonRange,
  workplace: Workplace,
  user: User,
): Promise<string> {
  if (!user.calendarId) {
    throw new Error("Calendar not initialized");
  }

  const calendar = await getCalendarClientByUserId(user.id);
  const eventDateTime = buildEventDateTime(shift);
  const description = await buildEventDescription(shift, workplace);

  const response = await calendar.events.insert({
    calendarId: user.calendarId,
    requestBody: {
      summary: workplace.name,
      start: {
        dateTime: eventDateTime.start,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: eventDateTime.end,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      colorId: mapWorkplaceColorToGoogleColorId(workplace.color),
      description,
      visibility: "private",
      transparency: "opaque",
      extendedProperties: {
        private: {
          shiftId: shift.id,
          workplaceId: workplace.id,
          shiftType: shift.shiftType,
          workplaceName: workplace.name,
        },
      },
    },
  });

  const googleEventId = response.data.id;
  if (!googleEventId) {
    throw new Error("Google event id が取得できませんでした");
  }

  return googleEventId;
}

export async function updateCalendarEvent(
  shift: ShiftWithLessonRange,
  workplace: Workplace,
  user: User,
): Promise<void> {
  if (!user.calendarId) {
    throw new Error("Calendar not initialized");
  }

  if (!shift.googleEventId) {
    throw new Error("Google event id is missing");
  }

  const calendar = await getCalendarClientByUserId(user.id);
  const eventDateTime = buildEventDateTime(shift);
  const description = await buildEventDescription(shift, workplace);

  await calendar.events.patch({
    calendarId: user.calendarId,
    eventId: shift.googleEventId,
    requestBody: {
      summary: workplace.name,
      start: {
        dateTime: eventDateTime.start,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: eventDateTime.end,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      colorId: mapWorkplaceColorToGoogleColorId(workplace.color),
      description,
      visibility: "private",
      transparency: "opaque",
      extendedProperties: {
        private: {
          shiftId: shift.id,
          workplaceId: workplace.id,
          shiftType: shift.shiftType,
          workplaceName: workplace.name,
        },
      },
    },
  });
}

export async function deleteCalendarEvent(
  googleEventId: string,
  user: User,
): Promise<void> {
  if (!user.calendarId) {
    throw new Error("Calendar not initialized");
  }

  const calendar = await getCalendarClientByUserId(user.id);

  await calendar.events.delete({
    calendarId: user.calendarId,
    eventId: googleEventId,
  });
}

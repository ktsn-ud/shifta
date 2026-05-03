import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
  User,
  Workplace,
} from "@/lib/generated/prisma/client";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { buildPayrollRuleWhereForDateRange } from "@/lib/payroll/rule-query";
import { prisma } from "@/lib/prisma";
import { formatShiftWorkplaceLabel } from "@/lib/shifts/format";
import { getCalendarClientByUserId } from "./client";
import { SHIFTA_CALENDAR_TIMEZONE } from "./constants";
import { GoogleCalendarSyncError, GOOGLE_SYNC_ERROR_CODES } from "./syncErrors";

type ShiftWithLessonRange = Shift & {
  lessonRange: ShiftLessonRange | null;
};

type CalendarClient = Awaited<ReturnType<typeof getCalendarClientByUserId>>;
const eventCurrencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

type CreateCalendarEventOptions = {
  calendar?: CalendarClient;
  skipCalendarExistenceCheck?: boolean;
  payrollRulesByWorkplaceId?: ReadonlyMap<string, PayrollRule[]>;
};

type GoogleApiErrorCandidate = Error & {
  code?: number | string;
  status?: number;
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
        errors?: Array<{
          reason?: string;
        }>;
      };
    };
  };
};

function extractGoogleErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as GoogleApiErrorCandidate;
  const status =
    candidate.status ?? candidate.response?.status ?? Number(candidate.code);

  return Number.isFinite(status) ? status : null;
}

function extractGoogleErrorReason(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as GoogleApiErrorCandidate;
  const reason = candidate.response?.data?.error?.errors?.[0]?.reason;
  return typeof reason === "string" && reason.length > 0 ? reason : null;
}

function extractGoogleErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as GoogleApiErrorCandidate;
  const apiMessage = candidate.response?.data?.error?.message;
  if (typeof apiMessage === "string" && apiMessage.length > 0) {
    return apiMessage;
  }

  if (error.message.length > 0) {
    return error.message;
  }

  return null;
}

function isCalendarNotFoundError(error: unknown): boolean {
  const status = extractGoogleErrorStatus(error);
  if (status === 404) {
    return true;
  }

  const reason = extractGoogleErrorReason(error)?.toLowerCase();
  if (reason === "notfound") {
    return true;
  }

  const message = extractGoogleErrorMessage(error)?.toLowerCase();
  return message?.includes("not found") === true;
}

async function assertCalendarExists(
  calendar: CalendarClient,
  calendarId: string,
): Promise<void> {
  try {
    await calendar.calendars.get({
      calendarId,
    });
  } catch (error) {
    if (isCalendarNotFoundError(error)) {
      throw new GoogleCalendarSyncError(
        GOOGLE_SYNC_ERROR_CODES.CALENDAR_NOT_FOUND,
        "同期先のGoogle Calendarが見つかりません。カレンダーを再設定してください",
      );
    }

    throw error;
  }
}

export async function getVerifiedCalendarClient(
  user: Pick<User, "id" | "calendarId">,
): Promise<CalendarClient> {
  if (!user.calendarId) {
    throw new Error("Calendar not initialized");
  }

  const calendar = await getCalendarClientByUserId(user.id);
  await assertCalendarExists(calendar, user.calendarId);
  return calendar;
}

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

function buildEventSummary(
  shift: ShiftWithLessonRange,
  workplace: Workplace,
): string {
  return formatShiftWorkplaceLabel({
    workplaceName: workplace.name,
    workplaceType: workplace.type,
    shiftType: shift.shiftType,
    comment: shift.comment,
  });
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return eventCurrencyFormatter.format(value);
}

async function estimateShiftWageForEvent(
  shift: ShiftWithLessonRange,
  payrollRulesByWorkplaceId?: ReadonlyMap<string, PayrollRule[]>,
): Promise<number | null> {
  const rulesByWorkplace =
    payrollRulesByWorkplaceId ??
    groupPayrollRulesByWorkplace(
      await prisma.payrollRule.findMany({
        where: buildPayrollRuleWhereForDateRange([shift.workplaceId], {
          startDate: shift.date,
          endDate: shift.date,
        }),
        orderBy: [{ startDate: "desc" }],
      }),
    );

  const selectedRule = findApplicablePayrollRule(
    rulesByWorkplace,
    shift.workplaceId,
    shift.date,
  );

  if (!selectedRule) {
    return null;
  }

  return calculateShiftPayrollResultByRule(shift, selectedRule).totalWage;
}

async function buildEventDescription(
  shift: ShiftWithLessonRange,
  workplace: Workplace,
  payrollRulesByWorkplaceId?: ReadonlyMap<string, PayrollRule[]>,
): Promise<string> {
  const estimatedWage = await estimateShiftWageForEvent(
    shift,
    payrollRulesByWorkplaceId,
  );

  return [
    `勤務先: ${workplace.name}`,
    `時間: ${formatTimeOnly(shift.startTime)} - ${formatTimeOnly(shift.endTime)} (休憩${shift.breakMinutes}分)`,
    `タイプ: ${shift.shiftType}`,
    `給与: ${formatCurrency(estimatedWage)}（予想）`,
  ].join("\n");
}

async function assertLinkedGoogleEvent(
  calendar: CalendarClient,
  calendarId: string,
  googleEventId: string,
  shiftId: string,
): Promise<void> {
  const response = await calendar.events.get({
    calendarId,
    eventId: googleEventId,
  });

  const linkedShiftId =
    response.data.extendedProperties?.private?.shiftId ?? null;

  if (linkedShiftId !== shiftId) {
    throw new Error("Googleイベントの所有検証に失敗しました");
  }
}

export async function createCalendarEvent(
  shift: ShiftWithLessonRange,
  workplace: Workplace,
  user: User,
  options?: CreateCalendarEventOptions,
): Promise<string> {
  if (!user.calendarId) {
    throw new Error("Calendar not initialized");
  }

  const calendar =
    options?.calendar ?? (await getCalendarClientByUserId(user.id));
  if (!options?.skipCalendarExistenceCheck) {
    await assertCalendarExists(calendar, user.calendarId);
  }

  const eventDateTime = buildEventDateTime(shift);
  const summary = buildEventSummary(shift, workplace);
  const description = await buildEventDescription(
    shift,
    workplace,
    options?.payrollRulesByWorkplaceId,
  );

  const response = await calendar.events.insert({
    calendarId: user.calendarId,
    requestBody: {
      summary,
      start: {
        dateTime: eventDateTime.start,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: eventDateTime.end,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      description,
      visibility: "private",
      transparency: "opaque",
      extendedProperties: {
        private: {
          shiftId: shift.id,
          workplaceId: workplace.id,
          shiftType: shift.shiftType,
          workplaceName: workplace.name,
          comment: shift.comment ?? "",
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
  await assertCalendarExists(calendar, user.calendarId);
  const eventDateTime = buildEventDateTime(shift);
  const summary = buildEventSummary(shift, workplace);
  const description = await buildEventDescription(shift, workplace);

  await assertLinkedGoogleEvent(
    calendar,
    user.calendarId,
    shift.googleEventId,
    shift.id,
  );

  await calendar.events.patch({
    calendarId: user.calendarId,
    eventId: shift.googleEventId,
    requestBody: {
      summary,
      start: {
        dateTime: eventDateTime.start,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      end: {
        dateTime: eventDateTime.end,
        timeZone: SHIFTA_CALENDAR_TIMEZONE,
      },
      description,
      visibility: "private",
      transparency: "opaque",
      extendedProperties: {
        private: {
          shiftId: shift.id,
          workplaceId: workplace.id,
          shiftType: shift.shiftType,
          workplaceName: workplace.name,
          comment: shift.comment ?? "",
        },
      },
    },
  });
}

export async function deleteCalendarEvent(
  googleEventId: string,
  shiftId: string,
  user: User,
): Promise<void> {
  if (!user.calendarId) {
    throw new Error("Calendar not initialized");
  }

  const calendar = await getCalendarClientByUserId(user.id);
  await assertCalendarExists(calendar, user.calendarId);
  await assertLinkedGoogleEvent(
    calendar,
    user.calendarId,
    googleEventId,
    shiftId,
  );

  await calendar.events.delete({
    calendarId: user.calendarId,
    eventId: googleEventId,
  });
}

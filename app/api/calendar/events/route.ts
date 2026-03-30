import { NextResponse } from "next/server";
import { calendar_v3 } from "googleapis";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { GoogleCalendarAuthError } from "@/lib/google-calendar/auth";
import { getReadCalendarClientByUserId } from "@/lib/google-calendar/client";
import { SHIFTA_CALENDAR_TIMEZONE } from "@/lib/google-calendar/constants";

const MONTH_REGEX = /^(\d{4})-(\d{2})$/;
const FETCH_CONCURRENCY = 3;
const PAGE_SIZE_CALENDAR_LIST = 250;
const PAGE_SIZE_EVENTS = 2500;
const MAX_ITEMS_PER_DAY = 20;

type CalendarDescriptor = {
  id: string;
  summary: string;
};

type MonthRange = {
  month: string;
  startDateKey: string;
  endDateKeyExclusive: string;
  timeMin: string;
  timeMax: string;
};

type AggregatedEventItem = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string;
};

type AggregatedDay = {
  date: string;
  count: number;
  items: AggregatedEventItem[];
};

type GoogleApiErrorCandidate = Error & {
  code?: number | string;
  status?: number;
  response?: {
    status?: number;
  };
};

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHIFTA_CALENDAR_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: SHIFTA_CALENDAR_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseMonth(value: string | null): MonthRange | null {
  if (!value) {
    return null;
  }

  const match = MONTH_REGEX.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const monthKey = `${year}-${pad(month)}`;
  const monthStartDateKey = `${monthKey}-01`;
  const nextMonthKey = `${nextYear}-${pad(nextMonth)}`;
  const monthEndDateKeyExclusive = `${nextMonthKey}-01`;

  return {
    month: monthKey,
    startDateKey: monthStartDateKey,
    endDateKeyExclusive: monthEndDateKeyExclusive,
    timeMin: `${monthStartDateKey}T00:00:00+09:00`,
    timeMax: `${monthEndDateKeyExclusive}T00:00:00+09:00`,
  };
}

function addDays(dateKey: string, days: number): string {
  const [yearString, monthString, dayString] = dateKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function toDateKey(value: Date): string {
  const parts = dateKeyFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function toTimeLabel(value: Date): string {
  return timeFormatter.format(value);
}

function isWithinMonth(dateKey: string, range: MonthRange): boolean {
  return dateKey >= range.startDateKey && dateKey < range.endDateKeyExclusive;
}

function extractGoogleErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as GoogleApiErrorCandidate;
  const status =
    candidate.status ?? candidate.response?.status ?? Number(candidate.code);

  return Number.isFinite(status) ? status : null;
}

function mapGoogleAuthErrorStatus(error: GoogleCalendarAuthError): number {
  if (error.code === "UNAUTHENTICATED") {
    return 401;
  }

  if (error.code === "SCOPE_MISSING" || error.code === "READ_SCOPE_MISSING") {
    return 403;
  }

  return 400;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  iteratee: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= values.length) {
        return;
      }

      results[currentIndex] = await iteratee(values[currentIndex]);
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker();
    }),
  );

  return results;
}

async function listCalendars(
  calendar: Awaited<ReturnType<typeof getReadCalendarClientByUserId>>,
): Promise<CalendarDescriptor[]> {
  const calendars: CalendarDescriptor[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.calendarList.list({
      minAccessRole: "reader",
      showDeleted: false,
      showHidden: false,
      maxResults: PAGE_SIZE_CALENDAR_LIST,
      pageToken,
    });

    for (const entry of response.data.items ?? []) {
      if (!entry.id) {
        continue;
      }

      calendars.push({
        id: entry.id,
        summary: entry.summary ?? "(タイトルなし)",
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return calendars;
}

async function listEventsByCalendar(
  calendar: Awaited<ReturnType<typeof getReadCalendarClientByUserId>>,
  calendarId: string,
  range: MonthRange,
): Promise<calendar_v3.Schema$Event[]> {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId,
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: false,
      maxResults: PAGE_SIZE_EVENTS,
      pageToken,
    });

    if (response.data.items) {
      events.push(...response.data.items);
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

function pushAggregatedEvent(
  dayMap: Map<string, AggregatedDay>,
  dateKey: string,
  item: AggregatedEventItem,
): void {
  const existing = dayMap.get(dateKey);
  if (!existing) {
    dayMap.set(dateKey, {
      date: dateKey,
      count: 1,
      items: [item],
    });
    return;
  }

  existing.count += 1;
  if (existing.items.length < MAX_ITEMS_PER_DAY) {
    existing.items.push(item);
  }
}

function aggregateEvent(
  dayMap: Map<string, AggregatedDay>,
  range: MonthRange,
  calendarInfo: CalendarDescriptor,
  event: {
    summary?: string | null;
    status?: string | null;
    start?: { date?: string | null; dateTime?: string | null } | null;
    end?: { date?: string | null; dateTime?: string | null } | null;
  },
): void {
  if (event.status === "cancelled") {
    return;
  }

  const title = event.summary?.trim() || "(タイトルなし)";
  const allDayStart = event.start?.date;
  const allDayEndExclusive = event.end?.date;

  if (allDayStart) {
    const endExclusive = allDayEndExclusive ?? addDays(allDayStart, 1);
    const item: AggregatedEventItem = {
      title,
      start: allDayStart,
      end: endExclusive,
      allDay: true,
      calendarId: calendarInfo.id,
      calendarSummary: calendarInfo.summary,
    };

    let cursor = allDayStart;
    while (cursor < endExclusive) {
      if (isWithinMonth(cursor, range)) {
        pushAggregatedEvent(dayMap, cursor, item);
      }
      cursor = addDays(cursor, 1);
    }

    return;
  }

  const startDateTime = event.start?.dateTime;
  if (!startDateTime) {
    return;
  }

  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) {
    return;
  }

  const endDateTime = event.end?.dateTime ?? startDateTime;
  const end = new Date(endDateTime);

  const dateKey = toDateKey(start);
  if (!dateKey || !isWithinMonth(dateKey, range)) {
    return;
  }

  const item: AggregatedEventItem = {
    title,
    start: toTimeLabel(start),
    end: Number.isNaN(end.getTime()) ? "" : toTimeLabel(end),
    allDay: false,
    calendarId: calendarInfo.id,
    calendarSummary: calendarInfo.summary,
  };

  pushAggregatedEvent(dayMap, dateKey, item);
}

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const month = new URL(request.url).searchParams.get("month");
    const range = parseMonth(month);
    if (!range) {
      return jsonError("month は YYYY-MM 形式で指定してください", 400);
    }

    const calendar = await getReadCalendarClientByUserId(current.user.id);
    const calendars = await listCalendars(calendar);

    const eventsByCalendar = await mapWithConcurrency(
      calendars,
      FETCH_CONCURRENCY,
      async (calendarInfo) => {
        const events = await listEventsByCalendar(
          calendar,
          calendarInfo.id,
          range,
        );
        return {
          calendarInfo,
          events,
        };
      },
    );

    const dayMap = new Map<string, AggregatedDay>();

    for (const { calendarInfo, events } of eventsByCalendar) {
      for (const event of events) {
        aggregateEvent(dayMap, range, calendarInfo, event);
      }
    }

    const dates = Array.from(dayMap.values()).sort((left, right) => {
      return left.date.localeCompare(right.date);
    });

    return NextResponse.json({
      data: {
        month: range.month,
        dates,
      },
    });
  } catch (error) {
    if (error instanceof GoogleCalendarAuthError) {
      const details =
        error.code === "READ_SCOPE_MISSING"
          ? {
              code: error.code,
              requiresReconsent: true,
            }
          : undefined;
      return jsonError(error.message, mapGoogleAuthErrorStatus(error), details);
    }

    const googleErrorStatus = extractGoogleErrorStatus(error);
    if (googleErrorStatus !== null) {
      console.error("GET /api/calendar/events google api failed", {
        status: googleErrorStatus,
        error,
      });
      return jsonError(
        "Google Calendar の予定取得に失敗しました。時間を置いて再度お試しください",
        502,
      );
    }

    console.error("GET /api/calendar/events failed", error);
    return jsonError("Google Calendar 予定の取得に失敗しました", 500);
  }
}

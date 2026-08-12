import { DATE_ONLY_REGEX } from "@/lib/api/date-time";

export type GoogleCalendarOption = {
  id: string;
  summary: string;
  color: string | null;
};

export type GoogleCalendarEventItem = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string;
  calendarColor: string | null;
};

export type GoogleCalendarDay = {
  date: string;
  count: number;
  items: GoogleCalendarEventItem[];
};

export type GoogleCalendarEventsResponse = {
  month: string;
  calendars: GoogleCalendarOption[];
  selectedCalendarIds: string[];
  dates: GoogleCalendarDay[];
  cacheWarning: string | null;
};

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGoogleCalendarOption(value: unknown): value is GoogleCalendarOption {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.summary === "string" &&
    (typeof value.color === "string" || value.color === null)
  );
}

function isGoogleCalendarEventItem(
  value: unknown,
): value is GoogleCalendarEventItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    typeof value.start === "string" &&
    typeof value.end === "string" &&
    typeof value.allDay === "boolean" &&
    typeof value.calendarId === "string" &&
    typeof value.calendarSummary === "string" &&
    (typeof value.calendarColor === "string" || value.calendarColor === null)
  );
}

function isGoogleCalendarDay(value: unknown): value is GoogleCalendarDay {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }

  return (
    typeof value.date === "string" &&
    DATE_ONLY_REGEX.test(value.date) &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0 &&
    value.items.every(isGoogleCalendarEventItem)
  );
}

export function parseGoogleCalendarEventsResponse(
  payload: unknown,
): GoogleCalendarEventsResponse | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (typeof data.month !== "string" || !MONTH_KEY_REGEX.test(data.month)) {
    return null;
  }

  if (
    !Array.isArray(data.calendars) ||
    !Array.isArray(data.selectedCalendarIds)
  ) {
    return null;
  }

  if (data.calendars.every(isGoogleCalendarOption) === false) {
    return null;
  }

  if (
    data.selectedCalendarIds.every((id) => typeof id === "string") === false
  ) {
    return null;
  }

  if (
    !Array.isArray(data.dates) ||
    data.dates.every(isGoogleCalendarDay) === false
  ) {
    return null;
  }

  let cacheWarning: string | null = null;
  if (isRecord(payload.meta) && payload.meta.cacheStatus === "stale") {
    cacheWarning =
      typeof payload.meta.warning === "string"
        ? payload.meta.warning
        : "Google予定は最新でない可能性があります。";
  }

  return {
    month: data.month,
    calendars: data.calendars,
    selectedCalendarIds: data.selectedCalendarIds,
    dates: data.dates,
    cacheWarning,
  };
}

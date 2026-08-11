import "server-only";
import { createHash } from "node:crypto";
import { calendar_v3 } from "googleapis";
import { getReadCalendarClientByUserId } from "@/lib/google-calendar/client";
import { SHIFTA_CALENDAR_TIMEZONE } from "@/lib/google-calendar/constants";

const MONTH_REGEX = /^(\d{4})-(\d{2})$/;
const FETCH_CONCURRENCY = 3;
const PAGE_SIZE_CALENDAR_LIST = 250;
const PAGE_SIZE_EVENTS = 2500;
const MAX_ITEMS_PER_DAY = 20;
const DEFAULT_SELECTED_CALENDAR_LIMIT = 3;
const MAX_SELECTED_CALENDAR_COUNT = 10;
const CACHE_TTL_MS = 60 * 1000;
const STALE_FALLBACK_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

type GoogleColorPalettes = {
  calendar: Map<string, string>;
  event: Map<string, string>;
};
export type CalendarDescriptor = {
  id: string;
  summary: string;
  color: string | null;
};
export type MonthRange = {
  month: string;
  startDateKey: string;
  endDateKeyExclusive: string;
  timeMin: string;
  timeMax: string;
};
export type AggregatedEventItem = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string;
  calendarColor: string | null;
};
export type AggregatedDay = {
  date: string;
  count: number;
  items: AggregatedEventItem[];
};
export type CalendarEventsResponseData = {
  month: string;
  calendars: CalendarDescriptor[];
  selectedCalendarIds: string[];
  dates: AggregatedDay[];
};
type CacheEntry = {
  expiresAt: number;
  staleExpiresAt: number;
  data: CalendarEventsResponseData;
};
type GoogleApiErrorCandidate = Error & {
  code?: number | string;
  status?: number;
  response?: { status?: number };
};
type GoogleErrorReasonCandidate = { reason?: unknown };
type GoogleErrorWithMetadata = Error & {
  response?: {
    data?: { error?: { errors?: unknown } };
  };
  cause?: { errors?: unknown };
};

export type GoogleCalendarErrorClassification =
  "oauthScopeMissing" | "retryable" | "accessDenied" | "other";

// This module singleton is intentionally scoped by user, month, and normalized selection.
const calendarEventsCache = new Map<string, CacheEntry>();
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

export function parseCalendarEventsMonth(
  value: string | null,
): MonthRange | null {
  if (!value) return null;
  const match = MONTH_REGEX.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return null;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthKey = `${year}-${pad(month)}`;
  const endDateKeyExclusive = `${nextYear}-${pad(nextMonth)}-01`;
  const startDateKey = `${monthKey}-01`;
  return {
    month: monthKey,
    startDateKey,
    endDateKeyExclusive,
    timeMin: `${startDateKey}T00:00:00+09:00`,
    timeMax: `${endDateKeyExclusive}T00:00:00+09:00`,
  };
}

export function normalizeRequestedCalendarIds(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  )
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_SELECTED_CALENDAR_COUNT);
}

export function extractGoogleCalendarErrorStatus(
  error: unknown,
): number | null {
  if (!(error instanceof Error)) return null;
  const candidate = error as GoogleApiErrorCandidate;
  const status =
    candidate.status ?? candidate.response?.status ?? Number(candidate.code);
  return Number.isFinite(status) ? status : null;
}

function getGoogleErrorReasons(error: unknown): string[] {
  if (!(error instanceof Error)) return [];

  const candidate = error as GoogleErrorWithMetadata;
  const sources = [
    candidate.response?.data?.error?.errors,
    candidate.cause?.errors,
  ];
  const reasons: string[] = [];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (!item || typeof item !== "object") continue;
      const reason = (item as GoogleErrorReasonCandidate).reason;
      if (typeof reason === "string" && reason.length > 0) {
        reasons.push(reason.toLowerCase());
      }
    }
  }

  return reasons;
}

function hasGoogleRateLimitReason(reasons: string[]): boolean {
  return reasons.some((reason) => {
    return (
      reason.includes("ratelimit") ||
      reason.includes("rate_limit") ||
      reason.includes("userratelimitexceeded") ||
      reason.includes("quotaexceeded") ||
      reason.includes("dailylimitexceeded") ||
      reason.includes("calendarusagelimitsexceeded")
    );
  });
}

function hasOAuthScopeMissingReason(reasons: string[]): boolean {
  return reasons.some((reason) => {
    return (
      reason === "insufficientpermissions" ||
      reason === "insufficientauthenticationscopes" ||
      reason === "authscopemissing" ||
      reason === "scopemissing"
    );
  });
}

export function classifyGoogleCalendarError(
  error: unknown,
  status: number,
): GoogleCalendarErrorClassification {
  const reasons = getGoogleErrorReasons(error);
  if (hasGoogleRateLimitReason(reasons)) return "retryable";

  if (status === 403) {
    return hasOAuthScopeMissingReason(reasons)
      ? "oauthScopeMissing"
      : "accessDenied";
  }

  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return "retryable";
  }

  return "other";
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
function toDateKey(value: Date): string {
  const parts = dateKeyFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const [year, month, day] = [get("year"), get("month"), get("day")];
  return year && month && day ? `${year}-${month}-${day}` : "";
}
function normalizeHexColor(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
}
function buildColorPaletteMap(palette: unknown): Map<string, string> {
  if (typeof palette !== "object" || palette === null) return new Map();
  return new Map(
    Object.entries(palette).flatMap(([id, definition]) => {
      if (
        !definition ||
        typeof definition !== "object" ||
        typeof definition.background !== "string"
      )
        return [];
      const color = normalizeHexColor(definition.background);
      return color ? ([[id, color]] as const) : [];
    }),
  );
}
function resolveSelectedCalendars(
  calendars: CalendarDescriptor[],
  requested: string[],
): CalendarDescriptor[] {
  if (requested.length === 0)
    return calendars.slice(0, DEFAULT_SELECTED_CALENDAR_LIMIT);
  const byId = new Map(
    calendars.map((calendar) => [calendar.id, calendar] as const),
  );
  return requested
    .map((id) => byId.get(id))
    .filter((calendar): calendar is CalendarDescriptor => Boolean(calendar));
}
export function getCalendarEventsCacheKey(
  userId: string,
  month: string,
  requested: string[],
): string {
  const selection =
    requested.length > 0
      ? createHash("sha256")
          .update(requested.join(","))
          .digest("hex")
          .slice(0, 20)
      : "default";
  return `${userId}:${month}:${selection}`;
}
function pruneCache(now: number): void {
  for (const [key, entry] of calendarEventsCache)
    if (entry.staleExpiresAt <= now) calendarEventsCache.delete(key);
}
function trimCache(): void {
  const overflow = calendarEventsCache.size - CACHE_MAX_ENTRIES;
  if (overflow <= 0) return;
  for (const [key] of Array.from(calendarEventsCache)
    .sort((a, b) => a[1].staleExpiresAt - b[1].staleExpiresAt)
    .slice(0, overflow))
    calendarEventsCache.delete(key);
}
function readFresh(cacheKey: string): CalendarEventsResponseData | null {
  const entry = calendarEventsCache.get(cacheKey);
  return entry && entry.expiresAt > Date.now() ? entry.data : null;
}
function readStale(cacheKey: string): CalendarEventsResponseData | null {
  const entry = calendarEventsCache.get(cacheKey);
  return entry && entry.staleExpiresAt > Date.now() ? entry.data : null;
}
function writeCache(cacheKey: string, data: CalendarEventsResponseData): void {
  const now = Date.now();
  pruneCache(now);
  calendarEventsCache.set(cacheKey, {
    data,
    expiresAt: now + CACHE_TTL_MS,
    staleExpiresAt: now + CACHE_TTL_MS + STALE_FALLBACK_TTL_MS,
  });
  trimCache();
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  iteratee: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    const index = nextIndex++;
    if (index >= values.length) return;
    results[index] = await iteratee(values[index]);
    await worker();
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), values.length) }, worker),
  );
  return results;
}
type CalendarClient = Awaited<ReturnType<typeof getReadCalendarClientByUserId>>;
async function listCalendars(
  calendar: CalendarClient,
  palettes: GoogleColorPalettes,
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
    for (const entry of response.data.items ?? [])
      if (entry.id)
        calendars.push({
          id: entry.id,
          summary: entry.summary ?? "(タイトルなし)",
          color:
            normalizeHexColor(entry.backgroundColor) ??
            (typeof entry.colorId === "string"
              ? (palettes.calendar.get(entry.colorId) ?? null)
              : null),
        });
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return calendars;
}
async function listEvents(
  calendar: CalendarClient,
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
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return events;
}
function pushEvent(
  days: Map<string, AggregatedDay>,
  date: string,
  item: AggregatedEventItem,
): void {
  const existing = days.get(date);
  if (!existing) {
    days.set(date, { date, count: 1, items: [item] });
    return;
  }
  existing.count += 1;
  if (existing.items.length < MAX_ITEMS_PER_DAY) existing.items.push(item);
}
function aggregateEvent(
  days: Map<string, AggregatedDay>,
  range: MonthRange,
  calendar: CalendarDescriptor,
  palettes: GoogleColorPalettes,
  event: calendar_v3.Schema$Event,
): void {
  if (event.status === "cancelled") return;
  const title = event.summary?.trim() || "(タイトルなし)";
  const eventColor: string | null =
    typeof event.colorId === "string"
      ? (palettes.event.get(event.colorId) ?? null)
      : null;
  const color: string | null = eventColor ?? calendar.color ?? null;
  const allDayStart = event.start?.date;
  const allDayEnd = event.end?.date;
  if (allDayStart) {
    const end = allDayEnd ?? addDays(allDayStart, 1);
    const item = {
      title,
      start: allDayStart,
      end,
      allDay: true,
      calendarId: calendar.id,
      calendarSummary: calendar.summary,
      calendarColor: color,
    };
    for (let date = allDayStart; date < end; date = addDays(date, 1))
      if (date >= range.startDateKey && date < range.endDateKeyExclusive)
        pushEvent(days, date, item);
    return;
  }
  if (!event.start?.dateTime) return;
  const start = new Date(event.start.dateTime);
  if (Number.isNaN(start.getTime())) return;
  const date = toDateKey(start);
  if (!date || date < range.startDateKey || date >= range.endDateKeyExclusive)
    return;
  const end = new Date(event.end?.dateTime ?? event.start.dateTime);
  pushEvent(days, date, {
    title,
    start: timeFormatter.format(start),
    end: Number.isNaN(end.getTime()) ? "" : timeFormatter.format(end),
    allDay: false,
    calendarId: calendar.id,
    calendarSummary: calendar.summary,
    calendarColor: color,
  });
}

export type CalendarEventsFetchResult = {
  data: CalendarEventsResponseData;
  cacheStatus: "hit" | "live";
  cacheKey: string;
  writeCacheAfterResponse: () => void;
};
export async function getCalendarEvents({
  userId,
  range,
  requestedCalendarIds,
}: {
  userId: string;
  range: MonthRange;
  requestedCalendarIds: string[];
}): Promise<CalendarEventsFetchResult> {
  const cacheKey = getCalendarEventsCacheKey(
    userId,
    range.month,
    requestedCalendarIds,
  );
  const cached = readFresh(cacheKey);
  if (cached)
    return {
      data: cached,
      cacheStatus: "hit",
      cacheKey,
      writeCacheAfterResponse: () => pruneCache(Date.now()),
    };
  const calendar = await getReadCalendarClientByUserId(userId);
  let palettes: GoogleColorPalettes = { calendar: new Map(), event: new Map() };
  try {
    const colors = await calendar.colors.get();
    palettes = {
      calendar: buildColorPaletteMap(colors.data.calendar),
      event: buildColorPaletteMap(colors.data.event),
    };
  } catch {
    /* Color lookup is optional. */
  }
  const calendars = await listCalendars(calendar, palettes);
  const selected = resolveSelectedCalendars(calendars, requestedCalendarIds);
  const eventsByCalendar = await mapWithConcurrency(
    selected,
    FETCH_CONCURRENCY,
    async (calendarInfo) => ({
      calendarInfo,
      events: await listEvents(calendar, calendarInfo.id, range),
    }),
  );
  const days = new Map<string, AggregatedDay>();
  for (const { calendarInfo, events } of eventsByCalendar)
    for (const event of events)
      aggregateEvent(days, range, calendarInfo, palettes, event);
  const data = {
    month: range.month,
    calendars,
    selectedCalendarIds: selected.map((calendar) => calendar.id),
    dates: Array.from(days.values()).sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
  return {
    data,
    cacheStatus: "live",
    cacheKey,
    writeCacheAfterResponse: () => writeCache(cacheKey, data),
  };
}
export function getStaleCalendarEvents(
  cacheKey: string,
): CalendarEventsResponseData | null {
  return readStale(cacheKey);
}

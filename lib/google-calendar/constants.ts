export const GOOGLE_CALENDAR_SYNC_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export const GOOGLE_CALENDAR_EVENTS_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_CALENDAR_CALENDAR_LIST_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";

export const GOOGLE_CALENDAR_SYNC_SCOPES = [
  GOOGLE_CALENDAR_SYNC_SCOPE,
] as const;
export const GOOGLE_CALENDAR_READ_SCOPES = [
  GOOGLE_CALENDAR_EVENTS_READ_SCOPE,
  GOOGLE_CALENDAR_CALENDAR_LIST_READ_SCOPE,
] as const;
export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  ...GOOGLE_CALENDAR_SYNC_SCOPES,
  ...GOOGLE_CALENDAR_READ_SCOPES,
] as const;

export const SHIFTA_CALENDAR_NAME = "Shifta シフト";
export const SHIFTA_CALENDAR_DESCRIPTION = "Shifta で管理するシフト・給与情報";
export const SHIFTA_CALENDAR_TIMEZONE = "Asia/Tokyo";

export const CALENDAR_SETUP_PATH = "/my/calendar-setup";
export const CALENDAR_SETUP_SKIP_COOKIE = "shifta_calendar_setup_skipped";

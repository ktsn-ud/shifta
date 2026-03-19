export const GOOGLE_SYNC_ERROR_CODES = {
  CALENDAR_NOT_FOUND: "CALENDAR_NOT_FOUND",
} as const;

export type GoogleSyncErrorCode =
  (typeof GOOGLE_SYNC_ERROR_CODES)[keyof typeof GOOGLE_SYNC_ERROR_CODES];

export class GoogleCalendarSyncError extends Error {
  constructor(
    public readonly code: GoogleSyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleCalendarSyncError";
  }
}

export function requiresCalendarSetupBySyncErrorCode(
  code: string | null | undefined,
): boolean {
  return code === GOOGLE_SYNC_ERROR_CODES.CALENDAR_NOT_FOUND;
}

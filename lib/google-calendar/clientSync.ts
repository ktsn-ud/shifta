import { requiresCalendarSetupBySyncErrorCode } from "./syncErrors";

export type ParsedGoogleSyncFailure = {
  message: string;
  errorCode: string | null;
  requiresCalendarSetup: boolean;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function buildSyncFailure(
  message: string,
  errorCode: string | null,
  requiresCalendarSetup: boolean,
): ParsedGoogleSyncFailure {
  return {
    message,
    errorCode,
    requiresCalendarSetup:
      requiresCalendarSetup ||
      requiresCalendarSetupBySyncErrorCode(errorCode ?? null),
  };
}

export function parseGoogleSyncFailureFromPayload(
  payload: unknown,
  fallbackMessage: string,
): ParsedGoogleSyncFailure | null {
  const parsedPayload = toRecord(payload);
  const sync = toRecord(parsedPayload?.sync);

  if (!sync || sync.ok !== false) {
    return null;
  }

  const message = getString(sync.errorMessage) ?? fallbackMessage;
  const errorCode = getString(sync.errorCode);
  const requiresCalendarSetup = getBoolean(sync.requiresCalendarSetup);

  return buildSyncFailure(message, errorCode, requiresCalendarSetup);
}

export async function readGoogleSyncFailureFromErrorResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ParsedGoogleSyncFailure> {
  try {
    const payload = (await response.json()) as unknown;
    const parsedPayload = toRecord(payload);
    const details = toRecord(parsedPayload?.details);

    const message =
      getString(details?.detail) ??
      getString(parsedPayload?.error) ??
      fallbackMessage;
    const errorCode = getString(details?.code);
    const requiresCalendarSetup = getBoolean(details?.requiresCalendarSetup);

    return buildSyncFailure(message, errorCode, requiresCalendarSetup);
  } catch {
    return buildSyncFailure(fallbackMessage, null, false);
  }
}

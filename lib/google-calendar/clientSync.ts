import { requiresCalendarSetupBySyncErrorCode } from "./syncErrors";
import {
  buildActionableErrorMessage,
  classifyApiErrorKind,
  parseApiErrorMeta,
} from "@/lib/user-facing-error";

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

  const errorCode = getString(sync.errorCode);
  const requiresCalendarSetup = getBoolean(sync.requiresCalendarSetup);
  const kind = classifyApiErrorKind({
    status: 502,
    code: errorCode,
    requiresCalendarSetup,
  });
  const message = buildActionableErrorMessage(fallbackMessage, kind);

  return buildSyncFailure(message, errorCode, requiresCalendarSetup);
}

export async function readGoogleSyncFailureFromErrorResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ParsedGoogleSyncFailure> {
  const meta = await parseApiErrorMeta(response);
  const kind = classifyApiErrorKind(meta);
  const message = buildActionableErrorMessage(fallbackMessage, kind);

  return buildSyncFailure(message, meta.code, meta.requiresCalendarSetup);
}

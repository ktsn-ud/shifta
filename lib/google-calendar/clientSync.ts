import {
  requiresCalendarSetupBySyncErrorCode,
  requiresSignOutBySyncErrorCode,
} from "./syncErrors";
import {
  buildActionableErrorMessage,
  classifyApiErrorKind,
  parseApiErrorMeta,
} from "@/lib/user-facing-error";

export type ParsedGoogleSyncFailure = {
  message: string;
  errorCode: string | null;
  requiresCalendarSetup: boolean;
  requiresSignOut: boolean;
};

export type ParsedGoogleSyncState = {
  pending: boolean;
  failure: ParsedGoogleSyncFailure | null;
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
  requiresSignOut: boolean,
): ParsedGoogleSyncFailure {
  return {
    message,
    errorCode,
    requiresCalendarSetup:
      requiresCalendarSetup ||
      requiresCalendarSetupBySyncErrorCode(errorCode ?? null),
    requiresSignOut:
      requiresSignOut || requiresSignOutBySyncErrorCode(errorCode ?? null),
  };
}

function parseSyncFailureFromSyncObject(
  sync: Record<string, unknown> | null,
  fallbackMessage: string,
): ParsedGoogleSyncFailure | null {
  if (!sync) {
    return null;
  }

  const status = getString(sync.status);
  const isFailed = sync.ok === false || status === "failed";
  if (!isFailed) {
    return null;
  }

  const errorCode = getString(sync.errorCode);
  const requiresCalendarSetup = getBoolean(sync.requiresCalendarSetup);
  const requiresSignOut = getBoolean(sync.requiresSignOut);
  const kind = classifyApiErrorKind({
    status: 502,
    code: errorCode,
    requiresCalendarSetup,
    requiresSignOut,
  });
  const message = buildActionableErrorMessage(fallbackMessage, kind);

  return buildSyncFailure(
    message,
    errorCode,
    requiresCalendarSetup,
    requiresSignOut,
  );
}

function parseSyncPending(
  payload: Record<string, unknown> | null,
  sync: Record<string, unknown> | null,
): boolean {
  if (sync) {
    if (getBoolean(sync.pending)) {
      return true;
    }

    const syncStatus = getString(sync.status);
    if (syncStatus === "pending") {
      return true;
    }
  }

  return getString(payload?.syncStatus) === "pending";
}

export function parseGoogleSyncStateFromPayload(
  payload: unknown,
  fallbackMessage: string,
): ParsedGoogleSyncState {
  const parsedPayload = toRecord(payload);
  const sync = toRecord(parsedPayload?.sync);
  const failure = parseSyncFailureFromSyncObject(sync, fallbackMessage);

  return {
    pending: failure ? false : parseSyncPending(parsedPayload, sync),
    failure,
  };
}

export async function readGoogleSyncFailureFromErrorResponse(
  response: Response,
  fallbackMessage: string,
): Promise<ParsedGoogleSyncFailure> {
  const meta = await parseApiErrorMeta(response);
  const kind = classifyApiErrorKind(meta);
  const message = buildActionableErrorMessage(fallbackMessage, kind);

  return buildSyncFailure(
    message,
    meta.code,
    meta.requiresCalendarSetup,
    meta.requiresSignOut,
  );
}

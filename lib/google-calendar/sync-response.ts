import type { SyncResult } from "@/lib/google-calendar/syncStatus";

export type SyncResponseStatus = "pending" | "success" | "failed";

export type SyncResponsePayload = {
  status: SyncResponseStatus;
  ok: boolean;
  pending: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  requiresCalendarSetup: boolean;
  requiresSignOut: boolean;
};

export function buildPendingSyncResponse(): SyncResponsePayload {
  return {
    status: "pending",
    ok: true,
    pending: true,
    errorMessage: null,
    errorCode: null,
    requiresCalendarSetup: false,
    requiresSignOut: false,
  };
}

export function buildSyncResponseFromResult(
  result: SyncResult,
): SyncResponsePayload {
  if (result.ok) {
    return {
      status: "success",
      ok: true,
      pending: false,
      errorMessage: null,
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    };
  }

  return {
    status: "failed",
    ok: false,
    pending: false,
    errorMessage: result.errorMessage,
    errorCode: result.errorCode,
    requiresCalendarSetup: result.requiresCalendarSetup,
    requiresSignOut: result.requiresSignOut,
  };
}

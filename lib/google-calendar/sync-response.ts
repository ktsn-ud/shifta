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

export function buildSuccessSyncResponse(): SyncResponsePayload {
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

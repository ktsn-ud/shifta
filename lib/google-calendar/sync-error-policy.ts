import "server-only";

import {
  GoogleCalendarSyncError,
  GOOGLE_SYNC_ERROR_CODES,
  type GoogleSyncErrorCode,
  requiresCalendarSetupBySyncErrorCode,
  requiresSignOutBySyncErrorCode,
} from "./syncErrors";

export type SyncRetryAction = "create" | "update" | "retry" | "delete";

export type ResolvedGoogleSyncError = {
  message: string;
  code: GoogleSyncErrorCode | null;
  requiresCalendarSetup: boolean;
  requiresSignOut: boolean;
};

type GoogleErrorReasonCandidate = {
  reason?: unknown;
};

type GoogleErrorWithMetadata = Error & {
  code?: number | string;
  status?: number;
  response?: {
    status?: number;
    headers?: GoogleErrorHeaders;
    data?: {
      error?: {
        message?: unknown;
        errors?: unknown;
      };
    };
  };
  cause?: {
    message?: unknown;
    errors?: unknown;
  };
};

type GoogleErrorHeaders = {
  get?: (name: string) => unknown;
  "retry-after"?: unknown;
  "Retry-After"?: unknown;
};

export const SYNC_RETRY_DELAYS_MS = [500, 1500] as const;
export const RATE_LIMIT_RETRY_DELAYS_MS = [2000, 6000] as const;
export const MAX_GOOGLE_RETRY_AFTER_DELAY_MS = 30_000;

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);
const RETRYABLE_ERROR_CODES = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
] as const;

export function extractGoogleErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as GoogleErrorWithMetadata;
  const status =
    candidate.status ?? candidate.response?.status ?? Number(candidate.code);

  return Number.isFinite(status) ? status : null;
}

export function extractGoogleErrorReasons(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }

  const candidate = error as GoogleErrorWithMetadata;
  const sources = [
    candidate.response?.data?.error?.errors,
    candidate.cause?.errors,
  ];
  const reasons: string[] = [];

  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }

    for (const item of source) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const reason = (item as GoogleErrorReasonCandidate).reason;
      if (typeof reason === "string" && reason.length > 0) {
        reasons.push(reason.toLowerCase());
      }
    }
  }

  return reasons;
}

export function extractGoogleErrorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }

  const candidate = error as GoogleErrorWithMetadata;
  const messages = [
    error.message,
    candidate.response?.data?.error?.message,
    candidate.cause?.message,
  ];

  return messages
    .filter((message): message is string => {
      return typeof message === "string" && message.length > 0;
    })
    .map((message) => message.toLowerCase());
}

export function extractGoogleErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return String((error as GoogleErrorWithMetadata).code ?? "").toUpperCase();
}

export function isGoogleRateLimitError(error: unknown): boolean {
  const hasRateLimitReason = extractGoogleErrorReasons(error).some((reason) => {
    return (
      reason.includes("ratelimit") ||
      reason.includes("rate_limit") ||
      reason.includes("userratelimitexceeded") ||
      reason.includes("quotaexceeded")
    );
  });

  const hasRateLimitMessage = extractGoogleErrorMessages(error).some(
    (message) => {
      return (
        message.includes("rate limit exceeded") ||
        message.includes("user rate limit exceeded") ||
        message.includes("quota exceeded")
      );
    },
  );

  return (
    hasRateLimitReason ||
    hasRateLimitMessage ||
    extractGoogleErrorStatus(error) === 429
  );
}

export function isRetryableGoogleSyncError(error: unknown): boolean {
  if (error instanceof GoogleCalendarSyncError) {
    return false;
  }

  if (isGoogleRateLimitError(error)) {
    return true;
  }

  const status = extractGoogleErrorStatus(error);
  if (
    status !== null &&
    (RETRYABLE_STATUS_CODES.has(status) || status >= 500)
  ) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode = extractGoogleErrorCode(error);
  if (RETRYABLE_ERROR_CODES.some((code) => errorCode.includes(code))) {
    return true;
  }

  return error.message.toLowerCase().includes("timeout");
}

function getRetryAfterHeaderValue(
  headers: GoogleErrorHeaders | undefined,
): unknown {
  if (!headers) {
    return undefined;
  }

  if (typeof headers.get === "function") {
    return (
      headers.get("retry-after") ??
      headers["retry-after"] ??
      headers["Retry-After"]
    );
  }

  return headers["retry-after"] ?? headers["Retry-After"];
}

export function extractGoogleRetryAfterDelayMs(
  error: unknown,
  currentTime = Date.now(),
): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as GoogleErrorWithMetadata;
  const value = getRetryAfterHeaderValue(candidate.response?.headers);
  if (typeof value !== "string") {
    return null;
  }

  const seconds = Number(value);
  const delayMs = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - currentTime;

  if (!Number.isFinite(delayMs) || delayMs < 0) {
    return null;
  }

  return Math.min(Math.ceil(delayMs), MAX_GOOGLE_RETRY_AFTER_DELAY_MS);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function executeWithSyncRetry<T>(
  operation: () => Promise<T>,
  context: {
    action: SyncRetryAction;
    userId: string;
    shiftId: string;
    onRetryScheduled?: (retry: {
      action: SyncRetryAction;
      userId: string;
      shiftId: string;
      attempt: number;
      nextDelayMs: number;
    }) => void;
  },
): Promise<T> {
  async function run(attempt: number): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const delays = isGoogleRateLimitError(error)
        ? RATE_LIMIT_RETRY_DELAYS_MS
        : SYNC_RETRY_DELAYS_MS;
      const hasRetryLeft = attempt < delays.length;
      const shouldRetry = hasRetryLeft && isRetryableGoogleSyncError(error);

      if (!shouldRetry) {
        throw error;
      }

      const fallbackDelayMs = delays[attempt] ?? 0;
      const retryAfterDelayMs = extractGoogleRetryAfterDelayMs(error);
      const delayMs = Math.max(fallbackDelayMs, retryAfterDelayMs ?? 0);
      context.onRetryScheduled?.({
        action: context.action,
        userId: context.userId,
        shiftId: context.shiftId,
        attempt: attempt + 1,
        nextDelayMs: delayMs,
      });

      await wait(delayMs);
      return run(attempt + 1);
    }
  }

  return run(0);
}

export function resolveGoogleSyncError(
  error: unknown,
): ResolvedGoogleSyncError {
  if (error instanceof GoogleCalendarSyncError) {
    return {
      message: error.message,
      code: error.code,
      requiresCalendarSetup: requiresCalendarSetupBySyncErrorCode(error.code),
      requiresSignOut: requiresSignOutBySyncErrorCode(error.code),
    };
  }

  const status = extractGoogleErrorStatus(error);
  if (isGoogleRateLimitError(error)) {
    return {
      message:
        "Google Calendar の利用上限に達しました。時間を置いて再試行してください",
      code: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    };
  }

  if (status === 401) {
    return {
      message: "Google認証に失敗しました。再ログインしてください",
      code: GOOGLE_SYNC_ERROR_CODES.TOKEN_EXPIRED,
      requiresCalendarSetup: false,
      requiresSignOut: true,
    };
  }
  if (status === 403) {
    return {
      message: "Google Calendar へのアクセス権限が不足しています",
      code: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    };
  }
  if (status === 404) {
    return {
      message: "同期先のGoogle Calendarイベントが見つかりません",
      code: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    };
  }
  if (status === 409) {
    return {
      message: "Google Calendar 上で競合が発生しました。再試行してください",
      code: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      message: "Google Calendar 側で一時的なエラーが発生しました",
      code: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    };
  }

  if (error instanceof Error) {
    const code = extractGoogleErrorCode(error);
    if (
      error.message.toLowerCase().includes("timeout") ||
      code.includes("ETIMEDOUT")
    ) {
      return {
        message: "Google Calendar との通信がタイムアウトしました",
        code: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      };
    }
  }

  return {
    message: "Google Calendar との同期に失敗しました",
    code: null,
    requiresCalendarSetup: false,
    requiresSignOut: false,
  };
}

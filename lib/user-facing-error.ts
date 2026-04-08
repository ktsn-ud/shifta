export type UserFacingErrorKind =
  | "validation"
  | "authentication"
  | "authorization"
  | "notFound"
  | "conflict"
  | "calendarSetup"
  | "network"
  | "server";

type ApiErrorMeta = {
  status: number;
  code: string | null;
  requiresCalendarSetup: boolean;
};

type ApiErrorPayload = {
  details?: unknown;
};

const AUTH_ERROR_CODES = new Set([
  "UNAUTHENTICATED",
  "SCOPE_MISSING",
  "READ_SCOPE_MISSING",
  "GOOGLE_ACCOUNT_NOT_FOUND",
  "GOOGLE_ENV_MISSING",
]);

const CALENDAR_SETUP_ERROR_CODES = new Set(["CALENDAR_NOT_FOUND"]);

const ACTION_GUIDANCE_BY_KIND: Record<UserFacingErrorKind, string> = {
  validation: "入力内容を確認して、修正後にもう一度実行してください。",
  authentication: "ログイン状態を確認し、必要な場合は再ログインしてください。",
  authorization:
    "対象データとアカウントを確認し、権限のある操作を実行してください。",
  notFound:
    "対象データが見つからないため、画面を再読み込みしてから再実行してください。",
  conflict:
    "データの競合が発生しました。最新の状態に更新してから再実行してください。",
  calendarSetup:
    "Google Calendar 設定ページで連携を再設定してから再実行してください。",
  network: "通信環境を確認し、時間をおいてから再実行してください。",
  server: "時間をおいてから再実行してください。",
};

function normalizeErrorCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getResponseDetails(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const details = (payload as ApiErrorPayload).details;
  if (typeof details !== "object" || details === null) {
    return null;
  }

  return details as Record<string, unknown>;
}

function toErrorKindByStatus(status: number): UserFacingErrorKind {
  if (status === 400 || status === 422) {
    return "validation";
  }

  if (status === 401) {
    return "authentication";
  }

  if (status === 403) {
    return "authorization";
  }

  if (status === 404) {
    return "notFound";
  }

  if (status === 409) {
    return "conflict";
  }

  if (status === 408 || status === 429 || status === 502 || status === 503) {
    return "network";
  }

  return "server";
}

export function buildActionableErrorMessage(
  baseMessage: string,
  kind: UserFacingErrorKind,
): string {
  return `${baseMessage} ${ACTION_GUIDANCE_BY_KIND[kind]}`.trim();
}

export function classifyApiErrorKind(meta: ApiErrorMeta): UserFacingErrorKind {
  if (meta.requiresCalendarSetup) {
    return "calendarSetup";
  }

  if (meta.code && CALENDAR_SETUP_ERROR_CODES.has(meta.code)) {
    return "calendarSetup";
  }

  if (meta.code && AUTH_ERROR_CODES.has(meta.code)) {
    return "authentication";
  }

  return toErrorKindByStatus(meta.status);
}

export class UserFacingError extends Error {
  readonly kind: UserFacingErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly requiresCalendarSetup: boolean;

  constructor(
    message: string,
    kind: UserFacingErrorKind,
    options?: {
      status?: number | null;
      code?: string | null;
      requiresCalendarSetup?: boolean;
    },
  ) {
    super(message);
    this.name = "UserFacingError";
    this.kind = kind;
    this.status = options?.status ?? null;
    this.code = options?.code ?? null;
    this.requiresCalendarSetup = options?.requiresCalendarSetup ?? false;
  }
}

export async function parseApiErrorMeta(
  response: Response,
): Promise<ApiErrorMeta> {
  try {
    const payload = (await response.json()) as unknown;
    const details = getResponseDetails(payload);
    const code = normalizeErrorCode(details?.code);
    const requiresCalendarSetup = details?.requiresCalendarSetup === true;

    return {
      status: response.status,
      code,
      requiresCalendarSetup,
    };
  } catch {
    return {
      status: response.status,
      code: null,
      requiresCalendarSetup: false,
    };
  }
}

export async function resolveUserFacingErrorFromResponse(
  response: Response,
  fallbackMessage: string,
): Promise<{
  message: string;
  kind: UserFacingErrorKind;
  code: string | null;
  status: number;
  requiresCalendarSetup: boolean;
}> {
  const meta = await parseApiErrorMeta(response);
  const kind = classifyApiErrorKind(meta);
  const message = buildActionableErrorMessage(fallbackMessage, kind);

  return {
    message,
    kind,
    code: meta.code,
    status: meta.status,
    requiresCalendarSetup: meta.requiresCalendarSetup,
  };
}

function classifyUnknownErrorKind(error: unknown): UserFacingErrorKind {
  if (error instanceof UserFacingError) {
    return error.kind;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      kind?: unknown;
      status?: unknown;
      code?: unknown;
      requiresCalendarSetup?: unknown;
    };

    if (candidate.requiresCalendarSetup === true) {
      return "calendarSetup";
    }

    const code = normalizeErrorCode(candidate.code);
    if (code && CALENDAR_SETUP_ERROR_CODES.has(code)) {
      return "calendarSetup";
    }
    if (code && AUTH_ERROR_CODES.has(code)) {
      return "authentication";
    }

    if (typeof candidate.kind === "string") {
      const kinds: UserFacingErrorKind[] = [
        "validation",
        "authentication",
        "authorization",
        "notFound",
        "conflict",
        "calendarSetup",
        "network",
        "server",
      ];

      if (kinds.includes(candidate.kind as UserFacingErrorKind)) {
        return candidate.kind as UserFacingErrorKind;
      }
    }

    if (typeof candidate.status === "number") {
      return toErrorKindByStatus(candidate.status);
    }
  }

  if (error instanceof TypeError) {
    return "network";
  }

  return "server";
}

export function toUserFacingMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (error instanceof UserFacingError) {
    return error.message;
  }

  const kind = classifyUnknownErrorKind(error);
  return buildActionableErrorMessage(fallbackMessage, kind);
}

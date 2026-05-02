import type { PayrollRule, User } from "@/lib/generated/prisma/client";
import {
  buildPayrollRuleWhereForDateRange,
  resolvePayrollRuleDateRange,
} from "@/lib/payroll/rule-query";
import { prisma } from "@/lib/prisma";
import {
  GoogleCalendarSyncError,
  GOOGLE_SYNC_ERROR_CODES,
  type GoogleSyncErrorCode,
  requiresCalendarSetupBySyncErrorCode,
  requiresSignOutBySyncErrorCode,
} from "./syncErrors";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getVerifiedCalendarClient,
  updateCalendarEvent,
} from "./syncEvent";

type ShiftSyncStatus = "PENDING" | "SUCCESS" | "FAILED";

type SyncAction = "create" | "update" | "retry" | "delete";

type SyncFailureResult = {
  ok: false;
  errorMessage: string;
  errorCode: GoogleSyncErrorCode | null;
  requiresCalendarSetup: boolean;
  requiresSignOut: boolean;
};

export type SyncResult =
  | {
      ok: true;
      googleEventId: string | null;
    }
  | SyncFailureResult;

export type DeletionSyncResult = { ok: true } | SyncFailureResult;

type SyncLog = {
  userId: string;
  shiftId: string;
  action: SyncAction;
  status: ShiftSyncStatus;
  durationMs: number;
  googleEventId?: string | null;
  error?: string;
  errorCode?: GoogleSyncErrorCode | null;
};

type ResolvedSyncError = {
  message: string;
  code: GoogleSyncErrorCode | null;
  requiresCalendarSetup: boolean;
  requiresSignOut: boolean;
};

const BULK_SYNC_CONCURRENCY = 3;
const SYNC_RETRY_DELAYS_MS = [500, 1500] as const;
const RATE_LIMIT_RETRY_DELAYS_MS = [2000, 6000] as const;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);
const RETRYABLE_ERROR_CODES = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
] as const;

function extractGoogleErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as Error & {
    code?: number | string;
    status?: number;
    response?: {
      status?: number;
    };
  };

  const status =
    candidate.status ?? candidate.response?.status ?? Number(candidate.code);

  return Number.isFinite(status) ? status : null;
}

type GoogleErrorReasonCandidate = {
  reason?: unknown;
};

type GoogleErrorWithMetadata = Error & {
  response?: {
    status?: number;
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

function getGoogleErrorReasons(error: unknown): string[] {
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

function getGoogleErrorMessages(error: unknown): string[] {
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

function isGoogleRateLimitError(error: unknown): boolean {
  const reasons = getGoogleErrorReasons(error);
  const hasRateLimitReason = reasons.some((reason) => {
    return (
      reason.includes("ratelimit") ||
      reason.includes("rate_limit") ||
      reason.includes("userratelimitexceeded") ||
      reason.includes("quotaexceeded")
    );
  });

  const messages = getGoogleErrorMessages(error);
  const hasRateLimitMessage = messages.some((message) => {
    return (
      message.includes("rate limit exceeded") ||
      message.includes("user rate limit exceeded") ||
      message.includes("quota exceeded")
    );
  });

  if (hasRateLimitReason || hasRateLimitMessage) {
    return true;
  }

  const status = extractGoogleErrorStatus(error);
  return status === 429;
}

function extractGoogleErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return String(
    (error as Error & { code?: number | string }).code ?? "",
  ).toUpperCase();
}

function isRetryableGoogleSyncError(error: unknown): boolean {
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
  if (
    RETRYABLE_ERROR_CODES.some((code) => {
      return errorCode.includes(code);
    })
  ) {
    return true;
  }

  return error.message.toLowerCase().includes("timeout");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function executeWithSyncRetry<T>(
  operation: () => Promise<T>,
  context: {
    action: SyncAction;
    userId: string;
    shiftId: string;
  },
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
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

      const delayMs = delays[attempt] ?? 0;
      console.warn("Google Calendar sync retry scheduled", {
        action: context.action,
        userId: context.userId,
        shiftId: context.shiftId,
        attempt: attempt + 1,
        nextDelayMs: delayMs,
      });

      await wait(delayMs);
    }
  }
}

function resolveGoogleSyncError(error: unknown): ResolvedSyncError {
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

function logSyncEvent(entry: SyncLog): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      userId: entry.userId,
      shiftId: entry.shiftId,
      action: entry.action,
      status: entry.status,
      googleEventId: entry.googleEventId ?? null,
      error: entry.error ?? null,
      error_code: entry.errorCode ?? null,
      duration_ms: entry.durationMs,
    }),
  );
}

async function clearCalendarIdForReinitialize(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        calendarId: null,
      },
    });
  } catch (error) {
    console.error("Failed to clear stale calendarId", {
      userId,
      error,
    });
  }
}

async function updateSyncStatus(
  shiftId: string,
  status: ShiftSyncStatus,
  options?: {
    error?: string | null;
    googleEventId?: string | null;
  },
): Promise<void> {
  await prisma.shift.update({
    where: { id: shiftId },
    data: {
      googleSyncStatus: status,
      googleSyncError: options?.error ?? null,
      googleSyncedAt: new Date(),
      ...(options?.googleEventId !== undefined
        ? { googleEventId: options.googleEventId }
        : {}),
    },
  });
}

async function findShiftForSync(shiftId: string, userId: string) {
  return prisma.shift.findFirst({
    where: {
      id: shiftId,
      workplace: {
        userId,
      },
    },
    include: {
      lessonRange: true,
      workplace: true,
    },
  });
}

async function findShiftsForSync(shiftIds: string[], userId: string) {
  return prisma.shift.findMany({
    where: {
      id: {
        in: shiftIds,
      },
      workplace: {
        userId,
      },
    },
    include: {
      lessonRange: true,
      workplace: true,
    },
  });
}

async function findUserForSync(userId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: userId },
  });
}

async function buildPayrollRulesByWorkplace(
  shifts: Awaited<ReturnType<typeof findShiftsForSync>>,
): Promise<Map<string, PayrollRule[]>> {
  const workplaceIds = Array.from(
    new Set(shifts.map((shift) => shift.workplaceId)),
  );
  if (workplaceIds.length === 0) {
    return new Map();
  }

  const payrollRuleDateRange = resolvePayrollRuleDateRange(shifts);
  if (!payrollRuleDateRange) {
    return new Map();
  }

  const payrollRules = await prisma.payrollRule.findMany({
    where: buildPayrollRuleWhereForDateRange(
      workplaceIds,
      payrollRuleDateRange,
    ),
    orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
  });

  const payrollRulesByWorkplace = new Map<string, PayrollRule[]>();
  for (const rule of payrollRules) {
    const rules = payrollRulesByWorkplace.get(rule.workplaceId) ?? [];
    rules.push(rule);
    payrollRulesByWorkplace.set(rule.workplaceId, rules);
  }

  return payrollRulesByWorkplace;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const safeLimit = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, () => worker()),
  );

  return results;
}

async function runShiftSync(
  shiftId: string,
  userId: string,
  action: Exclude<SyncAction, "delete">,
): Promise<SyncResult> {
  const startedAt = Date.now();

  await updateSyncStatus(shiftId, "PENDING", {
    error: null,
  });

  try {
    const [shift, user] = await Promise.all([
      findShiftForSync(shiftId, userId),
      findUserForSync(userId),
    ]);

    if (!shift || !user) {
      throw new Error("同期対象のシフトまたはユーザーが見つかりません");
    }

    let googleEventId = shift.googleEventId;

    googleEventId = await executeWithSyncRetry(
      async () => {
        if (action === "create") {
          return createCalendarEvent(shift, shift.workplace, user);
        }

        if (shift.googleEventId) {
          await updateCalendarEvent(shift, shift.workplace, user);
          return shift.googleEventId;
        }

        return createCalendarEvent(shift, shift.workplace, user);
      },
      {
        action,
        userId,
        shiftId,
      },
    );

    await updateSyncStatus(shiftId, "SUCCESS", {
      googleEventId,
      error: null,
    });

    logSyncEvent({
      userId,
      shiftId,
      action,
      status: "SUCCESS",
      googleEventId,
      durationMs: Date.now() - startedAt,
    });

    return {
      ok: true,
      googleEventId,
    };
  } catch (error) {
    console.error("Google Calendar shift sync failed", {
      action,
      userId,
      shiftId,
      error,
    });

    const syncError = resolveGoogleSyncError(error);
    if (syncError.requiresCalendarSetup) {
      await clearCalendarIdForReinitialize(userId);
    }

    await updateSyncStatus(shiftId, "FAILED", {
      error: syncError.message,
    });

    logSyncEvent({
      userId,
      shiftId,
      action,
      status: "FAILED",
      error: syncError.message,
      errorCode: syncError.code,
      durationMs: Date.now() - startedAt,
    });

    return {
      ok: false,
      errorMessage: syncError.message,
      errorCode: syncError.code,
      requiresCalendarSetup: syncError.requiresCalendarSetup,
      requiresSignOut: syncError.requiresSignOut,
    };
  }
}

export async function syncShiftAfterCreate(
  shiftId: string,
  userId: string,
): Promise<SyncResult> {
  return runShiftSync(shiftId, userId, "create");
}

export async function syncShiftsAfterBulkCreate(
  shiftIds: string[],
  userId: string,
): Promise<Array<{ shiftId: string } & SyncResult>> {
  if (shiftIds.length === 0) {
    return [];
  }

  const [user, shifts] = await Promise.all([
    findUserForSync(userId),
    findShiftsForSync(shiftIds, userId),
  ]);

  const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
  const payrollRulesByWorkplace = await buildPayrollRulesByWorkplace(shifts);
  const existingShiftIds = Array.from(shiftsById.keys());

  if (existingShiftIds.length > 0) {
    await prisma.shift.updateMany({
      where: {
        id: {
          in: existingShiftIds,
        },
      },
      data: {
        googleSyncStatus: "PENDING",
        googleSyncError: null,
        googleSyncedAt: new Date(),
      },
    });
  }

  let clearCalendarIdPromise: Promise<void> | null = null;
  const clearCalendarIdOnce = async () => {
    if (!clearCalendarIdPromise) {
      clearCalendarIdPromise = clearCalendarIdForReinitialize(userId);
    }

    await clearCalendarIdPromise;
  };

  let sharedCalendar: Awaited<
    ReturnType<typeof getVerifiedCalendarClient>
  > | null = null;

  if (user?.calendarId) {
    try {
      sharedCalendar = await getVerifiedCalendarClient(user);
    } catch (error) {
      const syncError = resolveGoogleSyncError(error);
      if (syncError.requiresCalendarSetup) {
        await clearCalendarIdOnce();
      }

      if (existingShiftIds.length > 0) {
        await prisma.shift.updateMany({
          where: {
            id: {
              in: existingShiftIds,
            },
          },
          data: {
            googleSyncStatus: "FAILED",
            googleSyncError: syncError.message,
            googleSyncedAt: new Date(),
          },
        });
      }

      return mapWithConcurrency(
        shiftIds,
        BULK_SYNC_CONCURRENCY,
        async (shiftId) => {
          const startedAt = Date.now();
          const shift = shiftsById.get(shiftId);

          if (!shift || !user) {
            const errorMessage =
              "同期対象のシフトまたはユーザーが見つかりません";
            await updateSyncStatus(shiftId, "FAILED", {
              error: errorMessage,
            });

            logSyncEvent({
              userId,
              shiftId,
              action: "create",
              status: "FAILED",
              error: errorMessage,
              durationMs: Date.now() - startedAt,
            });

            return {
              shiftId,
              ok: false as const,
              errorMessage,
              errorCode: null,
              requiresCalendarSetup: false,
              requiresSignOut: false,
            };
          }

          logSyncEvent({
            userId,
            shiftId,
            action: "create",
            status: "FAILED",
            error: syncError.message,
            errorCode: syncError.code,
            durationMs: Date.now() - startedAt,
          });

          return {
            shiftId,
            ok: false as const,
            errorMessage: syncError.message,
            errorCode: syncError.code,
            requiresCalendarSetup: syncError.requiresCalendarSetup,
            requiresSignOut: syncError.requiresSignOut,
          };
        },
      );
    }
  }

  return mapWithConcurrency(
    shiftIds,
    BULK_SYNC_CONCURRENCY,
    async (shiftId) => {
      const startedAt = Date.now();
      const shift = shiftsById.get(shiftId);

      if (!shift || !user) {
        const errorMessage = "同期対象のシフトまたはユーザーが見つかりません";
        await updateSyncStatus(shiftId, "FAILED", {
          error: errorMessage,
        });

        logSyncEvent({
          userId,
          shiftId,
          action: "create",
          status: "FAILED",
          error: errorMessage,
          durationMs: Date.now() - startedAt,
        });

        return {
          shiftId,
          ok: false as const,
          errorMessage,
          errorCode: null,
          requiresCalendarSetup: false,
          requiresSignOut: false,
        };
      }

      try {
        const googleEventId = await executeWithSyncRetry(
          async () =>
            createCalendarEvent(shift, shift.workplace, user, {
              calendar: sharedCalendar ?? undefined,
              skipCalendarExistenceCheck: sharedCalendar !== null,
              payrollRulesByWorkplaceId: payrollRulesByWorkplace,
            }),
          {
            action: "create",
            userId,
            shiftId,
          },
        );

        await updateSyncStatus(shiftId, "SUCCESS", {
          googleEventId,
          error: null,
        });

        logSyncEvent({
          userId,
          shiftId,
          action: "create",
          status: "SUCCESS",
          googleEventId,
          durationMs: Date.now() - startedAt,
        });

        return {
          shiftId,
          ok: true as const,
          googleEventId,
        };
      } catch (error) {
        console.error("Google Calendar bulk shift sync failed", {
          action: "create",
          userId,
          shiftId,
          error,
        });

        const syncError = resolveGoogleSyncError(error);
        if (syncError.requiresCalendarSetup) {
          await clearCalendarIdOnce();
        }

        await updateSyncStatus(shiftId, "FAILED", {
          error: syncError.message,
        });

        logSyncEvent({
          userId,
          shiftId,
          action: "create",
          status: "FAILED",
          error: syncError.message,
          errorCode: syncError.code,
          durationMs: Date.now() - startedAt,
        });

        return {
          shiftId,
          ok: false as const,
          errorMessage: syncError.message,
          errorCode: syncError.code,
          requiresCalendarSetup: syncError.requiresCalendarSetup,
          requiresSignOut: syncError.requiresSignOut,
        };
      }
    },
  );
}

export async function syncShiftAfterUpdate(
  shiftId: string,
  userId: string,
): Promise<SyncResult> {
  return runShiftSync(shiftId, userId, "update");
}

export async function retryShiftSync(
  shiftId: string,
  userId: string,
): Promise<SyncResult> {
  return runShiftSync(shiftId, userId, "retry");
}

export async function syncShiftDeletion(
  shiftId: string,
  userId: string,
  googleEventId: string | null,
): Promise<DeletionSyncResult> {
  if (!googleEventId) {
    return { ok: true };
  }

  const startedAt = Date.now();

  try {
    const user = await findUserForSync(userId);
    if (!user) {
      throw new Error("ユーザーが見つかりません");
    }

    await executeWithSyncRetry(
      () => deleteCalendarEvent(googleEventId, shiftId, user),
      {
        action: "delete",
        userId,
        shiftId,
      },
    );

    logSyncEvent({
      userId,
      shiftId,
      action: "delete",
      status: "SUCCESS",
      googleEventId,
      durationMs: Date.now() - startedAt,
    });
    return { ok: true };
  } catch (error) {
    console.error("Google Calendar shift deletion sync failed", {
      action: "delete",
      userId,
      shiftId,
      googleEventId,
      error,
    });

    const syncError = resolveGoogleSyncError(error);
    if (syncError.requiresCalendarSetup) {
      await clearCalendarIdForReinitialize(userId);
    }

    logSyncEvent({
      userId,
      shiftId,
      action: "delete",
      status: "FAILED",
      googleEventId,
      error: syncError.message,
      errorCode: syncError.code,
      durationMs: Date.now() - startedAt,
    });

    return {
      ok: false,
      errorMessage: syncError.message,
      errorCode: syncError.code,
      requiresCalendarSetup: syncError.requiresCalendarSetup,
      requiresSignOut: syncError.requiresSignOut,
    };
  }
}

export async function getOwnedShiftSyncStatus(shiftId: string, userId: string) {
  return prisma.shift.findFirst({
    where: {
      id: shiftId,
      workplace: {
        userId,
      },
    },
    select: {
      id: true,
      googleEventId: true,
      googleSyncStatus: true,
      googleSyncError: true,
      googleSyncedAt: true,
    },
  });
}

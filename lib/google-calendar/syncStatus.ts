import type { PayrollRule, User } from "@/lib/generated/prisma/client";
import {
  buildPayrollRuleWhereForDateRange,
  resolvePayrollRuleDateRange,
} from "@/lib/payroll/rule-query";
import { prisma } from "@/lib/prisma";
import { revalidateShiftSyncTags } from "@/lib/cache/revalidate";
import type { GoogleSyncErrorCode } from "./syncErrors";
import {
  executeWithSyncRetry,
  resolveGoogleSyncError,
  type SyncRetryAction,
} from "./sync-error-policy";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getVerifiedCalendarClient,
  updateCalendarEvent,
} from "./syncEvent";

type ShiftSyncStatus = "PENDING" | "SUCCESS" | "FAILED";

type SyncAction = SyncRetryAction;

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

const BULK_SYNC_CONCURRENCY = 3;

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

function logScheduledSyncRetry(retry: {
  action: SyncAction;
  userId: string;
  shiftId: string;
  attempt: number;
  nextDelayMs: number;
}): void {
  console.warn("Google Calendar sync retry scheduled", retry);
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
    const syncError = resolveGoogleSyncError(error);
    console.error("Failed to clear stale calendarId", {
      userId,
      error: syncError.message,
      errorCode: syncError.code,
    });
  }
}

async function updateSyncStatus(
  shiftId: string,
  userId: string,
  status: ShiftSyncStatus,
  options?: {
    error?: string | null;
    googleEventId?: string | null;
  },
): Promise<boolean> {
  const result = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      workplace: {
        userId,
      },
    },
    data: {
      googleSyncStatus: status,
      googleSyncError: options?.error ?? null,
      googleSyncedAt: new Date(),
      ...(options?.googleEventId !== undefined
        ? { googleEventId: options.googleEventId }
        : {}),
    },
  });

  if (result.count === 0) {
    return false;
  }

  revalidateShiftSyncTags({ userId });
  return true;
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

  function worker(): Promise<void> {
    const index = cursor;
    cursor += 1;

    if (index >= items.length) {
      return Promise.resolve();
    }

    return mapper(items[index], index).then((result) => {
      results[index] = result;
      return worker();
    });
  }

  await Promise.all(
    Array.from({ length: Math.min(safeLimit, items.length) }, worker),
  );

  return results;
}

async function runShiftSync(
  shiftId: string,
  userId: string,
  action: Exclude<SyncAction, "delete">,
): Promise<SyncResult> {
  const startedAt = Date.now();

  try {
    const [shift, user] = await Promise.all([
      findShiftForSync(shiftId, userId),
      findUserForSync(userId),
    ]);

    if (!shift || !user) {
      const errorMessage = "同期対象のシフトまたはユーザーが見つかりません";

      logSyncEvent({
        userId,
        shiftId,
        action,
        status: "FAILED",
        error: errorMessage,
        durationMs: Date.now() - startedAt,
      });

      return {
        ok: false,
        errorMessage,
        errorCode: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      };
    }

    const pendingUpdated = await updateSyncStatus(shiftId, userId, "PENDING", {
      error: null,
    });
    if (!pendingUpdated) {
      const errorMessage = "同期対象のシフトが見つかりません";

      logSyncEvent({
        userId,
        shiftId,
        action,
        status: "FAILED",
        error: errorMessage,
        durationMs: Date.now() - startedAt,
      });

      return {
        ok: false,
        errorMessage,
        errorCode: null,
        requiresCalendarSetup: false,
        requiresSignOut: false,
      };
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
        onRetryScheduled: logScheduledSyncRetry,
      },
    );

    await updateSyncStatus(shiftId, userId, "SUCCESS", {
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
    const syncError = resolveGoogleSyncError(error);
    console.error("Google Calendar shift sync failed", {
      action,
      userId,
      shiftId,
      error: syncError.message,
      errorCode: syncError.code,
    });

    if (syncError.requiresCalendarSetup) {
      await clearCalendarIdForReinitialize(userId);
    }

    await updateSyncStatus(shiftId, userId, "FAILED", {
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

    revalidateShiftSyncTags({ userId });
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

        revalidateShiftSyncTags({ userId });
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
            await updateSyncStatus(shiftId, userId, "FAILED", {
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
        await updateSyncStatus(shiftId, userId, "FAILED", {
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
            onRetryScheduled: logScheduledSyncRetry,
          },
        );

        await updateSyncStatus(shiftId, userId, "SUCCESS", {
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
        const syncError = resolveGoogleSyncError(error);
        console.error("Google Calendar bulk shift sync failed", {
          action: "create",
          userId,
          shiftId,
          error: syncError.message,
          errorCode: syncError.code,
        });

        if (syncError.requiresCalendarSetup) {
          await clearCalendarIdOnce();
        }

        await updateSyncStatus(shiftId, userId, "FAILED", {
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
        onRetryScheduled: logScheduledSyncRetry,
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
    const syncError = resolveGoogleSyncError(error);
    console.error("Google Calendar shift deletion sync failed", {
      action: "delete",
      userId,
      shiftId,
      googleEventId,
      error: syncError.message,
      errorCode: syncError.code,
    });

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

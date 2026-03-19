import type { User } from "@/lib/generated/prisma/client";
import { type PayrollRuleForEstimate } from "@/lib/payroll/estimate";
import { prisma } from "@/lib/prisma";
import {
  GoogleCalendarSyncError,
  type GoogleSyncErrorCode,
  requiresCalendarSetupBySyncErrorCode,
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
};

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

function resolveGoogleSyncError(error: unknown): ResolvedSyncError {
  if (error instanceof GoogleCalendarSyncError) {
    return {
      message: error.message,
      code: error.code,
      requiresCalendarSetup: requiresCalendarSetupBySyncErrorCode(error.code),
    };
  }

  const status = extractGoogleErrorStatus(error);
  if (status === 401) {
    return {
      message: "Google認証に失敗しました。再ログインしてください",
      code: null,
      requiresCalendarSetup: false,
    };
  }
  if (status === 403) {
    return {
      message: "Google Calendar へのアクセス権限が不足しています",
      code: null,
      requiresCalendarSetup: false,
    };
  }
  if (status === 404) {
    return {
      message: "同期先のGoogle Calendarイベントが見つかりません",
      code: null,
      requiresCalendarSetup: false,
    };
  }
  if (status === 409) {
    return {
      message: "Google Calendar 上で競合が発生しました。再試行してください",
      code: null,
      requiresCalendarSetup: false,
    };
  }
  if (typeof status === "number" && status >= 500) {
    return {
      message: "Google Calendar 側で一時的なエラーが発生しました",
      code: null,
      requiresCalendarSetup: false,
    };
  }

  if (error instanceof Error) {
    const code = String(
      (error as Error & { code?: number | string }).code ?? "",
    ).toUpperCase();
    if (
      error.message.toLowerCase().includes("timeout") ||
      code.includes("ETIMEDOUT")
    ) {
      return {
        message: "Google Calendar との通信がタイムアウトしました",
        code: null,
        requiresCalendarSetup: false,
      };
    }
  }

  return {
    message: "Google Calendar との同期に失敗しました",
    code: null,
    requiresCalendarSetup: false,
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
): Promise<Map<string, PayrollRuleForEstimate[]>> {
  const workplaceIds = Array.from(
    new Set(shifts.map((shift) => shift.workplaceId)),
  );
  if (workplaceIds.length === 0) {
    return new Map();
  }

  const payrollRules = await prisma.payrollRule.findMany({
    where: {
      workplaceId: {
        in: workplaceIds,
      },
    },
    orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
  });

  const payrollRulesByWorkplace = new Map<string, PayrollRuleForEstimate[]>();
  for (const rule of payrollRules) {
    const rules = payrollRulesByWorkplace.get(rule.workplaceId) ?? [];
    rules.push(rule);
    payrollRulesByWorkplace.set(rule.workplaceId, rules);
  }

  return payrollRulesByWorkplace;
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

    if (action === "create") {
      googleEventId = await createCalendarEvent(shift, shift.workplace, user);
    } else if (shift.googleEventId) {
      await updateCalendarEvent(shift, shift.workplace, user);
    } else {
      googleEventId = await createCalendarEvent(shift, shift.workplace, user);
    }

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

  let sharedCalendar: Awaited<
    ReturnType<typeof getVerifiedCalendarClient>
  > | null = null;

  if (user?.calendarId) {
    try {
      sharedCalendar = await getVerifiedCalendarClient(user);
    } catch (error) {
      const syncError = resolveGoogleSyncError(error);
      if (syncError.requiresCalendarSetup) {
        await clearCalendarIdForReinitialize(userId);
      }

      return Promise.all(
        shiftIds.map(async (shiftId) => {
          const startedAt = Date.now();
          const shift = shiftsById.get(shiftId);

          await updateSyncStatus(shiftId, "PENDING", {
            error: null,
          });

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
            };
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
          };
        }),
      );
    }
  }

  return Promise.all(
    shiftIds.map(async (shiftId) => {
      const startedAt = Date.now();
      const shift = shiftsById.get(shiftId);

      await updateSyncStatus(shiftId, "PENDING", {
        error: null,
      });

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
        };
      }

      try {
        const googleEventId = await createCalendarEvent(
          shift,
          shift.workplace,
          user,
          {
            calendar: sharedCalendar ?? undefined,
            skipCalendarExistenceCheck: sharedCalendar !== null,
            payrollRulesByWorkplaceId: payrollRulesByWorkplace,
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
          await clearCalendarIdForReinitialize(userId);
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
        };
      }
    }),
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

    await deleteCalendarEvent(googleEventId, shiftId, user);

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

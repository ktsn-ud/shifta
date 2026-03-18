import type { User } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "./syncEvent";

type ShiftSyncStatus = "PENDING" | "SUCCESS" | "FAILED";

type SyncAction = "create" | "update" | "retry" | "delete";

type SyncResult =
  | {
      ok: true;
      googleEventId: string | null;
    }
  | {
      ok: false;
      errorMessage: string;
    };

type SyncLog = {
  userId: string;
  shiftId: string;
  action: SyncAction;
  status: ShiftSyncStatus;
  durationMs: number;
  googleEventId?: string | null;
  error?: string;
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

function formatGoogleSyncError(error: unknown): string {
  const status = extractGoogleErrorStatus(error);
  if (status === 401) {
    return "Google認証に失敗しました。再ログインしてください";
  }
  if (status === 403) {
    return "Google Calendar へのアクセス権限が不足しています";
  }
  if (status === 404) {
    return "同期先のGoogle Calendarイベントが見つかりません";
  }
  if (status === 409) {
    return "Google Calendar 上で競合が発生しました。再試行してください";
  }
  if (typeof status === "number" && status >= 500) {
    return "Google Calendar 側で一時的なエラーが発生しました";
  }

  if (error instanceof Error) {
    const code = String(
      (error as Error & { code?: number | string }).code ?? "",
    ).toUpperCase();
    if (
      error.message.toLowerCase().includes("timeout") ||
      code.includes("ETIMEDOUT")
    ) {
      return "Google Calendar との通信がタイムアウトしました";
    }
  }

  return "Google Calendar との同期に失敗しました";
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
      duration_ms: entry.durationMs,
    }),
  );
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

    const errorMessage = formatGoogleSyncError(error);

    await updateSyncStatus(shiftId, "FAILED", {
      error: errorMessage,
    });

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
        };
      }

      try {
        const googleEventId = await createCalendarEvent(
          shift,
          shift.workplace,
          user,
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

        const errorMessage = formatGoogleSyncError(error);

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
): Promise<void> {
  if (!googleEventId) {
    return;
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
  } catch (error) {
    console.error("Google Calendar shift deletion sync failed", {
      action: "delete",
      userId,
      shiftId,
      googleEventId,
      error,
    });

    const errorMessage = formatGoogleSyncError(error);

    logSyncEvent({
      userId,
      shiftId,
      action: "delete",
      status: "FAILED",
      googleEventId,
      error: errorMessage,
      durationMs: Date.now() - startedAt,
    });
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

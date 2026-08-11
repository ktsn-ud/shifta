import {
  revalidateShiftDomainTags,
  revalidateShiftSyncTags,
} from "@/lib/cache/revalidate";
import {
  retryShiftSync,
  syncShiftAfterCreate,
  syncShiftAfterUpdate,
  syncShiftDeletion,
  syncShiftDeletionsAfterWorkplaceDeletion,
  syncShiftsAfterBulkCreate,
} from "@/lib/google-calendar/syncStatus";
import { waitFor } from "@testing-library/react";
import type {
  Shift,
  ShiftLessonRange,
  Workplace,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateShiftDomainTags: jest.fn(),
  revalidateShiftSyncTags: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    payrollRule: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/google-calendar/syncEvent", () => ({
  createCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  getVerifiedCalendarClient: jest.fn(),
  updateCalendarEvent: jest.fn(),
}));

const revalidateShiftDomainTagsMock = jest.mocked(revalidateShiftDomainTags);
const revalidateShiftSyncTagsMock = jest.mocked(revalidateShiftSyncTags);
const shiftUpdateManyMock = jest.mocked(prisma.shift.updateMany);
const shiftFindFirstMock = jest.mocked(prisma.shift.findFirst);
const shiftFindManyMock = jest.mocked(prisma.shift.findMany);
const payrollRuleFindManyMock = jest.mocked(prisma.payrollRule.findMany);
const userFindUniqueMock = jest.mocked(prisma.user.findUnique);

const {
  createCalendarEvent,
  deleteCalendarEvent,
  getVerifiedCalendarClient,
  updateCalendarEvent,
} = jest.requireMock("@/lib/google-calendar/syncEvent") as {
  createCalendarEvent: jest.Mock;
  deleteCalendarEvent: jest.Mock;
  getVerifiedCalendarClient: jest.Mock;
  updateCalendarEvent: jest.Mock;
};

type BulkSyncShift = Shift & {
  lessonRange: ShiftLessonRange | null;
  workplace: Workplace;
};

function createBulkSyncShift(id: string): BulkSyncShift {
  const createdAt = new Date("2026-03-01T00:00:00.000Z");

  return {
    id,
    workplaceId: "workplace-1",
    date: new Date("2026-03-10T00:00:00.000Z"),
    startTime: new Date("1970-01-01T09:00:00.000Z"),
    endTime: new Date("1970-01-01T18:00:00.000Z"),
    breakMinutes: 0,
    isConfirmed: false,
    shiftType: "NORMAL",
    comment: null,
    googleEventId: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    createdAt,
    lessonRange: null,
    workplace: {
      id: "workplace-1",
      userId: "user-1",
      name: "勤務先A",
      type: "GENERAL",
      color: "#3366FF",
      closingDayType: "END_OF_MONTH",
      closingDay: null,
      payday: 25,
      createdAt,
    },
  };
}

function createDeferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

describe("shift sync cache revalidation", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    shiftUpdateManyMock.mockResolvedValue({ count: 1 });

    shiftFindFirstMock.mockResolvedValue({
      id: "shift-1",
      workplaceId: "workplace-1",
      googleEventId: "google-event-1",
      workplace: {
        id: "workplace-1",
        userId: "user-1",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
      },
      lessonRange: null,
    } as unknown as Awaited<ReturnType<typeof prisma.shift.findFirst>>);
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      calendarId: "calendar-1",
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    createCalendarEvent.mockResolvedValue("google-event-1");
    deleteCalendarEvent.mockResolvedValue(undefined);
    getVerifiedCalendarClient.mockResolvedValue({});
    updateCalendarEvent.mockResolvedValue(undefined);
    payrollRuleFindManyMock.mockResolvedValue([]);
  });

  it("再試行の同期ステータス更新ごとに専用のシフト tag だけを再検証する", async () => {
    await expect(retryShiftSync("shift-1", "user-1")).resolves.toEqual({
      ok: true,
      googleEventId: "google-event-1",
    });

    expect(shiftUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(shiftUpdateManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "shift-1",
          workplace: {
            userId: "user-1",
          },
        },
      }),
    );
    expect(revalidateShiftSyncTagsMock).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
    });
    expect(revalidateShiftSyncTagsMock).toHaveBeenNthCalledWith(2, {
      userId: "user-1",
    });
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
  });

  it("作成同期の PENDING/SUCCESS ステータス更新で給与 snapshot を再検証しない", async () => {
    await expect(syncShiftAfterCreate("shift-1", "user-1")).resolves.toEqual({
      ok: true,
      googleEventId: "google-event-1",
    });

    expect(revalidateShiftSyncTagsMock).toHaveBeenCalledTimes(2);
    expect(revalidateShiftSyncTagsMock).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
    });
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
  });

  it("更新同期の PENDING/SUCCESS ステータス更新で給与 snapshot を再検証しない", async () => {
    await expect(syncShiftAfterUpdate("shift-1", "user-1")).resolves.toEqual({
      ok: true,
      googleEventId: "google-event-1",
    });

    expect(revalidateShiftSyncTagsMock).toHaveBeenCalledTimes(2);
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
  });

  it("削除同期はローカルの同期ステータスを更新しないため cache 再検証を追加しない", async () => {
    await expect(
      syncShiftDeletion("shift-1", "user-1", "google-event-1"),
    ).resolves.toEqual({ ok: true });

    expect(revalidateShiftSyncTagsMock).not.toHaveBeenCalled();
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
  });

  it("勤務先削除後のイベント同期は任意件数を最大3件ずつ処理し、失敗を要約する", async () => {
    const shifts = [
      { id: "shift-1", googleEventId: "google-event-1" },
      { id: "shift-2", googleEventId: "google-event-2" },
      { id: "shift-3", googleEventId: "google-event-3" },
      { id: "shift-4", googleEventId: "google-event-4" },
      { id: "shift-5", googleEventId: "google-event-5" },
      { id: "shift-6", googleEventId: "google-event-6" },
      { id: "shift-7", googleEventId: "google-event-7" },
    ];
    const syncErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const releaseDeletes: Array<() => void> = [];
    let activeDeletes = 0;
    let maximumActiveDeletes = 0;
    deleteCalendarEvent.mockImplementation(
      (googleEventId: string) =>
        new Promise<void>((resolve, reject) => {
          activeDeletes += 1;
          maximumActiveDeletes = Math.max(maximumActiveDeletes, activeDeletes);
          releaseDeletes.push(() => {
            activeDeletes -= 1;
            if (googleEventId === "google-event-4") {
              reject(
                Object.assign(new Error("invalid request"), { status: 400 }),
              );
              return;
            }
            resolve();
          });
        }),
    );

    const summary = syncShiftDeletionsAfterWorkplaceDeletion(shifts, "user-1");

    await waitFor(() => {
      expect(deleteCalendarEvent).toHaveBeenCalledTimes(3);
    });
    expect(maximumActiveDeletes).toBe(3);

    for (let completedCount = 0; completedCount < 7; completedCount += 1) {
      await waitFor(() => {
        expect(releaseDeletes.length).toBeGreaterThan(0);
      });
      releaseDeletes.shift()?.();
    }

    await expect(summary).resolves.toEqual({ total: 7, failed: 1 });
    expect(deleteCalendarEvent).toHaveBeenCalledTimes(7);
    expect(userFindUniqueMock).toHaveBeenCalledTimes(1);
    expect(maximumActiveDeletes).toBeLessThanOrEqual(3);
    expect(syncErrorSpy).not.toHaveBeenCalled();
    syncErrorSpy.mockRestore();
  });

  it("勤務先削除同期・複数 helper・一括作成で Google Calendar 操作の共有上限3件を維持する", async () => {
    const deletionTargetsByCall = [
      ["deleted-1", "deleted-2", "deleted-3"],
      ["deleted-4", "deleted-5", "deleted-6"],
    ].map((ids) => ids.map((id) => ({ id, googleEventId: `event-${id}` })));
    const createdShiftId = "created-1";
    shiftFindManyMock.mockResolvedValue([createBulkSyncShift(createdShiftId)]);

    let activeOperations = 0;
    let maximumActiveOperations = 0;
    const releaseDeletions: Array<() => void> = [];
    const releaseCreates: Array<() => void> = [];
    const recordOperation = (releaseQueue: Array<() => void>, result: string) =>
      new Promise<string>((resolve) => {
        activeOperations += 1;
        maximumActiveOperations = Math.max(
          maximumActiveOperations,
          activeOperations,
        );
        releaseQueue.push(() => {
          activeOperations -= 1;
          resolve(result);
        });
      });
    deleteCalendarEvent.mockImplementation(() =>
      recordOperation(releaseDeletions, "deleted"),
    );
    createCalendarEvent.mockImplementation(() =>
      recordOperation(releaseCreates, "created-event-1"),
    );

    const workplaceDeletionSyncs = deletionTargetsByCall.map((targets) =>
      syncShiftDeletionsAfterWorkplaceDeletion(targets, "user-1"),
    );
    const bulkCreateSync = syncShiftsAfterBulkCreate(
      [createdShiftId],
      "user-1",
    );

    await waitFor(() => {
      expect(deleteCalendarEvent).toHaveBeenCalledTimes(3);
    });
    expect(createCalendarEvent).not.toHaveBeenCalled();
    expect(maximumActiveOperations).toBe(3);

    for (let completedCount = 0; completedCount < 6; completedCount += 1) {
      await waitFor(() => {
        expect(releaseDeletions.length).toBeGreaterThan(0);
      });
      releaseDeletions.shift()?.();
    }

    await waitFor(() => {
      expect(createCalendarEvent).toHaveBeenCalledTimes(1);
    });
    releaseCreates.shift()?.();

    await expect(
      Promise.all([...workplaceDeletionSyncs, bulkCreateSync]),
    ).resolves.toHaveLength(3);
    expect(deleteCalendarEvent).toHaveBeenCalledTimes(6);
    expect(maximumActiveOperations).toBeLessThanOrEqual(3);
  });

  it("勤務先削除同期は共有キュー容量超過を failed として要約し unhandled rejection を出さない", async () => {
    shiftFindManyMock.mockResolvedValue([createBulkSyncShift("initial-1")]);
    const initialVerifications = Array.from({ length: 3 }, () =>
      createDeferred<Record<string, never>>(),
    );
    const threeVerificationsStarted = createDeferred<void>();
    let verificationStarts = 0;
    getVerifiedCalendarClient.mockImplementation(() => {
      const verification = initialVerifications[verificationStarts];
      verificationStarts += 1;
      if (verificationStarts === 3) {
        threeVerificationsStarted.resolve();
      }
      return verification ? verification.promise : Promise.resolve({});
    });
    const unhandledRejections: unknown[] = [];
    const recordUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", recordUnhandledRejection);

    try {
      const initialBulkSyncs = ["initial-1", "initial-2", "initial-3"].map(
        (shiftId) => syncShiftsAfterBulkCreate([shiftId], "user-1"),
      );
      await threeVerificationsStarted.promise;
      const workplaceDeletionSyncs = Array.from(
        { length: 34 },
        (_, batchIndex) =>
          syncShiftDeletionsAfterWorkplaceDeletion(
            Array.from({ length: 3 }, (_, shiftIndex) => ({
              id: `deleted-${batchIndex}-${shiftIndex}`,
              googleEventId: `event-${batchIndex}-${shiftIndex}`,
            })),
            "user-1",
          ),
      );

      await waitFor(() => {
        expect(userFindUniqueMock).toHaveBeenCalledTimes(37);
      });
      for (const verification of initialVerifications) {
        verification.resolve({});
      }

      const deletionSummaries = await Promise.all(workplaceDeletionSyncs);
      await expect(Promise.all(initialBulkSyncs)).resolves.toHaveLength(3);
      expect(deletionSummaries.some((summary) => summary.failed > 0)).toBe(
        true,
      );
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", recordUnhandledRejection);
    }
  });

  it("作成同期で SUCCESS 更新に失敗した新規イベントを削除し、補償失敗は安全なログに限定する", async () => {
    shiftUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    createCalendarEvent.mockResolvedValue("created-event-1");
    deleteCalendarEvent.mockRejectedValue(
      Object.assign(new Error("upstream-token"), {
        status: 400,
        response: { data: { googleEventId: "created-event-1" } },
      }),
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    await expect(syncShiftAfterCreate("shift-1", "user-1")).resolves.toEqual({
      ok: false,
      errorMessage: "同期対象のシフトが見つかりません",
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      "created-event-1",
      "shift-1",
      expect.objectContaining({ id: "user-1" }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "Google Calendar orphaned create compensation failed",
      { action: "create" },
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("user-1");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("shift-1");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("created-event-1");
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("upstream-token");
    warnSpy.mockRestore();
  });

  it("一括作成で SUCCESS 更新に失敗した新規イベントを削除する", async () => {
    shiftFindManyMock.mockResolvedValue([createBulkSyncShift("shift-1")]);
    shiftUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    createCalendarEvent.mockResolvedValue("created-event-1");

    await expect(
      syncShiftsAfterBulkCreate(["shift-1"], "user-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        shiftId: "shift-1",
        ok: false,
        errorMessage: "同期対象のシフトが見つかりません",
      }),
    ]);

    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      "created-event-1",
      "shift-1",
      expect.objectContaining({ id: "user-1" }),
    );
  });

  it("既存イベントの更新で SUCCESS 更新に失敗してもイベント削除による補償をしない", async () => {
    shiftUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(syncShiftAfterUpdate("shift-1", "user-1")).resolves.toEqual({
      ok: false,
      errorMessage: "同期対象のシフトが見つかりません",
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    expect(updateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("所有していない shiftId では同期状態を書き換えない", async () => {
    shiftFindFirstMock.mockResolvedValue(null);

    await expect(retryShiftSync("shift-2", "user-1")).resolves.toEqual({
      ok: false,
      errorMessage: "同期対象のシフトまたはユーザーが見つかりません",
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    expect(shiftUpdateManyMock).not.toHaveBeenCalled();
    expect(revalidateShiftSyncTagsMock).not.toHaveBeenCalled();
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
  });

  it("上流エラーの token/config を同期結果やログに含めない", async () => {
    const error = Object.assign(new Error("raw-token"), {
      response: {
        status: 400,
        config: {
          headers: {
            Authorization: "Bearer raw-token",
          },
        },
      },
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const infoSpy = jest.spyOn(console, "info").mockImplementation();
    updateCalendarEvent.mockRejectedValue(error);

    await expect(retryShiftSync("shift-1", "user-1")).resolves.toEqual({
      ok: false,
      errorMessage: "Google Calendar との同期に失敗しました",
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "Google Calendar shift sync failed",
      expect.objectContaining({
        action: "retry",
        userId: "user-1",
        shiftId: "shift-1",
        error: "Google Calendar との同期に失敗しました",
        errorCode: null,
      }),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("raw-token");
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("raw-token");
  });

  it("shares the maximum of three Google Calendar creates across simultaneous bulk sync calls", async () => {
    const shiftIdsByCall = [
      ["shift-1", "shift-2", "shift-3"],
      ["shift-4", "shift-5", "shift-6"],
    ];
    shiftFindManyMock.mockResolvedValue(
      shiftIdsByCall.flat().map(createBulkSyncShift),
    );

    let activeCreates = 0;
    let maximumActiveCreates = 0;
    const releaseCreates: Array<() => void> = [];
    createCalendarEvent.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          activeCreates += 1;
          maximumActiveCreates = Math.max(maximumActiveCreates, activeCreates);
          releaseCreates.push(() => {
            activeCreates -= 1;
            resolve(`google-event-${releaseCreates.length}`);
          });
        }),
    );

    const syncCalls = shiftIdsByCall.map((shiftIds) =>
      syncShiftsAfterBulkCreate(shiftIds, "user-1"),
    );

    await waitFor(() => {
      expect(createCalendarEvent).toHaveBeenCalledTimes(3);
    });
    expect(maximumActiveCreates).toBe(3);
    expect(getVerifiedCalendarClient).toHaveBeenCalledTimes(2);

    for (let releasedCount = 0; releasedCount < 6; releasedCount += 1) {
      await waitFor(() => {
        expect(releaseCreates.length).toBeGreaterThan(0);
      });
      releaseCreates.shift()?.();
    }

    await expect(Promise.all(syncCalls)).resolves.toHaveLength(2);
    expect(createCalendarEvent).toHaveBeenCalledTimes(6);
    expect(maximumActiveCreates).toBeLessThanOrEqual(3);
  });

  it("releases a shared permit after an unretryable create failure", async () => {
    const shiftIds = ["shift-1", "shift-2", "shift-3", "shift-4"];
    shiftFindManyMock.mockResolvedValue(shiftIds.map(createBulkSyncShift));

    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const releaseCreates: Array<() => void> = [];
    const unretryableError = Object.assign(new Error("invalid request"), {
      status: 400,
    });
    createCalendarEvent
      .mockRejectedValueOnce(unretryableError)
      .mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            releaseCreates.push(() => resolve("google-event"));
          }),
      );

    const syncCall = syncShiftsAfterBulkCreate(shiftIds, "user-1");
    await waitFor(() => {
      expect(createCalendarEvent).toHaveBeenCalledTimes(4);
    });

    for (let releasedCount = 0; releasedCount < 3; releasedCount += 1) {
      await waitFor(() => {
        expect(releaseCreates.length).toBeGreaterThan(0);
      });
      releaseCreates.shift()?.();
    }

    const results = await syncCall;
    expect(results).toHaveLength(4);
    expect(results[0]?.ok).toBe(false);
    errorSpy.mockRestore();
  });

  it("includes delayed calendar preflight in the shared limit of three", async () => {
    const shiftIds = ["shift-1", "shift-2", "shift-3", "shift-4"];
    shiftFindManyMock.mockResolvedValue(shiftIds.map(createBulkSyncShift));

    let activeVerifications = 0;
    let maximumActiveVerifications = 0;
    const verifications: Array<{
      deferred: ReturnType<typeof createDeferred<Record<string, never>>>;
      released: boolean;
    }> = [];
    getVerifiedCalendarClient.mockImplementation(() => {
      activeVerifications += 1;
      maximumActiveVerifications = Math.max(
        maximumActiveVerifications,
        activeVerifications,
      );
      const deferred = createDeferred<Record<string, never>>();
      verifications.push({ deferred, released: false });
      return deferred.promise.finally(() => {
        activeVerifications -= 1;
      });
    });

    const syncCalls = shiftIds.map((shiftId) =>
      syncShiftsAfterBulkCreate([shiftId], "user-1"),
    );

    await waitFor(() => {
      expect(getVerifiedCalendarClient).toHaveBeenCalledTimes(3);
    });
    expect(maximumActiveVerifications).toBe(3);

    const firstVerification = verifications[0];
    if (!firstVerification) {
      throw new Error("Expected the first calendar verification");
    }
    firstVerification.released = true;
    firstVerification.deferred.resolve({});

    await waitFor(() => {
      expect(getVerifiedCalendarClient).toHaveBeenCalledTimes(4);
    });

    for (const verification of verifications) {
      if (!verification.released) {
        verification.released = true;
        verification.deferred.resolve({});
      }
    }

    await expect(Promise.all(syncCalls)).resolves.toHaveLength(4);
    expect(maximumActiveVerifications).toBeLessThanOrEqual(3);
  });

  it("keeps all three shared permits while Retry-After delays a create", async () => {
    jest.useFakeTimers();
    const retriesScheduled = createDeferred<void>();
    let retryScheduleCount = 0;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {
      retryScheduleCount += 1;
      if (retryScheduleCount === 3) {
        retriesScheduled.resolve();
      }
    });
    const shiftIds = ["shift-1", "shift-2", "shift-3", "shift-4"];
    shiftFindManyMock.mockResolvedValue(shiftIds.map(createBulkSyncShift));

    const fourthCreateStarted = createDeferred<void>();
    let initialFailuresRemaining = 3;
    let fourthCreateHasStarted = false;
    createCalendarEvent.mockImplementation((shift: BulkSyncShift) => {
      if (initialFailuresRemaining > 0) {
        initialFailuresRemaining -= 1;
        return Promise.reject(
          Object.assign(new Error("rate limited"), {
            status: 429,
            response: { headers: { "retry-after": "30" } },
          }),
        );
      }

      if (shift.id === "shift-4") {
        fourthCreateHasStarted = true;
        fourthCreateStarted.resolve();
      }
      return Promise.resolve(`google-event-${shift.id}`);
    });

    try {
      const syncCalls = shiftIds.map((shiftId) =>
        syncShiftsAfterBulkCreate([shiftId], "user-1"),
      );
      const allSyncCalls = Promise.all(syncCalls).then(
        (results) => ({ ok: true as const, results }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      await retriesScheduled.promise;
      expect(createCalendarEvent).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(29_999);
      expect(createCalendarEvent).toHaveBeenCalledTimes(3);
      expect(fourthCreateHasStarted).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      await fourthCreateStarted.promise;
      expect(createCalendarEvent).toHaveBeenCalledTimes(7);

      const completedSyncCalls = await allSyncCalls;
      if (!completedSyncCalls.ok) {
        throw completedSyncCalls.error;
      }
      expect(completedSyncCalls.results).toHaveLength(4);
    } finally {
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it("returns a failed sync result and records FAILED status when the shared queue is full", async () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation();
    const shiftIds = Array.from(
      { length: 104 },
      (_, index) => `shift-${index + 1}`,
    );
    for (const shiftId of shiftIds) {
      shiftFindManyMock.mockResolvedValueOnce([createBulkSyncShift(shiftId)]);
    }
    const initialVerifications = Array.from({ length: 3 }, () =>
      createDeferred<Record<string, never>>(),
    );
    const threeVerificationsStarted = createDeferred<void>();
    let verificationStarts = 0;
    getVerifiedCalendarClient.mockImplementation(() => {
      const initialVerification = initialVerifications[verificationStarts];
      verificationStarts += 1;

      if (verificationStarts === 3) {
        threeVerificationsStarted.resolve();
      }

      return initialVerification
        ? initialVerification.promise
        : Promise.resolve({});
    });

    const unhandledRejections: unknown[] = [];
    const recordUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", recordUnhandledRejection);

    try {
      const syncCalls = shiftIds.map((shiftId) =>
        syncShiftsAfterBulkCreate([shiftId], "user-1"),
      );
      const allSyncCalls = Promise.all(syncCalls).then(
        (results) => ({ ok: true as const, results }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      await threeVerificationsStarted.promise;
      expect(getVerifiedCalendarClient).toHaveBeenCalledTimes(3);
      expect(createCalendarEvent).not.toHaveBeenCalled();

      await expect(syncCalls[103]).resolves.toEqual([
        expect.objectContaining({
          shiftId: "shift-104",
          ok: false,
          errorMessage:
            "Google Calendar 同期の待機上限に達しました。時間を置いて再試行してください",
          errorCode: null,
          requiresCalendarSetup: false,
          requiresSignOut: false,
        }),
      ]);
      expect(shiftUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ["shift-104"] },
          },
          data: expect.objectContaining({ googleSyncStatus: "FAILED" }),
        }),
      );
      expect(revalidateShiftSyncTagsMock).toHaveBeenCalledWith({
        userId: "user-1",
      });
      expect(unhandledRejections).toEqual([]);

      for (const initialVerification of initialVerifications) {
        initialVerification.resolve({});
      }
      const completedSyncCalls = await allSyncCalls;
      if (!completedSyncCalls.ok) {
        throw completedSyncCalls.error;
      }
      expect(completedSyncCalls.results).toHaveLength(104);
    } finally {
      process.off("unhandledRejection", recordUnhandledRejection);
      infoSpy.mockRestore();
    }
  });
});

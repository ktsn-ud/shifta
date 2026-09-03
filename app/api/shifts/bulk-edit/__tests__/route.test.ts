import { after } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { consumeBulkShiftEditRateLimit } from "@/lib/api/bulk-shift-rate-limit";
import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
import { syncShiftsAfterBulkUpdate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";
import { getMonthShifts } from "@/lib/shifts/month-shifts";

jest.mock("next/server", () => ({
  after: jest.fn(),
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: HeadersInit },
    ) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));
jest.mock("@/lib/api/bulk-shift-rate-limit", () => ({
  consumeBulkShiftEditRateLimit: jest.fn(),
}));
jest.mock("@/lib/cache/revalidate", () => ({
  revalidateShiftDomainTags: jest.fn(),
}));
jest.mock("@/lib/google-calendar/syncStatus", () => ({
  syncShiftsAfterBulkUpdate: jest.fn(),
}));
jest.mock("@/lib/shifts/month-shifts", () => ({
  getMonthShifts: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    shift: { findMany: jest.fn() },
    timetableSet: { findMany: jest.fn() },
    timetable: { findMany: jest.fn() },
  },
}));

const afterMock = jest.mocked(after);
const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const consumeBulkShiftEditRateLimitMock = jest.mocked(
  consumeBulkShiftEditRateLimit,
);
const revalidateShiftDomainTagsMock = jest.mocked(revalidateShiftDomainTags);
const syncShiftsAfterBulkUpdateMock = jest.mocked(syncShiftsAfterBulkUpdate);
const getMonthShiftsMock = jest.mocked(getMonthShifts);
const transactionMock = jest.mocked(prisma.$transaction);
const queryRawMock = jest.mocked(prisma.$queryRaw);
const executeRawMock = jest.mocked(prisma.$executeRaw);
const shiftFindManyMock = jest.mocked(prisma.shift.findMany);
const timetableSetFindManyMock = jest.mocked(prisma.timetableSet.findMany);
const timetableFindManyMock = jest.mocked(prisma.timetable.findMany);

function createRequest(body: unknown, origin = "http://localhost"): Request {
  return {
    method: "PATCH",
    url: "http://localhost/api/shifts/bulk",
    headers: {
      get: (name: string) => (name.toLowerCase() === "origin" ? origin : null),
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

function normalEdit(id: string) {
  return {
    id,
    shiftType: "NORMAL",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    transportationAllowance: 480,
    comment: "変更後",
  };
}

function lessonEdit(id: string) {
  return {
    id,
    shiftType: "LESSON" as const,
    lessonRange: {
      timetableSetId: "timetable-set-1",
      startPeriod: 1,
      endPeriod: 2,
    },
    transportationAllowance: 480,
    comment: "授業シフトを変更",
  };
}

function existingShift(id: string, userId = "user-1") {
  return {
    id,
    workplaceId: "workplace-1",
    date: new Date("2026-03-18T00:00:00.000Z"),
    shiftType: "NORMAL",
    workplace: {
      id: "workplace-1",
      userId,
      type: "GENERAL",
      closingDayType: "END_OF_MONTH",
      closingDay: null,
      payday: 25,
    },
  };
}

function existingLessonShift(id: string) {
  return {
    ...existingShift(id),
    shiftType: "LESSON" as const,
    workplace: {
      ...existingShift(id).workplace,
      type: "CRAM_SCHOOL" as const,
    },
  };
}

function mockSuccessfulWrites(
  updatedShifts: Array<{ id: string; date: Date }>,
  lessonRangeCount = 0,
) {
  queryRawMock.mockResolvedValue(updatedShifts as never);
  executeRawMock.mockResolvedValue(lessonRangeCount as never);
}

function returnedShifts(ids: string[], date = "2026-03-18") {
  return ids.map((id) => ({
    id,
    date: new Date(`${date}T00:00:00.000Z`),
  }));
}

function getSqlText(sql: unknown): string {
  if (Array.isArray(sql)) {
    return sql.join("");
  }

  if (!sql || typeof sql !== "object" || !("strings" in sql)) {
    return "";
  }
  const strings = (sql as { strings?: unknown }).strings;
  return Array.isArray(strings) ? strings.join("") : "";
}

function getSqlValues(sql: unknown): unknown[] {
  if (!sql || typeof sql !== "object" || !("values" in sql)) {
    return [];
  }

  const values = (sql as { values?: unknown }).values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.flatMap((value) => {
    const nestedValues = getSqlValues(value);
    return nestedValues.length > 0 ? nestedValues : [value];
  });
}

async function loadPatch() {
  let routeModule: typeof import("@/app/api/shifts/bulk/route");
  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/bulk/route");
  });
  return routeModule!.PATCH;
}

describe("PATCH /api/shifts/bulk public route", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    consumeBulkShiftEditRateLimitMock.mockReturnValue({ allowed: true });
    transactionMock.mockImplementation(async (callback) =>
      callback({
        $queryRaw: queryRawMock,
        $executeRaw: executeRawMock,
      } as never),
    );
    timetableSetFindManyMock.mockResolvedValue([
      { id: "timetable-set-1", workplaceId: "workplace-1" },
    ] as never);
    timetableFindManyMock.mockResolvedValue([
      {
        timetableSetId: "timetable-set-1",
        period: 1,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T09:50:00.000Z"),
      },
      {
        timetableSetId: "timetable-set-1",
        period: 2,
        startTime: new Date("1970-01-01T10:00:00.000Z"),
        endTime: new Date("1970-01-01T10:50:00.000Z"),
      },
    ] as never);
    syncShiftsAfterBulkUpdateMock.mockResolvedValue([]);
  });

  it("rejects cross-origin and malformed requests before looking up shifts", async () => {
    const PATCH = await loadPatch();

    const csrfResponse = await PATCH(
      createRequest(
        { shifts: [normalEdit("shift-1")] },
        "https://evil.example",
      ),
    );
    expect(csrfResponse.status).toBe(403);
    expect(requireCurrentUserMock).not.toHaveBeenCalled();
    expect(consumeBulkShiftEditRateLimitMock).not.toHaveBeenCalled();
    expect(shiftFindManyMock).not.toHaveBeenCalled();

    const malformedResponse = await PATCH(
      createRequest({ shifts: [{ id: "shift-1", shiftType: "NORMAL" }] }),
    );
    expect(malformedResponse.status).toBe(400);
    expect(shiftFindManyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the authentication response without looking up or updating shifts", async () => {
    const PATCH = await loadPatch();
    const unauthenticatedResponse = {
      status: 401,
      json: async () => ({ error: "ログインが必要です" }),
    } as Response;
    requireCurrentUserMock.mockResolvedValue({
      response: unauthenticatedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const response = await PATCH(
      createRequest({ shifts: [normalEdit("shift-1")] }),
    );

    expect(response).toBe(unauthenticatedResponse);
    expect(shiftFindManyMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs, missing shifts, other users' shifts, and type changes without a transaction", async () => {
    const PATCH = await loadPatch();

    await expect(
      PATCH(
        createRequest({
          shifts: [normalEdit("shift-1"), normalEdit("shift-1")],
        }),
      ),
    ).resolves.toMatchObject({ status: 400 });
    expect(shiftFindManyMock).not.toHaveBeenCalled();

    shiftFindManyMock.mockResolvedValueOnce([] as never);
    await expect(
      PATCH(createRequest({ shifts: [normalEdit("missing")] })),
    ).resolves.toMatchObject({ status: 404 });

    shiftFindManyMock.mockResolvedValueOnce([
      existingShift("shift-1", "another-user"),
    ] as never);
    await expect(
      PATCH(createRequest({ shifts: [normalEdit("shift-1")] })),
    ).resolves.toMatchObject({ status: 403 });

    shiftFindManyMock.mockResolvedValueOnce([
      { ...existingShift("shift-1"), shiftType: "LESSON" },
    ] as never);
    const mismatch = await PATCH(
      createRequest({ shifts: [normalEdit("shift-1")] }),
    );
    expect(mismatch.status).toBe(400);
    await expect(mismatch.json()).resolves.toMatchObject({
      error: "シフト種別は変更できません",
      details: { shiftId: "shift-1" },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 31 edits and rejects 32 before querying shifts", async () => {
    const PATCH = await loadPatch();
    const acceptedEdits = Array.from({ length: 31 }, (_, index) =>
      normalEdit(`shift-${index + 1}`),
    );
    const existing = acceptedEdits.map((edit) => existingShift(edit.id));
    shiftFindManyMock.mockResolvedValueOnce(existing as never);
    mockSuccessfulWrites(returnedShifts(acceptedEdits.map((edit) => edit.id)));
    getMonthShiftsMock.mockResolvedValue([]);

    const accepted = await PATCH(createRequest({ shifts: acceptedEdits }));
    expect(accepted.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);

    shiftFindManyMock.mockClear();
    const rejected = await PATCH(
      createRequest({
        shifts: Array.from({ length: 32 }, (_, index) =>
          normalEdit(`overflow-${index + 1}`),
        ),
      }),
    );
    expect(rejected.status).toBe(400);
    expect(shiftFindManyMock).not.toHaveBeenCalled();
  });

  it.each([15, 31])(
    "updates %i NORMAL shifts with one parameterized write regardless of batch size",
    async (count) => {
      const PATCH = await loadPatch();
      const edits = Array.from({ length: count }, (_, index) =>
        normalEdit(`shift-${index + 1}`),
      );
      shiftFindManyMock.mockResolvedValueOnce(
        edits.map((edit) => existingShift(edit.id)) as never,
      );
      mockSuccessfulWrites(returnedShifts(edits.map((edit) => edit.id)));
      getMonthShiftsMock.mockResolvedValue([]);

      const response = await PATCH(createRequest({ shifts: edits }));

      expect(response.status).toBe(200);
      expect(queryRawMock).toHaveBeenCalledTimes(1);
      expect(executeRawMock).not.toHaveBeenCalled();

      const query = queryRawMock.mock.calls[0];
      if (!query) {
        throw new Error("Expected the bulk shift update query");
      }
      expect(getSqlText(query[0])).toContain('UPDATE "Shift"');
      expect(getSqlText(query[0])).not.toContain("shift-1");
      expect(getSqlValues(query[1])).toEqual(
        expect.arrayContaining(["shift-1", "workplace-1", "09:00:00"]),
      );
    },
  );

  it("resolves many LESSON edits with two reads and at most two transaction writes", async () => {
    const PATCH = await loadPatch();
    const lessonEdits = Array.from({ length: 14 }, (_, index) =>
      lessonEdit(`lesson-${index + 1}`),
    );
    const edits = [...lessonEdits, normalEdit("normal-1")];
    shiftFindManyMock.mockResolvedValueOnce([
      ...lessonEdits.map((edit) => existingLessonShift(edit.id)),
      existingShift("normal-1"),
    ] as never);
    mockSuccessfulWrites(returnedShifts(edits.map((edit) => edit.id)), 14);
    getMonthShiftsMock.mockResolvedValue([]);

    const response = await PATCH(createRequest({ shifts: edits }));

    expect(response.status).toBe(200);
    expect(timetableSetFindManyMock).toHaveBeenCalledTimes(1);
    expect(timetableFindManyMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(
      queryRawMock.mock.calls.length + executeRawMock.mock.calls.length,
    ).toBe(2);
  });

  it("writes mixed LESSON edits with one shift update and one lesson-range upsert", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingLessonShift("lesson-1"),
      existingLessonShift("lesson-2"),
    ] as never);
    mockSuccessfulWrites(returnedShifts(["lesson-1", "lesson-2"]), 2);
    getMonthShiftsMock.mockResolvedValue([]);

    const response = await PATCH(
      createRequest({
        shifts: [lessonEdit("lesson-1"), lessonEdit("lesson-2")],
      }),
    );

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it("does not schedule side effects when the Shift update count is incomplete", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingShift("shift-1"),
      existingShift("shift-2"),
    ] as never);
    mockSuccessfulWrites(returnedShifts(["shift-1"]));

    const response = await PATCH(
      createRequest({
        shifts: [normalEdit("shift-1"), normalEdit("shift-2")],
      }),
    );

    expect(response.status).toBe(500);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
    expect(syncShiftsAfterBulkUpdateMock).not.toHaveBeenCalled();
  });

  it("does not schedule side effects when the LESSON upsert count is incomplete", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingLessonShift("lesson-1"),
      existingLessonShift("lesson-2"),
    ] as never);
    mockSuccessfulWrites(returnedShifts(["lesson-1", "lesson-2"]), 1);

    const response = await PATCH(
      createRequest({
        shifts: [lessonEdit("lesson-1"), lessonEdit("lesson-2")],
      }),
    );

    expect(response.status).toBe(500);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
    expect(syncShiftsAfterBulkUpdateMock).not.toHaveBeenCalled();
  });

  it("returns the first validation error in request order when multiple builds fail", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingShift("shift-second"),
      existingShift("shift-first"),
    ] as never);

    const response = await PATCH(
      createRequest({
        shifts: [
          { ...normalEdit("shift-first"), endTime: "10:00" },
          { ...normalEdit("shift-second"), endTime: "10:00" },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: { shiftId: "shift-first" },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 500 without transaction, cache revalidation, or sync when a build fails unexpectedly", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingLessonShift("lesson-1"),
    ] as never);
    timetableSetFindManyMock.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await PATCH(
      createRequest({ shifts: [lessonEdit("lesson-1")] }),
    );

    expect(response.status).toBe(500);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
    expect(syncShiftsAfterBulkUpdateMock).not.toHaveBeenCalled();
  });

  it("enforces five PATCH attempts per user, returns Retry-After, and keeps user buckets isolated", async () => {
    const PATCH = await loadPatch();
    const attemptsByUser = new Map<string, number>();
    let currentUserId = "user-1";
    requireCurrentUserMock.mockImplementation(
      async () =>
        ({
          user: { id: currentUserId },
        }) as Awaited<ReturnType<typeof requireCurrentUser>>,
    );
    consumeBulkShiftEditRateLimitMock.mockImplementation((userId) => {
      const attempts = (attemptsByUser.get(userId) ?? 0) + 1;
      attemptsByUser.set(userId, attempts);
      return attempts <= 5
        ? { allowed: true }
        : { allowed: false, retryAfterSeconds: 60 };
    });
    shiftFindManyMock.mockResolvedValue([] as never);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        PATCH(createRequest({ shifts: [normalEdit(`missing-${attempt}`)] })),
      ).resolves.toMatchObject({ status: 404 });
    }

    const limited = await PATCH(
      createRequest({ shifts: [normalEdit("limited")] }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");

    currentUserId = "user-2";
    await expect(
      PATCH(createRequest({ shifts: [normalEdit("other-user")] })),
    ).resolves.toMatchObject({ status: 404 });
    expect(consumeBulkShiftEditRateLimitMock).toHaveBeenLastCalledWith(
      "user-2",
    );
  });

  it("loads timetable rows only for LESSON sets confirmed to belong to the workplace", async () => {
    const PATCH = await loadPatch();
    const foreignLessonEdit = {
      ...lessonEdit("lesson-foreign"),
      lessonRange: {
        timetableSetId: "foreign-set",
        startPeriod: 1,
        endPeriod: 2,
      },
    };
    shiftFindManyMock.mockResolvedValueOnce([
      existingLessonShift("lesson-owned"),
      existingLessonShift("lesson-foreign"),
    ] as never);

    const response = await PATCH(
      createRequest({
        shifts: [lessonEdit("lesson-owned"), foreignLessonEdit],
      }),
    );

    expect(response.status).toBe(400);
    expect(timetableSetFindManyMock).toHaveBeenCalledTimes(1);
    expect(timetableFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          timetableSetId: { in: ["timetable-set-1"] },
        },
      }),
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does not schedule sync or cache revalidation when an update transaction fails", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingShift("shift-1"),
      existingShift("shift-2"),
    ] as never);
    transactionMock.mockRejectedValueOnce(new Error("database failure"));

    const response = await PATCH(
      createRequest({
        shifts: [normalEdit("shift-1"), normalEdit("shift-2")],
      }),
    );

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
    expect(syncShiftsAfterBulkUpdateMock).not.toHaveBeenCalled();
  });

  it("uses the dates returned by the committed bulk update for cache revalidation and refetch bounds", async () => {
    const PATCH = await loadPatch();
    shiftFindManyMock.mockResolvedValueOnce([
      existingShift("shift-1"),
    ] as never);
    mockSuccessfulWrites(returnedShifts(["shift-1"], "2026-04-18"));
    getMonthShiftsMock.mockResolvedValue([]);

    const response = await PATCH(
      createRequest({ shifts: [normalEdit("shift-1")] }),
    );

    expect(response.status).toBe(200);
    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMonthKeys: ["2026-05"] }),
    );
    expect(getMonthShiftsMock).toHaveBeenCalledWith({
      userId: "user-1",
      startDate: "2026-04-18",
      endDate: "2026-04-18",
      includeEstimate: true,
    });
  });

  it("returns updated DTOs with pending sync, revalidates affected caches, and schedules bulk update sync after commit", async () => {
    const PATCH = await loadPatch();
    const updatedDto = {
      id: "shift-1",
      workplaceId: "workplace-1",
      date: "2026-03-18T00:00:00.000Z",
      startTime: "1970-01-01T09:00:00.000Z",
      endTime: "1970-01-01T18:00:00.000Z",
      breakMinutes: 60,
      transportationAllowance: 480,
      shiftType: "NORMAL",
      comment: "変更後",
      googleSyncStatus: "PENDING",
      googleSyncError: null,
      googleSyncedAt: null,
      workplace: {
        id: "workplace-1",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
      },
      lessonRange: null,
    };
    shiftFindManyMock.mockResolvedValueOnce([
      existingShift("shift-1"),
    ] as never);
    mockSuccessfulWrites(returnedShifts(["shift-1"]));
    getMonthShiftsMock.mockResolvedValue([updatedDto] as never);

    const response = await PATCH(
      createRequest({ shifts: [normalEdit("shift-1")] }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [updatedDto],
      summary: { total: 1, failed: 0 },
      syncStatus: "pending",
      sync: { status: "pending" },
    });
    expect(revalidateShiftDomainTagsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workplaceIds: ["workplace-1"],
        paymentMonthKeys: ["2026-04"],
      }),
    );
    expect(afterMock).toHaveBeenCalledTimes(1);

    const scheduled = afterMock.mock.calls[0]?.[0];
    if (typeof scheduled !== "function") {
      throw new Error("Expected a scheduled sync callback");
    }
    await scheduled();
    expect(syncShiftsAfterBulkUpdateMock).toHaveBeenCalledWith(
      ["shift-1"],
      "user-1",
    );
  });
});

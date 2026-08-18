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
    shift: { findMany: jest.fn(), update: jest.fn() },
    shiftLessonRange: { upsert: jest.fn() },
    timetableSet: { findFirst: jest.fn() },
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
const shiftFindManyMock = jest.mocked(prisma.shift.findMany);
const shiftUpdateMock = jest.mocked(prisma.shift.update);
const shiftLessonRangeUpsertMock = jest.mocked(prisma.shiftLessonRange.upsert);
const timetableSetFindFirstMock = jest.mocked(prisma.timetableSet.findFirst);
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
    transactionMock.mockResolvedValue([] as never);
    shiftUpdateMock.mockReturnValue({ operation: "shift-update" } as never);
    shiftLessonRangeUpsertMock.mockReturnValue({
      operation: "lesson-range-upsert",
    } as never);
    timetableSetFindFirstMock.mockResolvedValue({
      id: "timetable-set-1",
    } as never);
    timetableFindManyMock.mockResolvedValue([
      {
        period: 1,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T09:50:00.000Z"),
      },
      {
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
    shiftFindManyMock
      .mockResolvedValueOnce(existing as never)
      .mockResolvedValueOnce([] as never);
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

  it("passes every LESSON update and lesson-range upsert to one array transaction", async () => {
    const PATCH = await loadPatch();
    const firstUpdate = { operation: "first-shift-update" };
    const firstLessonRange = { operation: "first-lesson-range-upsert" };
    const secondUpdate = { operation: "second-shift-update" };
    const secondLessonRange = { operation: "second-lesson-range-upsert" };
    shiftUpdateMock
      .mockReturnValueOnce(firstUpdate as never)
      .mockReturnValueOnce(secondUpdate as never);
    shiftLessonRangeUpsertMock
      .mockReturnValueOnce(firstLessonRange as never)
      .mockReturnValueOnce(secondLessonRange as never);
    shiftFindManyMock
      .mockResolvedValueOnce([
        existingLessonShift("lesson-1"),
        existingLessonShift("lesson-2"),
      ] as never)
      .mockResolvedValueOnce([
        { date: new Date("2026-03-18T00:00:00.000Z") },
        { date: new Date("2026-03-19T00:00:00.000Z") },
      ] as never);
    getMonthShiftsMock.mockResolvedValue([]);

    const response = await PATCH(
      createRequest({
        shifts: [lessonEdit("lesson-1"), lessonEdit("lesson-2")],
      }),
    );

    expect(response.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledWith([
      firstUpdate,
      firstLessonRange,
      secondUpdate,
      secondLessonRange,
    ]);
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
    timetableSetFindFirstMock.mockRejectedValueOnce(
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
    shiftFindManyMock
      .mockResolvedValueOnce([existingShift("shift-1")] as never)
      .mockResolvedValueOnce([
        { date: new Date("2026-03-18T00:00:00.000Z") },
      ] as never);
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

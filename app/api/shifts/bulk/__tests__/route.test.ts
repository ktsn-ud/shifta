import { after } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { consumeBulkShiftCreateRateLimit } from "@/lib/api/bulk-shift-rate-limit";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";

jest.mock("next/server", () => ({
  after: jest.fn(),
  NextResponse: {
    json: (
      body: unknown,
      init?: {
        status?: number;
        headers?: Record<string, string>;
      },
    ) => {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );

      return {
        status: init?.status ?? 200,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
          set: (name: string, value: string) => {
            headers.set(name.toLowerCase(), value);
          },
        },
        json: async () => body,
      };
    },
  },
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/bulk-shift-rate-limit", () => ({
  consumeBulkShiftCreateRateLimit: jest.fn(),
}));

jest.mock("@/lib/api/workplace", () => ({
  requireOwnedWorkplace: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    shift: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    timetableSet: { findMany: jest.fn() },
    timetable: { findMany: jest.fn() },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const consumeBulkShiftCreateRateLimitMock = jest.mocked(
  consumeBulkShiftCreateRateLimit,
);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaShiftCreateManyMock = jest.mocked(prisma.shift.createMany);
const prismaShiftFindManyMock = jest.mocked(prisma.shift.findMany);
const prismaTimetableSetFindManyMock = jest.mocked(
  prisma.timetableSet.findMany,
);
const prismaTimetableFindManyMock = jest.mocked(prisma.timetable.findMany);
const afterMock = jest.mocked(after);

function createRequest(body: unknown, options?: { origin?: string }): Request {
  return {
    method: "POST",
    url: "http://localhost/api/shifts/bulk",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin"
          ? (options?.origin ?? "http://localhost")
          : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

async function loadPost() {
  let routeModule: typeof import("@/app/api/shifts/bulk/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/bulk/route");
  });

  return routeModule!.POST;
}

function createNormalShifts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    shiftType: "NORMAL",
    startTime: "09:00",
    endTime: "18:00",
  }));
}

function createLessonShifts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    shiftType: "LESSON" as const,
    lessonRange: {
      timetableSetId: "timetable-set-1",
      startPeriod: 1,
      endPeriod: 2,
    },
  }));
}

async function expectLimitValidationError(
  response: { status: number; json: () => Promise<unknown> },
  message: string,
) {
  expect(response.status).toBe(400);
  const payload = (await response.json()) as {
    error?: unknown;
    details?: { fieldErrors?: unknown };
  };

  expect(payload.error).toBe("入力値が不正です");
  expect(payload.details?.fieldErrors).toEqual(expect.any(Object));
  expect(JSON.stringify(payload.details?.fieldErrors)).toContain(message);
}

describe("POST /api/shifts/bulk invalid calendar dates", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    consumeBulkShiftCreateRateLimitMock.mockReturnValue({ allowed: true });
  });

  it("rejects an impossible date before workplace lookup or shift creation", async () => {
    const POST = await loadPost();
    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: [
          {
            date: "2026-02-31",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
          },
        ],
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "入力値が不正です" }),
    );
    expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(prismaShiftCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range break before workplace lookup or shift creation", async () => {
    const POST = await loadPost();
    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: [
          {
            date: "2026-03-18",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
            breakMinutes: 241,
          },
        ],
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(400);
    expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(prismaShiftCreateManyMock).not.toHaveBeenCalled();
  });

  it.each([
    ["startPeriod", { startPeriod: 31, endPeriod: 30 }],
    ["endPeriod", { startPeriod: 30, endPeriod: 31 }],
  ])(
    "rejects lessonRange.%s above period 30 before workplace lookup or transaction work",
    async (_field, lessonRange) => {
      const POST = await loadPost();
      const response = await POST(
        createRequest({
          workplaceId: "workplace-1",
          shifts: [
            {
              date: "2026-03-18",
              shiftType: "LESSON",
              lessonRange: {
                timetableSetId: "set-1",
                ...lessonRange,
              },
            },
          ],
        }),
      );
      if (!response) {
        throw new Error("bulk shift route did not return a response");
      }

      await expectLimitValidationError(
        response,
        "コマ番号は30以下の整数で入力してください。",
      );
      expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
      expect(prismaShiftCreateManyMock).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/shifts/bulk batch size", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    consumeBulkShiftCreateRateLimitMock.mockReturnValue({ allowed: true });
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "GENERAL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    prismaTransactionMock.mockImplementation(async (callback) =>
      callback({
        shift: { createMany: prismaShiftCreateManyMock },
        shiftLessonRange: { createMany: jest.fn() },
      } as never),
    );
    prismaShiftFindManyMock.mockResolvedValue([]);
    prismaTimetableSetFindManyMock.mockResolvedValue([
      { id: "timetable-set-1", workplaceId: "workplace-1" },
    ] as never);
    prismaTimetableFindManyMock.mockResolvedValue([
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
  });

  it("accepts 31 shifts and schedules the post-create work", async () => {
    const POST = await loadPost();

    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: createNormalShifts(31),
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      summary: { total: 31, pending: 31 },
    });
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("resolves 31 LESSON shifts with two timetable reads before one bulk transaction", async () => {
    const POST = await loadPost();
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: {
        id: "workplace-1",
        type: "CRAM_SCHOOL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);

    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: createLessonShifts(31),
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(201);
    expect(prismaTimetableSetFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaTimetableFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    expect(prismaShiftCreateManyMock).toHaveBeenCalledTimes(1);
  });

  it("loads timetable rows only for owned LESSON timetable sets", async () => {
    const POST = await loadPost();
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: {
        id: "workplace-1",
        type: "CRAM_SCHOOL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
      },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
    const [ownedLesson, foreignLesson] = createLessonShifts(2);
    if (!ownedLesson || !foreignLesson) {
      throw new Error("Expected two LESSON fixtures");
    }

    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: [
          ownedLesson,
          {
            ...foreignLesson,
            lessonRange: {
              timetableSetId: "foreign-set",
              startPeriod: 1,
              endPeriod: 2,
            },
          },
        ],
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(400);
    expect(prismaTimetableSetFindManyMock).toHaveBeenCalledTimes(1);
    expect(prismaTimetableFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          timetableSetId: { in: ["timetable-set-1"] },
        },
      }),
    );
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("defaults omitted or blank transportation allowance and persists a supplied integer allowance", async () => {
    const POST = await loadPost();
    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: [
          {
            date: "2026-03-01",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
          },
          {
            date: "2026-03-02",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
            transportationAllowance: "",
          },
          {
            date: "2026-03-03",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
            transportationAllowance: 2_147_483_647,
          },
          {
            date: "2026-03-04",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "18:00",
            transportationAllowance: 480,
          },
        ],
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(201);
    expect(prismaShiftCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ transportationAllowance: 0 }),
        expect.objectContaining({ transportationAllowance: 2_147_483_647 }),
        expect.objectContaining({ transportationAllowance: 480 }),
      ]),
    });
  });

  it.each([-1, 100.5, 2_147_483_648])(
    "rejects invalid transportationAllowance=%s before database work",
    async (transportationAllowance) => {
      const POST = await loadPost();
      const response = await POST(
        createRequest({
          workplaceId: "workplace-1",
          shifts: [
            {
              date: "2026-03-01",
              shiftType: "NORMAL",
              startTime: "09:00",
              endTime: "18:00",
              transportationAllowance,
            },
          ],
        }),
      );
      if (!response) {
        throw new Error("bulk shift route did not return a response");
      }

      await expectLimitValidationError(response, "交通費");
      expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it("rejects 32 shifts before database writes or deferred work", async () => {
    const POST = await loadPost();

    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: createNormalShifts(32),
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    await expectLimitValidationError(response, "一括登録は31件までです。");
    expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(prismaShiftCreateManyMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/shifts/bulk rate limit", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    consumeBulkShiftCreateRateLimitMock.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 42,
    });
  });

  it("rejects an authenticated user before body parsing, database writes, or deferred sync", async () => {
    const POST = await loadPost();
    const response = await POST(
      createRequest({
        workplaceId: "workplace-1",
        shifts: createNormalShifts(1),
      }),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error:
        "一括シフト登録の回数が多すぎます。しばらくしてからもう一度お試しください。",
    });
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(consumeBulkShiftCreateRateLimitMock).toHaveBeenCalledWith("user-1");
    expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(prismaShiftCreateManyMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/shifts/bulk CSRF validation", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    consumeBulkShiftCreateRateLimitMock.mockReturnValue({ allowed: true });
  });

  it("rejects a cross-origin request without consuming the authenticated user's rate-limit bucket", async () => {
    const POST = await loadPost();
    const response = await POST(
      createRequest(
        {
          workplaceId: "workplace-1",
          shifts: createNormalShifts(1),
        },
        { origin: "https://attacker.example" },
      ),
    );
    if (!response) {
      throw new Error("bulk shift route did not return a response");
    }

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "不正なオリジンからのリクエストです",
    });
    expect(consumeBulkShiftCreateRateLimitMock).not.toHaveBeenCalled();
    expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(prismaShiftCreateManyMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});

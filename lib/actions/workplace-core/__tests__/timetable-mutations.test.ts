import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import {
  deleteTimetableRouteAction,
  updateTimetableRouteAction,
} from "@/lib/actions/workplace-core/timetable";
import { createTimetableRouteAction } from "@/lib/actions/workplace-core/timetables";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

jest.mock("next/server", () => ({
  connection: jest.fn(),
  NextResponse: {
    json: (
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> },
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

jest.mock("@/lib/api/workplace", () => ({
  requireOwnedWorkplace: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    timetableSet: {
      findFirst: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    timetable: {
      createMany: jest.fn(),
    },
    shiftLessonRange: {
      findFirst: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const timetableSetFindFirstMock = jest.mocked(prisma.timetableSet.findFirst);
const timetableSetCreateManyMock = jest.mocked(prisma.timetableSet.createMany);
const timetableSetDeleteManyMock = jest.mocked(prisma.timetableSet.deleteMany);
const timetableCreateManyMock = jest.mocked(prisma.timetable.createMany);
const shiftLessonRangeFindFirstMock = jest.mocked(
  prisma.shiftLessonRange.findFirst,
);

const workplaceId = "workplace-1";
const timetableSetId = "set-1";

function request(body: unknown): Request {
  return {
    method: "POST",
    url: `http://localhost/api/workplaces/${workplaceId}/timetables`,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

function createContext() {
  return { params: Promise.resolve({ workplaceId }) };
}

function setContext() {
  return { params: Promise.resolve({ workplaceId, id: timetableSetId }) };
}

function validSet(overrides: Record<string, unknown> = {}) {
  return {
    name: "通常期",
    items: [
      { period: 1, startTime: "16:30", endTime: "17:30" },
      { period: 2, startTime: "17:40", endTime: "18:40" },
    ],
    ...overrides,
  };
}

function currentUserResponse(status: number, error: string): Response {
  return {
    status,
    json: async () => ({ error }),
  } as unknown as Response;
}

function assertResponse(
  response: Response | undefined,
): asserts response is Response {
  if (!response) {
    throw new Error("timetable route action did not return a response");
  }
}

function existingSet() {
  return { id: timetableSetId, sortOrder: 3 };
}

function createdSet(
  id: string,
  name: string,
  sortOrder: number,
  items: Array<{
    id: string;
    period: number;
    startTime: Date;
    endTime: Date;
  }>,
) {
  return {
    id,
    workplaceId,
    name,
    sortOrder,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    timetables: items.map((item) => ({
      ...item,
      timetableSetId: id,
    })),
  };
}

describe("timetable mutation route actions", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "CRAM_SCHOOL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      "create",
      () => createTimetableRouteAction(request(validSet()), createContext()),
    ],
    [
      "update",
      () => updateTimetableRouteAction(request(validSet()), setContext()),
    ],
    ["delete", () => deleteTimetableRouteAction(request({}), setContext())],
  ])(
    "returns the unauthenticated response for %s without accessing workplace data",
    async (_, action) => {
      const unauthenticated = currentUserResponse(401, "認証が必要です");
      requireCurrentUserMock.mockResolvedValue({
        response: unauthenticated,
      } as Awaited<ReturnType<typeof requireCurrentUser>>);

      const response = await action();

      assertResponse(response);

      expect(response).toBe(unauthenticated);
      expect(requireOwnedWorkplaceMock).not.toHaveBeenCalled();
      expect(timetableSetFindFirstMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "create",
      () => createTimetableRouteAction(request(validSet()), createContext()),
    ],
    [
      "update",
      () => updateTimetableRouteAction(request(validSet()), setContext()),
    ],
    ["delete", () => deleteTimetableRouteAction(request({}), setContext())],
  ])(
    "returns the non-owned workplace response for %s before any timetable operation",
    async (_, action) => {
      requireOwnedWorkplaceMock.mockResolvedValue({
        response: currentUserResponse(404, "勤務先が見つかりません"),
      } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);

      const response = await action();

      assertResponse(response);

      expect(response.status).toBe(404);
      expect(timetableSetFindFirstMock).not.toHaveBeenCalled();
      expect(shiftLessonRangeFindFirstMock).not.toHaveBeenCalled();
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "create",
      () => createTimetableRouteAction(request(validSet()), createContext()),
    ],
    [
      "update",
      () => updateTimetableRouteAction(request(validSet()), setContext()),
    ],
    ["delete", () => deleteTimetableRouteAction(request({}), setContext())],
  ])("rejects %s for GENERAL workplaces", async (_, action) => {
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "GENERAL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);

    const response = await action();

    assertResponse(response);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "時間割はCRAM_SCHOOL勤務先でのみ操作できます",
    });
    expect(timetableSetFindFirstMock).not.toHaveBeenCalled();
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "create",
      () =>
        createTimetableRouteAction(
          request(
            validSet({
              items: [{ period: 1, startTime: "18:00", endTime: "18:00" }],
            }),
          ),
          createContext(),
        ),
    ],
    [
      "update",
      () =>
        updateTimetableRouteAction(
          request(
            validSet({
              items: [{ period: 1, startTime: "18:00", endTime: "17:00" }],
            }),
          ),
          setContext(),
        ),
    ],
  ])(
    "rejects %s when a period does not end after it starts",
    async (_, action) => {
      timetableSetFindFirstMock.mockResolvedValue(existingSet() as never);

      const response = await action();

      assertResponse(response);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "startTime は endTime より前にしてください",
      });
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "create",
      () =>
        createTimetableRouteAction(
          request(
            validSet({
              items: [
                { period: 1, startTime: "16:30", endTime: "17:30" },
                { period: 1, startTime: "17:40", endTime: "18:40" },
              ],
            }),
          ),
          createContext(),
        ),
    ],
    [
      "update",
      () =>
        updateTimetableRouteAction(
          request(
            validSet({
              items: [
                { period: 1, startTime: "16:30", endTime: "17:30" },
                { period: 1, startTime: "17:40", endTime: "18:40" },
              ],
            }),
          ),
          setContext(),
        ),
    ],
  ])("rejects %s with duplicate periods in one set", async (_, action) => {
    timetableSetFindFirstMock.mockResolvedValue(existingSet() as never);

    const response = await action();

    assertResponse(response);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "同じ時間割セット内で period が重複しています",
    });
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("creates normalized set and timetable rows transactionally", async () => {
    const transaction = {
      timetableSet: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockImplementationOnce((args: { where: { id: { in: string[] } } }) =>
            Promise.resolve([
              createdSet(args.where.id.in[0], "通常期", 6, [
                {
                  id: "period-1",
                  period: 1,
                  startTime: new Date("1970-01-01T16:30:00.000Z"),
                  endTime: new Date("1970-01-01T17:30:00.000Z"),
                },
                {
                  id: "period-2",
                  period: 2,
                  startTime: new Date("1970-01-01T17:40:00.000Z"),
                  endTime: new Date("1970-01-01T18:40:00.000Z"),
                },
              ]),
            ]),
          ),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 5 } }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      timetable: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prismaTransactionMock.mockImplementation(
      (callback) => callback(transaction as never) as never,
    );

    const response = await createTimetableRouteAction(
      request(validSet({ name: "  通常期  " })),
      createContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        name: "通常期",
        sortOrder: 6,
        items: [
          { period: 1, startTimeLabel: "16:30", endTimeLabel: "17:30" },
          { period: 2, startTimeLabel: "17:40", endTimeLabel: "18:40" },
        ],
      },
      sync: { status: "success", pending: false },
    });

    const setRows = transaction.timetableSet.createMany.mock.calls[0][0].data;
    const timetableRows =
      transaction.timetable.createMany.mock.calls[0][0].data;
    expect(setRows).toEqual([
      expect.objectContaining({
        workplaceId,
        name: "通常期",
        sortOrder: 6,
      }),
    ]);
    expect(timetableRows).toEqual([
      expect.objectContaining({ timetableSetId: setRows[0].id, period: 1 }),
      expect.objectContaining({ timetableSetId: setRows[0].id, period: 2 }),
    ]);
    expect(timetableSetCreateManyMock).not.toHaveBeenCalled();
    expect(timetableCreateManyMock).not.toHaveBeenCalled();
  });

  it("creates bulk sets with their rows and returns query order", async () => {
    const transaction = {
      timetableSet: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockImplementationOnce((args: { where: { id: { in: string[] } } }) =>
            Promise.resolve([
              createdSet(args.where.id.in[1], "早朝", 1, [
                {
                  id: "early-period-1",
                  period: 1,
                  startTime: new Date("1970-01-01T08:00:00.000Z"),
                  endTime: new Date("1970-01-01T09:00:00.000Z"),
                },
              ]),
              createdSet(args.where.id.in[0], "通常期", 5, [
                {
                  id: "regular-period-1",
                  period: 1,
                  startTime: new Date("1970-01-01T16:30:00.000Z"),
                  endTime: new Date("1970-01-01T17:30:00.000Z"),
                },
              ]),
            ]),
          ),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      timetable: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prismaTransactionMock.mockImplementation(
      (callback) => callback(transaction as never) as never,
    );

    const response = await createTimetableRouteAction(
      request({
        sets: [
          validSet({ name: "  通常期  ", items: [validSet().items[0]] }),
          validSet({
            name: "  早朝  ",
            sortOrder: 1,
            items: [{ period: 1, startTime: "08:00", endTime: "09:00" }],
          }),
        ],
      }),
      createContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          name: "早朝",
          sortOrder: 1,
          items: [{ startTimeLabel: "08:00", endTimeLabel: "09:00" }],
        },
        {
          name: "通常期",
          sortOrder: 5,
          items: [{ startTimeLabel: "16:30", endTimeLabel: "17:30" }],
        },
      ],
      sync: { status: "success", pending: false },
    });

    const setRows = transaction.timetableSet.createMany.mock.calls[0][0].data;
    const timetableRows =
      transaction.timetable.createMany.mock.calls[0][0].data;
    expect(setRows).toEqual([
      expect.objectContaining({ name: "通常期", sortOrder: 5 }),
      expect.objectContaining({ name: "早朝", sortOrder: 1 }),
    ]);
    expect(timetableRows).toEqual([
      expect.objectContaining({ timetableSetId: setRows[0].id, period: 1 }),
      expect.objectContaining({ timetableSetId: setRows[1].id, period: 1 }),
    ]);
    expect(timetableSetCreateManyMock).not.toHaveBeenCalled();
    expect(timetableCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects a single create whose trimmed name already exists", async () => {
    const transaction = {
      timetableSet: {
        findMany: jest.fn().mockResolvedValue([{ id: "other-set" }]),
        aggregate: jest.fn(),
        createMany: jest.fn(),
      },
      timetable: { createMany: jest.fn() },
    };
    prismaTransactionMock.mockImplementation(
      (callback) => callback(transaction as never) as never,
    );

    const response = await createTimetableRouteAction(
      request(validSet({ name: "  通常期  " })),
      createContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "同じ名前の時間割セットが既に存在します",
    });
    expect(transaction.timetableSet.createMany).not.toHaveBeenCalled();
  });

  it("rejects a bulk create with duplicate normalized names atomically", async () => {
    const transaction = {
      timetableSet: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        createMany: jest.fn(),
      },
      timetable: { createMany: jest.fn() },
    };
    prismaTransactionMock.mockImplementation(
      (callback) => callback(transaction as never) as never,
    );

    const response = await createTimetableRouteAction(
      request({
        sets: [validSet({ name: "通常期" }), validSet({ name: "  通常期  " })],
      }),
      createContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "同じ名前の時間割セットが既に存在します",
    });
    expect(transaction.timetableSet.findMany).not.toHaveBeenCalled();
    expect(transaction.timetableSet.createMany).not.toHaveBeenCalled();
    expect(transaction.timetable.createMany).not.toHaveBeenCalled();
  });

  it("rejects an update that conflicts with another set name", async () => {
    timetableSetFindFirstMock.mockResolvedValue(existingSet() as never);
    const transaction = {
      timetableSet: {
        findFirst: jest.fn().mockResolvedValue({ id: "other-set" }),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      timetable: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    prismaTransactionMock.mockImplementation(
      (callback) => callback(transaction as never) as never,
    );

    const response = await updateTimetableRouteAction(
      request(validSet({ name: "夏期講習" })),
      setContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "同じ名前の時間割セットが既に存在します",
    });
    expect(transaction.timetableSet.update).not.toHaveBeenCalled();
    expect(transaction.timetable.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      "update",
      () => updateTimetableRouteAction(request(validSet()), setContext()),
    ],
    ["delete", () => deleteTimetableRouteAction(request({}), setContext())],
  ])(
    "returns 404 when the set to %s is absent from the owned workplace",
    async (_, action) => {
      timetableSetFindFirstMock.mockResolvedValue(null);

      const response = await action();

      assertResponse(response);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "時間割セットが見つかりません",
      });
      expect(prismaTransactionMock).not.toHaveBeenCalled();
      expect(timetableSetDeleteManyMock).not.toHaveBeenCalled();
    },
  );

  it("refuses to delete a set referenced by a lesson shift", async () => {
    timetableSetFindFirstMock.mockResolvedValue(existingSet() as never);
    shiftLessonRangeFindFirstMock.mockResolvedValue({ id: "range-1" } as never);

    const response = await deleteTimetableRouteAction(
      request({}),
      setContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "この時間割セットはシフトで使用中のため削除できません",
    });
    expect(timetableSetDeleteManyMock).not.toHaveBeenCalled();
  });

  it("replaces timetable children and returns the updated set", async () => {
    timetableSetFindFirstMock.mockResolvedValue(existingSet() as never);
    const transaction = {
      timetableSet: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue({
          id: timetableSetId,
          workplaceId,
          name: "夏期講習",
          sortOrder: 3,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-02T00:00:00.000Z"),
          timetables: [
            {
              id: "period-1",
              timetableSetId,
              period: 1,
              startTime: new Date("1970-01-01T15:00:00.000Z"),
              endTime: new Date("1970-01-01T16:20:00.000Z"),
            },
          ],
        }),
      },
      timetable: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaTransactionMock.mockImplementation(
      (callback) => callback(transaction as never) as never,
    );

    const response = await updateTimetableRouteAction(
      request({
        name: "夏期講習",
        items: [{ period: 1, startTime: "15:00", endTime: "16:20" }],
      }),
      setContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: timetableSetId,
        name: "夏期講習",
        items: [
          {
            id: "period-1",
            period: 1,
            startTimeLabel: "15:00",
            endTimeLabel: "16:20",
          },
        ],
      },
      sync: { status: "success", pending: false },
    });
    expect(transaction.timetableSet.update).toHaveBeenCalledWith({
      where: { id: timetableSetId },
      data: { name: "夏期講習", sortOrder: 3 },
    });
    expect(transaction.timetable.deleteMany).toHaveBeenCalledWith({
      where: { timetableSetId },
    });
    expect(transaction.timetable.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          timetableSetId,
          period: 1,
          startTime: new Date("1970-01-01T15:00:00.000Z"),
          endTime: new Date("1970-01-01T16:20:00.000Z"),
        }),
      ],
    });
  });

  it("deletes an unused owned timetable set", async () => {
    timetableSetFindFirstMock.mockResolvedValue(existingSet() as never);
    shiftLessonRangeFindFirstMock.mockResolvedValue(null);
    timetableSetDeleteManyMock.mockResolvedValue({ count: 1 } as never);

    const response = await deleteTimetableRouteAction(
      request({}),
      setContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: timetableSetId, deleted: true },
      sync: { status: "success", pending: false },
    });
    expect(timetableSetDeleteManyMock).toHaveBeenCalledWith({
      where: { id: timetableSetId, workplaceId },
    });
  });

  it("does not report success when the create transaction fails", async () => {
    prismaTransactionMock.mockRejectedValue(new Error("database unavailable"));

    const response = await createTimetableRouteAction(
      request(validSet()),
      createContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "時間割セットの作成に失敗しました",
    });
  });

  it("maps a create unique-constraint race to 409", async () => {
    prismaTransactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const response = await createTimetableRouteAction(
      request(validSet()),
      createContext(),
    );

    assertResponse(response);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "同じ名前の時間割セットが既に存在します",
    });
  });
});

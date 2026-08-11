import { requireCurrentUser } from "@/lib/api/current-user";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";
import { updateTimetableRouteAction } from "@/lib/actions/workplace-core/timetable";
import { createTimetableRouteAction } from "@/lib/actions/workplace-core/timetables";

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
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const timetableSetFindFirstMock = jest.mocked(prisma.timetableSet.findFirst);

function createRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/workplaces/workplace-1/timetables",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

function createItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    period: index + 1,
    startTime: "09:00",
    endTime: "10:00",
  }));
}

function createSet(itemCount: number, index = 1) {
  return {
    name: `時間割${index}`,
    items: createItems(itemCount),
  };
}

function createSetWithPeriod(period: number) {
  return {
    name: "時間割",
    items: [
      {
        period,
        startTime: "09:00",
        endTime: "10:00",
      },
    ],
  };
}

function createdSet(id = "set-1") {
  return {
    id,
    workplaceId: "workplace-1",
    name: "時間割",
    sortOrder: 0,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    timetables: [],
  };
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

describe("timetable batch limits in route actions", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    requireOwnedWorkplaceMock.mockResolvedValue({
      workplace: { type: "CRAM_SCHOOL" },
    } as Awaited<ReturnType<typeof requireOwnedWorkplace>>);
  });

  it.each([
    ["single", (itemCount: number) => createSet(itemCount)],
    ["bulk", (itemCount: number) => ({ sets: [createSet(itemCount)] })],
  ])("creates %s input with 30 timetable items", async (_, buildPayload) => {
    prismaTransactionMock.mockResolvedValue([createdSet()] as never);

    const response = await createTimetableRouteAction(
      createRequest(buildPayload(30)),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );
    if (!response) {
      throw new Error("create timetable route did not return a response");
    }

    expect(response.status).toBe(201);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["single", (itemCount: number) => createSet(itemCount)],
    ["bulk", (itemCount: number) => ({ sets: [createSet(itemCount)] })],
  ])(
    "rejects %s input with 31 timetable items before its transaction",
    async (_, buildPayload) => {
      const response = await createTimetableRouteAction(
        createRequest(buildPayload(31)),
        { params: Promise.resolve({ workplaceId: "workplace-1" }) },
      );
      if (!response) {
        throw new Error("create timetable route did not return a response");
      }

      await expectLimitValidationError(
        response,
        "時間割セットのコマは30件までです。",
      );
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["single", (period: number) => createSetWithPeriod(period)],
    ["bulk", (period: number) => ({ sets: [createSetWithPeriod(period)] })],
  ])(
    "accepts a %s input whose only timetable item is period 30",
    async (_, buildPayload) => {
      prismaTransactionMock.mockResolvedValue([createdSet()] as never);

      const response = await createTimetableRouteAction(
        createRequest(buildPayload(30)),
        { params: Promise.resolve({ workplaceId: "workplace-1" }) },
      );
      if (!response) {
        throw new Error("create timetable route did not return a response");
      }

      expect(response.status).toBe(201);
      expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["single", (period: number) => createSetWithPeriod(period)],
    ["bulk", (period: number) => ({ sets: [createSetWithPeriod(period)] })],
  ])(
    "rejects a %s input whose timetable item is period 31 before its transaction",
    async (_, buildPayload) => {
      const response = await createTimetableRouteAction(
        createRequest(buildPayload(31)),
        { params: Promise.resolve({ workplaceId: "workplace-1" }) },
      );
      if (!response) {
        throw new Error("create timetable route did not return a response");
      }

      await expectLimitValidationError(
        response,
        "コマ番号は30以下の整数で入力してください。",
      );
      expect(prismaTransactionMock).not.toHaveBeenCalled();
    },
  );

  it("creates a bulk request containing 20 timetable sets", async () => {
    prismaTransactionMock.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        id: `set-${index + 1}`,
        workplaceId: "workplace-1",
      })) as never,
    );

    const response = await createTimetableRouteAction(
      createRequest({
        sets: Array.from({ length: 20 }, (_, index) => createSet(1, index + 1)),
      }),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );
    if (!response) {
      throw new Error("create timetable route did not return a response");
    }

    expect(response.status).toBe(201);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects 21 timetable sets before its transaction", async () => {
    const response = await createTimetableRouteAction(
      createRequest({
        sets: Array.from({ length: 21 }, (_, index) => createSet(1, index + 1)),
      }),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );
    if (!response) {
      throw new Error("create timetable route did not return a response");
    }

    await expectLimitValidationError(
      response,
      "時間割セットの一括作成は20件までです。",
    );
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("updates a set with 30 timetable items", async () => {
    timetableSetFindFirstMock.mockResolvedValue({
      id: "set-1",
      sortOrder: 0,
    } as never);
    prismaTransactionMock.mockResolvedValue(createdSet() as never);

    const response = await updateTimetableRouteAction(
      createRequest(createSet(30)),
      {
        params: Promise.resolve({ workplaceId: "workplace-1", id: "set-1" }),
      },
    );
    if (!response) {
      throw new Error("update timetable route did not return a response");
    }

    expect(response.status).toBe(200);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an update with 31 timetable items before its transaction", async () => {
    timetableSetFindFirstMock.mockResolvedValue({
      id: "set-1",
      sortOrder: 0,
    } as never);

    const response = await updateTimetableRouteAction(
      createRequest(createSet(31)),
      {
        params: Promise.resolve({ workplaceId: "workplace-1", id: "set-1" }),
      },
    );
    if (!response) {
      throw new Error("update timetable route did not return a response");
    }

    await expectLimitValidationError(
      response,
      "時間割セットのコマは30件までです。",
    );
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });

  it("accepts an update whose only timetable item is period 30", async () => {
    timetableSetFindFirstMock.mockResolvedValue({
      id: "set-1",
      sortOrder: 0,
    } as never);
    prismaTransactionMock.mockResolvedValue(createdSet() as never);

    const response = await updateTimetableRouteAction(
      createRequest(createSetWithPeriod(30)),
      {
        params: Promise.resolve({ workplaceId: "workplace-1", id: "set-1" }),
      },
    );
    if (!response) {
      throw new Error("update timetable route did not return a response");
    }

    expect(response.status).toBe(200);
    expect(prismaTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an update whose only timetable item is period 31 before its transaction", async () => {
    timetableSetFindFirstMock.mockResolvedValue({
      id: "set-1",
      sortOrder: 0,
    } as never);

    const response = await updateTimetableRouteAction(
      createRequest(createSetWithPeriod(31)),
      {
        params: Promise.resolve({ workplaceId: "workplace-1", id: "set-1" }),
      },
    );
    if (!response) {
      throw new Error("update timetable route did not return a response");
    }

    await expectLimitValidationError(
      response,
      "コマ番号は30以下の整数で入力してください。",
    );
    expect(prismaTransactionMock).not.toHaveBeenCalled();
  });
});

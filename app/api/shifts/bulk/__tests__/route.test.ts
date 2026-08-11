import { after } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
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
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaShiftCreateManyMock = jest.mocked(prisma.shift.createMany);
const prismaShiftFindManyMock = jest.mocked(prisma.shift.findMany);
const afterMock = jest.mocked(after);

function createRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/shifts/bulk",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
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
});

describe("POST /api/shifts/bulk batch size", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
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

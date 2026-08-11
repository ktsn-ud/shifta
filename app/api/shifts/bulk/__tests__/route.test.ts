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
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const requireOwnedWorkplaceMock = jest.mocked(requireOwnedWorkplace);
const prismaTransactionMock = jest.mocked(prisma.$transaction);
const prismaShiftCreateManyMock = jest.mocked(prisma.shift.createMany);

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

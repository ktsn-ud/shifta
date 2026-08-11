import { requireCurrentUser } from "@/lib/api/current-user";
import { getMonthShifts } from "@/lib/shifts/month-shifts";
import { prisma } from "@/lib/prisma";

const connectionMock = jest.fn<Promise<void>, []>();

jest.mock("next/server", () => ({
  after: jest.fn(),
  connection: () => connectionMock(),
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      create: jest.fn(),
    },
    workplace: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/shifts/month-shifts", () => ({
  getMonthShifts: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getMonthShiftsMock = jest.mocked(getMonthShifts);
const prismaShiftCreateMock = jest.mocked(prisma.shift.create);
const prismaWorkplaceFindFirstMock = jest.mocked(prisma.workplace.findFirst);

function createRequest(url: string): Request {
  return { url } as Request;
}

function createMutationRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/shifts",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://localhost" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
}

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/shifts/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/route");
  });

  return routeModule!;
}

describe("/api/shifts invalid calendar dates", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
  });

  it("POST rejects an impossible date before workplace lookup or shift creation", async () => {
    const { POST } = await loadRouteModule();
    const response = await POST(
      createMutationRequest({
        workplaceId: "workplace-1",
        date: "2026-02-31",
        shiftType: "NORMAL",
        startTime: "09:00",
        endTime: "18:00",
      }),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "入力値が不正です" }),
    );
    expect(prismaWorkplaceFindFirstMock).not.toHaveBeenCalled();
    expect(prismaShiftCreateMock).not.toHaveBeenCalled();
  });

  it("GET rejects an impossible date before fetching shifts", async () => {
    const { GET } = await loadRouteModule();
    const response = await GET(
      createRequest("http://localhost/api/shifts?startDate=2026-02-31"),
    );
    if (!response) {
      throw new Error("response is undefined");
    }

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "クエリパラメータが不正です" }),
    );
    expect(prismaWorkplaceFindFirstMock).not.toHaveBeenCalled();
    expect(getMonthShiftsMock).not.toHaveBeenCalled();
  });
});

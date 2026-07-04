import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";

const connectionMock = jest.fn<Promise<void>, []>();

jest.mock("next/server", () => ({
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
    workplace: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const prismaWorkplaceFindFirstMock = jest.mocked(prisma.workplace.findFirst);

function createRequest(url: string): Request {
  return { url } as Request;
}

function createUnauthorizedResponse(): Response {
  const headers = new Map<string, string>([
    ["cache-control", "private, no-store, no-cache, must-revalidate"],
    ["content-type", "application/json"],
  ]);

  return {
    status: 401,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      set: (name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      },
    },
    json: async () => ({ error: "認証が必要です" }),
  } as unknown as Response;
}

async function loadGet() {
  let routeModule: typeof import("@/app/api/workplaces/[workplaceId]/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/workplaces/[workplaceId]/route");
  });

  return routeModule!.GET;
}

describe("GET /api/workplaces/[workplaceId]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
  });

  it("勤務先詳細を counts 付きで返し no-store header を付ける", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: {
        shifts: 2,
        payrollRules: 1,
        timetableSets: 0,
      },
    } as never);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      {
        params: Promise.resolve({ workplaceId: "workplace-1" }),
      },
    );
    const payload = (await response.json()) as {
      data: {
        id: string;
        _count: {
          shifts: number;
          payrollRules: number;
          timetableSets: number;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(payload.data).toEqual({
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: {
        shifts: 2,
        payrollRules: 1,
        timetableSets: 0,
      },
    });
    expect(prismaWorkplaceFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "workplace-1",
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        closingDayType: true,
        closingDay: true,
        payday: true,
        _count: {
          select: {
            shifts: true,
            payrollRules: true,
            timetableSets: true,
          },
        },
      },
    });
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("勤務先が見つからないときは 404 を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue(null);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces/missing"),
      {
        params: Promise.resolve({ workplaceId: "missing" }),
      },
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(payload.error).toBe("勤務先が見つかりません");
  });

  it("未認証時は current-user の response をそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces/workplace-1"),
      {
        params: Promise.resolve({ workplaceId: "workplace-1" }),
      },
    );

    expect(response).toBe(unauthorizedResponse);
    expect(prismaWorkplaceFindFirstMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });
});

import { requireCurrentUser } from "@/lib/api/current-user";
import { getCachedWorkplaces } from "@/lib/cache/workplace-read-cache";
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
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

jest.mock("@/lib/cache/workplace-read-cache", () => ({
  getCachedWorkplaces: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getCachedWorkplacesMock = jest.mocked(getCachedWorkplaces);
const prismaWorkplaceFindManyMock = jest.mocked(prisma.workplace.findMany);

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

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/workplaces/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/workplaces/route");
  });

  return routeModule!;
}

async function loadGet() {
  return (await loadRouteModule()).GET;
}

describe("GET /api/workplaces", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
  });

  it("勤務先一覧を counts 付きで返し no-store header を付ける", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getCachedWorkplacesMock.mockResolvedValue([
      {
        id: "workplace-1",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
        _count: {
          shifts: 2,
          payrollRules: 3,
          timetableSets: 0,
        },
      },
    ] as never);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces"),
    );
    const payload = (await response.json()) as {
      data: Array<{
        id: string;
        _count: {
          shifts: number;
          payrollRules: number;
          timetableSets: number;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    expect(payload.data).toEqual([
      {
        id: "workplace-1",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
        closingDayType: "DAY_OF_MONTH",
        closingDay: 15,
        payday: 25,
        _count: {
          shifts: 2,
          payrollRules: 3,
          timetableSets: 0,
        },
      },
    ]);
    expect(getCachedWorkplacesMock).toHaveBeenCalledWith("user-1");
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("includeCounts=false でも cached DAL を使い count を除外して no-store で返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getCachedWorkplacesMock.mockResolvedValue([
      {
        id: "workplace-2",
        name: "勤務先B",
        color: "#FF6633",
        type: "CRAM_SCHOOL",
        closingDayType: "END_OF_MONTH",
        closingDay: null,
        payday: 25,
        _count: {
          shifts: 4,
          payrollRules: 2,
          timetableSets: 1,
        },
      },
    ] as never);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces?includeCounts=false"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "workplace-2",
          name: "勤務先B",
          color: "#FF6633",
          type: "CRAM_SCHOOL",
        },
      ],
    });
    expect(getCachedWorkplacesMock).toHaveBeenCalledWith("user-1");
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
  });

  it("未認証時は current-user の response をそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces"),
    );

    expect(response).toBe(unauthorizedResponse);
    expect(getCachedWorkplacesMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("Mutation 用 HTTP export を公開しない", async () => {
    const routeModule = await loadRouteModule();

    expect(routeModule).not.toHaveProperty("POST");
    expect(routeModule).not.toHaveProperty("PUT");
    expect(routeModule).not.toHaveProperty("DELETE");
  });
});

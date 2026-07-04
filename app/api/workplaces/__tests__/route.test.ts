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
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
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

async function loadGet() {
  let routeModule: typeof import("@/app/api/workplaces/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/workplaces/route");
  });

  return routeModule!.GET;
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
    prismaWorkplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-1",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
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
        _count: {
          shifts: 2,
          payrollRules: 3,
          timetableSets: 0,
        },
      },
    ]);
    expect(prismaWorkplaceFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: {
        _count: {
          select: {
            shifts: true,
            payrollRules: true,
            timetableSets: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("includeCounts=false なら軽量 select で返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindManyMock.mockResolvedValue([
      {
        id: "workplace-2",
        name: "勤務先B",
        color: "#FF6633",
        type: "CRAM_SCHOOL",
      },
    ] as never);

    const GET = await loadGet();
    const response = await GET(
      createRequest("http://localhost/api/workplaces?includeCounts=false"),
    );

    expect(response.status).toBe(200);
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
    expect(prismaWorkplaceFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        id: true,
        name: true,
        color: true,
        type: true,
      },
      orderBy: { createdAt: "desc" },
    });
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
    expect(prismaWorkplaceFindManyMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });
});

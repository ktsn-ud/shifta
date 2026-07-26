import { requireCurrentUser } from "@/lib/api/current-user";
import { updateWorkplaceRouteAction } from "@/lib/actions/workplace-core/workplace";
import { getCachedWorkplaceDetail } from "@/lib/cache/workplace-read-cache";
import { revalidateWorkplaceDomainTags } from "@/lib/cache/revalidate";
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
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateWorkplaceDomainTags: jest.fn(),
}));

jest.mock("@/lib/cache/workplace-read-cache", () => ({
  getCachedWorkplaceDetail: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getCachedWorkplaceDetailMock = jest.mocked(getCachedWorkplaceDetail);
const revalidateWorkplaceDomainTagsMock = jest.mocked(
  revalidateWorkplaceDomainTags,
);
const prismaWorkplaceFindFirstMock = jest.mocked(prisma.workplace.findFirst);
const prismaWorkplaceUpdateMock = jest.mocked(prisma.workplace.update);

function createRequest(url: string): Request {
  return { url } as Request;
}

function createMutationRequest(body: unknown): Request {
  return {
    method: "POST",
    url: "http://localhost/api/workplaces/workplace-1",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "sec-fetch-site" ? "same-origin" : null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Request;
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
  let routeModule: typeof import("@/app/api/workplaces/[workplaceId]/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/workplaces/[workplaceId]/route");
  });

  return routeModule!;
}

async function loadGet() {
  return (await loadRouteModule()).GET;
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
    getCachedWorkplaceDetailMock.mockResolvedValue({
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
    expect(getCachedWorkplaceDetailMock).toHaveBeenCalledWith(
      "user-1",
      "workplace-1",
    );
    expect(prismaWorkplaceFindFirstMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("勤務先が見つからないときは 404 を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getCachedWorkplaceDetailMock.mockResolvedValue(null);

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
    expect(getCachedWorkplaceDetailMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("Mutation 用 HTTP export を公開しない", async () => {
    const routeModule = await loadRouteModule();

    expect(routeModule).not.toHaveProperty("POST");
    expect(routeModule).not.toHaveProperty("PUT");
    expect(routeModule).not.toHaveProperty("DELETE");
  });

  it("内部 Route Action は所有外勤務先を更新しない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue(null);
    const response = await updateWorkplaceRouteAction(
      createMutationRequest({ name: "変更後" }),
      { params: Promise.resolve({ workplaceId: "workplace-owned-by-user-2" }) },
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(404);
    await expect(response!.json()).resolves.toEqual({
      error: "勤務先が見つかりません",
    });
  });

  it("内部 Route Action は所有確認後も不正な入力を DB 更新前に拒否する", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    const response = await updateWorkplaceRouteAction(
      createMutationRequest({ name: "" }),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(400);
    await expect(response!.json()).resolves.toEqual(
      expect.objectContaining({ error: "入力値が不正です" }),
    );
  });

  it("core の更新成功は旧 revalidateTag 経路を使わない", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaWorkplaceFindFirstMock.mockResolvedValue({
      id: "workplace-1",
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    } as never);
    prismaWorkplaceUpdateMock.mockResolvedValue({
      id: "workplace-1",
      name: "変更後",
    } as never);

    const response = await updateWorkplaceRouteAction(
      createMutationRequest({ name: "変更後" }),
      { params: Promise.resolve({ workplaceId: "workplace-1" }) },
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(200);
    expect(revalidateWorkplaceDomainTagsMock).not.toHaveBeenCalled();
  });
});

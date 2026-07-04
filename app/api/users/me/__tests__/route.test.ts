import { requireCurrentUser } from "@/lib/api/current-user";

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
        },
        json: async () => body,
      };
    },
  },
}));

jest.mock("@/lib/api/current-user", () => ({
  getSessionEmail: jest.fn(),
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: jest.fn(),
    },
  },
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/users/me/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/users/me/route");
  });

  return routeModule!;
}

describe("GET /api/users/me", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
  });

  it("sidebar 用の最小 DTO を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Test User",
        email: "user@example.com",
        image: "https://example.com/avatar.png",
        calendarId: "calendar-1",
        googleTokenExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        emailVerified: new Date("2026-01-02T00:00:00.000Z"),
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        name: "Test User",
        email: "user@example.com",
        image: "https://example.com/avatar.png",
      },
    });
  });

  it("name と image が未設定なら null を返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        name: null,
        email: "user@example.com",
        image: null,
        calendarId: null,
        googleTokenExpiresAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        emailVerified: null,
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        name: null,
        email: "user@example.com",
        image: null,
      },
    });
  });

  it("401 response をそのまま返す", async () => {
    const unauthorizedResponse = {
      status: 401,
      json: async () => ({ error: "認証が必要です" }),
    } as Response;
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(response).toBe(unauthorizedResponse);
  });

  it("404 response をそのまま返す", async () => {
    const notFoundResponse = {
      status: 404,
      json: async () => ({
        error: "ユーザーが見つかりません。POST /api/users で作成してください",
      }),
    } as Response;
    requireCurrentUserMock.mockResolvedValue({
      response: notFoundResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const { GET } = await loadRouteModule();
    const response = await GET();

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(response).toBe(notFoundResponse);
  });
});

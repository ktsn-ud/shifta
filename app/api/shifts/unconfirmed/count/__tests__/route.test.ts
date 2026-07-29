import { requireCurrentUser } from "@/lib/api/current-user";
import { getUnconfirmedShiftCount } from "@/lib/shifts/unconfirmed-count";

const connectionMock = jest.fn();

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

jest.mock("@/lib/shifts/unconfirmed-count", () => ({
  getUnconfirmedShiftCount: jest.fn(),
}));

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getUnconfirmedShiftCountMock = jest.mocked(getUnconfirmedShiftCount);

function createUnauthorizedResponse(): Response {
  const headers = new Map<string, string>();

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
  let routeModule: typeof import("@/app/api/shifts/unconfirmed/count/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/shifts/unconfirmed/count/route");
  });

  return routeModule!.GET;
}

describe("GET /api/shifts/unconfirmed/count", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
  });

  it("認証済みユーザーの未確定件数を no-store で返す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getUnconfirmedShiftCountMock.mockResolvedValue(3);

    const GET = await loadGet();
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-cache, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual({ count: 3 });
    expect(getUnconfirmedShiftCountMock).toHaveBeenCalledWith("user-1");
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("未認証時は current-user の response をそのまま返す", async () => {
    const unauthorizedResponse = createUnauthorizedResponse();
    requireCurrentUserMock.mockResolvedValue({
      response: unauthorizedResponse,
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const GET = await loadGet();
    const response = await GET();

    expect(response).toBe(unauthorizedResponse);
    expect(getUnconfirmedShiftCountMock).not.toHaveBeenCalled();
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗した場合は既存規約の 500 エラーを返す", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getUnconfirmedShiftCountMock.mockRejectedValue(
      new Error("database unavailable"),
    );

    try {
      const GET = await loadGet();
      const response = await GET();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "未確定シフト件数の取得に失敗しました",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "GET /api/shifts/unconfirmed/count failed",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

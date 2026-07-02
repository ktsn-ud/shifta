/**
 * @jest-environment node
 */

const mockAuth = jest.fn();
const mockFindUnique = jest.fn();

jest.mock("next/server", () => ({
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

jest.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

async function loadCurrentUserModule() {
  let currentUserModule: typeof import("@/lib/api/current-user");

  await jest.isolateModulesAsync(async () => {
    currentUserModule = await import("@/lib/api/current-user");
  });

  return currentUserModule!;
}

function createUserRecord() {
  return {
    id: "user-1",
    email: "user@example.com",
    name: null,
    emailVerified: null,
    image: null,
    calendarId: null,
    googleTokenExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("lib/api/current-user", () => {
  const originalPerf = process.env.SHIFTA_PERF;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    delete process.env.SHIFTA_PERF;
  });

  afterAll(() => {
    if (originalPerf === undefined) {
      delete process.env.SHIFTA_PERF;
      return;
    }

    process.env.SHIFTA_PERF = originalPerf;
  });

  it("getSessionEmail がセッション email を返す", async () => {
    mockAuth.mockResolvedValue({
      user: {
        email: "user@example.com",
      },
    });

    const { getSessionEmail } = await loadCurrentUserModule();

    await expect(getSessionEmail()).resolves.toBe("user@example.com");
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it("未認証なら 401 response を返す", async () => {
    mockAuth.mockResolvedValue(null);

    const { requireCurrentUser } = await loadCurrentUserModule();
    const result = await requireCurrentUser();

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response?.status).toBe(401);
      await expect(result.response?.json()).resolves.toEqual({
        error: "認証が必要です",
      });
    }
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("email があって user がなければ 404 response を返す", async () => {
    mockAuth.mockResolvedValue({
      user: {
        email: "user@example.com",
      },
    });
    mockFindUnique.mockResolvedValue(null);

    const { requireCurrentUser } = await loadCurrentUserModule();
    const result = await requireCurrentUser();

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response?.status).toBe(404);
      await expect(result.response?.json()).resolves.toEqual({
        error: "ユーザーが見つかりません。POST /api/users で作成してください",
      });
    }
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });

  it("user があれば user を返す", async () => {
    const user = createUserRecord();

    mockAuth.mockResolvedValue({
      user: {
        email: user.email,
      },
    });
    mockFindUnique.mockResolvedValue(user);

    const { requireCurrentUser } = await loadCurrentUserModule();
    await expect(requireCurrentUser()).resolves.toEqual({
      user,
    });
  });

  it("SHIFTA_PERF=1 なら細分化した計測ログを出す", async () => {
    process.env.SHIFTA_PERF = "1";
    mockAuth.mockResolvedValue({
      user: {
        email: "user@example.com",
      },
    });
    mockFindUnique.mockResolvedValue(createUserRecord());
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { requireCurrentUser } = await loadCurrentUserModule();
      await requireCurrentUser();

      const labels = infoSpy.mock.calls.flatMap((call) => {
        const payload = call[1];
        if (!Array.isArray(payload)) {
          return [];
        }

        return payload
          .map((entry) =>
            typeof entry === "object" &&
            entry !== null &&
            "label" in entry &&
            typeof entry.label === "string"
              ? entry.label
              : null,
          )
          .filter((value): value is string => value !== null);
      });

      expect(labels).toEqual(
        expect.arrayContaining([
          "current-user:getSessionEmail:auth",
          "current-user:getSessionEmail:extractSessionEmail",
          "current-user:getCurrentUser:getCachedSessionEmail",
          "current-user:getCurrentUser:findUserByEmail",
          "current-user:requireCurrentUser:getCachedSessionEmail",
          "current-user:requireCurrentUser:getCachedCurrentUser",
        ]),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });
});

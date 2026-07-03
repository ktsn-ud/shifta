/**
 * @jest-environment node
 */

const mockAuth = jest.fn();
const mockFindUnique = jest.fn();

jest.mock("react", () => {
  const actualReact = jest.requireActual<typeof import("react")>("react");
  const functionCaches = new WeakMap<object, Map<string, unknown>>();

  return {
    ...actualReact,
    cache:
      <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) =>
      (...args: TArgs) => {
        const cacheKeyFn = fn as object;
        let entries = functionCaches.get(cacheKeyFn);
        if (!entries) {
          entries = new Map();
          functionCaches.set(cacheKeyFn, entries);
        }

        const key = JSON.stringify(args);
        if (entries.has(key)) {
          return entries.get(key) as TResult;
        }

        const result = fn(...args);
        entries.set(key, result);
        return result;
      },
  };
});

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

function createSessionUserWithIsoDates() {
  return {
    id: "user-1",
    email: "user@example.com",
    name: null,
    emailVerified: "2026-01-02T00:00:00.000Z",
    image: null,
    calendarId: null,
    googleTokenExpiresAt: "2026-01-03T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
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

  it("session user に current user 情報が揃っていれば DB lookup を省略して user を返す", async () => {
    const sessionUser = createSessionUserWithIsoDates();
    const user = {
      ...createUserRecord(),
      emailVerified: new Date(sessionUser.emailVerified),
      googleTokenExpiresAt: new Date(sessionUser.googleTokenExpiresAt),
      createdAt: new Date(sessionUser.createdAt),
      updatedAt: new Date(sessionUser.updatedAt),
    };

    mockAuth.mockResolvedValue({
      user: sessionUser,
    });

    const { requireCurrentUser } = await loadCurrentUserModule();
    await expect(requireCurrentUser()).resolves.toEqual({
      user,
    });

    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("session user に必要情報が足りなければ email fallback で DB lookup した user を返す", async () => {
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

    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: user.email },
    });
  });

  it("session user が不完全でも同一 module で requireCurrentUser を 2 回呼べば auth と DB fallback を再利用する", async () => {
    const user = createUserRecord();

    mockAuth.mockResolvedValue({
      user: {
        email: user.email,
      },
    });
    mockFindUnique.mockResolvedValue(user);

    const { requireCurrentUser } = await loadCurrentUserModule();

    await expect(requireCurrentUser()).resolves.toEqual({ user });
    await expect(requireCurrentUser()).resolves.toEqual({ user });

    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });

  it("getSessionEmail の後に requireCurrentUser を呼んでも同一 module なら auth と DB fallback を再利用する", async () => {
    const user = createUserRecord();

    mockAuth.mockResolvedValue({
      user: {
        email: user.email,
      },
    });
    mockFindUnique.mockResolvedValue(user);

    const { getSessionEmail, requireCurrentUser } =
      await loadCurrentUserModule();

    await expect(getSessionEmail()).resolves.toBe(user.email);
    await expect(requireCurrentUser()).resolves.toEqual({ user });

    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });

  it("SHIFTA_PERF=1 なら authState ベースの計測ログを出す", async () => {
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
          "current-user:getAuthState:auth",
          "current-user:getAuthState:extractSessionUser",
          "current-user:getAuthState:extractSessionEmail",
          "current-user:requireCurrentUser:getCachedAuthState",
          "current-user:requireCurrentUser:extractSessionEmail",
          "current-user:requireCurrentUser:extractSessionUser",
          "current-user:requireCurrentUser:findUserByEmailFallback",
        ]),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });
});

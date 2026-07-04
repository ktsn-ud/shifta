/**
 * @jest-environment node
 */

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
  calendarId: string | null;
  googleTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AdapterSession = {
  sessionToken: string;
  userId: string;
  expires: Date;
};

type SessionPayload = {
  user: {
    email?: string | null;
    name?: string | null;
    image?: string | null;
    id?: string;
    emailVerified?: Date | null;
    calendarId?: string | null;
    googleTokenExpiresAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
};

type SessionAndUser = {
  session: AdapterSession;
  user: SessionUser;
};

type SessionRecord = AdapterSession & {
  user: SessionUser;
};

type CapturedNextAuthConfig = {
  adapter: {
    linkAccount?: (...args: readonly unknown[]) => Promise<unknown> | unknown;
    getSessionAndUser?:
      | ((...args: readonly unknown[]) => Promise<SessionAndUser | null>)
      | ((...args: readonly unknown[]) => SessionAndUser | null);
  };
  callbacks: {
    session: (params: {
      session: SessionPayload;
      user: SessionUser;
    }) => Promise<SessionPayload> | SessionPayload;
  };
};

type PerfEntry = {
  label: string;
  durationMs: number;
};

const mockBaseGetSessionAndUser = jest.fn<Promise<SessionAndUser | null>, []>();
const mockLinkAccount = jest.fn();
const mockRawAuth = jest.fn<Promise<unknown>, unknown[]>();
const mockNextAuthFactory = jest.fn();
const mockGoogleProvider = jest.fn();
const mockEncryptOAuthToken = jest.fn((value: string | null) => value);
const mockPrismaAdapterFactory = jest.fn();
const mockPrismaSessionFindUnique = jest.fn();

let mockCapturedConfig: CapturedNextAuthConfig | undefined;

jest.mock("next-auth", () => ({
  __esModule: true,
  default: (...args: readonly unknown[]) => mockNextAuthFactory(...args),
}));

jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: (...args: readonly unknown[]) => mockGoogleProvider(...args),
}));

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: (...args: readonly unknown[]) =>
    mockPrismaAdapterFactory(...args),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: (...args: readonly unknown[]) =>
        mockPrismaSessionFindUnique(...args),
    },
    account: {
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/security/oauth-token-crypto", () => ({
  encryptOAuthToken: (value: string | null) => mockEncryptOAuthToken(value),
}));

function createSessionUser(): SessionUser {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    image: "https://example.com/avatar.png",
    emailVerified: new Date("2026-01-02T00:00:00.000Z"),
    calendarId: "primary",
    googleTokenExpiresAt: new Date("2026-01-03T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-04T00:00:00.000Z"),
  };
}

function createSessionPayload(user: SessionUser): SessionPayload {
  return {
    user: {
      email: user.email,
      name: user.name,
      image: user.image,
    },
  };
}

function createSessionRecord(user: SessionUser): SessionRecord {
  return {
    sessionToken: "session-token",
    userId: user.id,
    expires: new Date("2026-01-05T00:00:00.000Z"),
    user,
  };
}

function isPerfEntry(value: unknown): value is PerfEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    label?: unknown;
    durationMs?: unknown;
  };

  return (
    typeof candidate.label === "string" &&
    typeof candidate.durationMs === "number"
  );
}

function extractPerfEntries(infoSpy: jest.SpyInstance): PerfEntry[] {
  return infoSpy.mock.calls.flatMap((call) => {
    const payload = call[1];

    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.filter(isPerfEntry);
  });
}

async function loadAuthModule() {
  let authModule: typeof import("@/lib/auth");

  await jest.isolateModulesAsync(async () => {
    authModule = await import("@/lib/auth");
  });

  return authModule!;
}

describe("lib/auth", () => {
  const originalPerf = process.env.SHIFTA_PERF;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SHIFTA_PERF;
    mockCapturedConfig = undefined;

    mockGoogleProvider.mockReturnValue({ id: "google" });
    mockPrismaAdapterFactory.mockImplementation(() => ({
      linkAccount: mockLinkAccount,
      getSessionAndUser: mockBaseGetSessionAndUser,
    }));
    mockNextAuthFactory.mockImplementation((config: unknown) => {
      mockCapturedConfig = config as CapturedNextAuthConfig;

      return {
        auth: (...args: readonly unknown[]) => mockRawAuth(...args),
        handlers: {
          GET: jest.fn(),
          POST: jest.fn(),
        },
        signIn: jest.fn(),
        signOut: jest.fn(),
      };
    });
  });

  afterAll(() => {
    if (originalPerf === undefined) {
      delete process.env.SHIFTA_PERF;
      return;
    }

    process.env.SHIFTA_PERF = originalPerf;
  });

  it("SHIFTA_PERF 未設定なら auth() no-arg でも追加計測ログを出さずに session を返す", async () => {
    const user = createSessionUser();
    const sessionRecord = createSessionRecord(user);

    mockPrismaSessionFindUnique.mockResolvedValue(sessionRecord);
    mockRawAuth.mockImplementation(async (...args) => {
      if (args.length > 0) {
        return { delegatedArgs: args };
      }

      const resolved =
        await mockCapturedConfig?.adapter.getSessionAndUser?.("session-token");
      if (!resolved) {
        return null;
      }

      return mockCapturedConfig?.callbacks.session({
        session: createSessionPayload(resolved.user),
        user: resolved.user,
      });
    });
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { auth } = await loadAuthModule();
      const session = await auth();

      expect(session).toEqual({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          calendarId: user.calendarId,
          googleTokenExpiresAt: user.googleTokenExpiresAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
      expect(mockPrismaSessionFindUnique).toHaveBeenCalledWith({
        where: { sessionToken: "session-token" },
        include: { user: true },
      });
      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("SHIFTA_PERF=1 なら getSessionAndUser と session callback を同一 auth timing コンテキストで計測する", async () => {
    process.env.SHIFTA_PERF = "1";

    const user = createSessionUser();
    const sessionRecord = createSessionRecord(user);

    mockPrismaSessionFindUnique.mockResolvedValue(sessionRecord);
    mockRawAuth.mockImplementation(async () => {
      const resolved =
        await mockCapturedConfig?.adapter.getSessionAndUser?.("session-token");
      if (!resolved) {
        return null;
      }

      return mockCapturedConfig?.callbacks.session({
        session: createSessionPayload(resolved.user),
        user: resolved.user,
      });
    });
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { auth } = await loadAuthModule();
      const session = await auth();
      const perfEntries = extractPerfEntries(infoSpy);

      expect(session).toEqual({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          calendarId: user.calendarId,
          googleTokenExpiresAt: user.googleTokenExpiresAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
      expect(mockPrismaSessionFindUnique).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(perfEntries.map(({ label }) => label)).toEqual([
        "auth:sessionResolve:dbRead",
        "auth:sessionResolve:assemble",
        "auth:sessionResolve",
        "auth:userHydrate",
        "auth:total",
      ]);
      expect(
        perfEntries.every((entry) => Number.isFinite(entry.durationMs)),
      ).toBe(true);
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("auth() に引数がある場合は auth timing コンテキストを作らず既存の委譲を維持する", async () => {
    process.env.SHIFTA_PERF = "1";
    mockRawAuth.mockResolvedValue({
      user: {
        email: "user@example.com",
      },
    });
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { auth } = await loadAuthModule();
      const request = new Request(
        "https://example.com/api/auth/session",
      ) as unknown as Parameters<typeof auth>[0];
      const session = await auth(request);

      expect(session).toEqual({
        user: {
          email: "user@example.com",
        },
      });
      expect(mockRawAuth).toHaveBeenCalledWith(request);
      expect(mockPrismaSessionFindUnique).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("auth() に middleware 関数を渡す場合も auth timing コンテキストを作らず既存の委譲を維持する", async () => {
    process.env.SHIFTA_PERF = "1";
    const delegatedResult = new Response("ok");
    const middleware = jest.fn(async () => delegatedResult);

    mockRawAuth.mockResolvedValue(delegatedResult);
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { auth } = await loadAuthModule();
      const result = await auth(
        middleware as unknown as Parameters<typeof auth>[0],
      );

      expect(result).toBe(delegatedResult);
      expect(mockRawAuth).toHaveBeenCalledWith(middleware);
      expect(mockPrismaSessionFindUnique).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it("SHIFTA_PERF=1 で getSessionAndUser が失敗した場合はエラーを伝播しつつ perf ログを壊さない", async () => {
    process.env.SHIFTA_PERF = "1";
    const expectedError = new Error("session lookup failed");

    mockPrismaSessionFindUnique.mockRejectedValue(expectedError);
    mockRawAuth.mockImplementation(async () =>
      mockCapturedConfig?.adapter.getSessionAndUser?.("session-token"),
    );
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { auth } = await loadAuthModule();

      await expect(auth()).rejects.toThrow(expectedError);

      const perfEntries = extractPerfEntries(infoSpy);

      expect(mockPrismaSessionFindUnique).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(perfEntries.map(({ label }) => label)).toEqual([
        "auth:sessionResolve:dbRead",
        "auth:sessionResolve",
        "auth:total",
      ]);
      expect(
        perfEntries.every((entry) => Number.isFinite(entry.durationMs)),
      ).toBe(true);
    } finally {
      infoSpy.mockRestore();
    }
  });
});

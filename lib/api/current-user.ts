import "server-only";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api/http";
import { createRequestTiming } from "@/lib/perf/request-timing";
import type { User } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import type { Session } from "next-auth";

type SessionCurrentUser = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "emailVerified"
  | "image"
  | "calendarId"
  | "googleTokenExpiresAt"
  | "createdAt"
  | "updatedAt"
>;

type SessionUserCandidate = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  emailVerified?: unknown;
  image?: unknown;
  calendarId?: unknown;
  googleTokenExpiresAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type AuthSession = Session | null;

type AuthState = {
  session: AuthSession;
  email: string | null;
  sessionUser: SessionCurrentUser | null;
};

type SessionAndCurrentUserResult =
  | { session: Session; user: SessionCurrentUser | User }
  | { response: ReturnType<typeof jsonError> };

const getCachedAuthState = cache(async (): Promise<AuthState> => {
  const timing = createRequestTiming("current-user:getAuthState");

  try {
    const session = await timing.measure("auth", () => auth());
    const sessionUser = await timing.measure("extractSessionUser", () =>
      getSessionCurrentUser(session),
    );
    const email = await timing.measure(
      "extractSessionEmail",
      () => sessionUser?.email ?? session?.user?.email ?? null,
    );

    return {
      session,
      email,
      sessionUser,
    };
  } finally {
    timing.flushLog();
  }
});

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getOptionalDate(value: unknown): Date | null {
  return value == null ? null : normalizeDate(value);
}

function getSessionCurrentUser(session: AuthSession) {
  const user = session?.user as SessionUserCandidate | undefined;

  if (!user) {
    return null;
  }

  const createdAt = normalizeDate(user.createdAt);
  const updatedAt = normalizeDate(user.updatedAt);

  if (
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id: user.id,
    name: getOptionalString(user.name),
    email: user.email,
    emailVerified: getOptionalDate(user.emailVerified),
    image: getOptionalString(user.image),
    calendarId: getOptionalString(user.calendarId),
    googleTokenExpiresAt: getOptionalDate(user.googleTokenExpiresAt),
    createdAt,
    updatedAt,
  };
}

const getCachedSessionEmail = cache(async (): Promise<string | null> => {
  const timing = createRequestTiming("current-user:getSessionEmail");

  try {
    const authState = await timing.measure("getCachedAuthState", () =>
      getCachedAuthState(),
    );

    return await timing.measure("extractSessionEmail", () => authState.email);
  } finally {
    timing.flushLog();
  }
});

const getCachedUserByEmail = cache(async (email: string) =>
  prisma.user.findUnique({ where: { email } }),
);

const getCachedSessionAndCurrentUserResult = cache(
  async (): Promise<SessionAndCurrentUserResult> => {
    const authState = await getCachedAuthState();
    const { email, session, sessionUser } = authState;

    if (!email || !session) {
      return { response: jsonError("認証が必要です", 401) };
    }

    if (sessionUser) {
      return { session, user: sessionUser };
    }

    const user = await getCachedUserByEmail(email);

    if (!user) {
      return {
        response: jsonError(
          "ユーザーが見つかりません。POST /api/users で作成してください",
          404,
        ),
      };
    }

    return { session, user };
  },
);

export async function getSessionEmail(): Promise<string | null> {
  return getCachedSessionEmail();
}

export async function requireCurrentUser() {
  const timing = createRequestTiming("current-user:requireCurrentUser");

  try {
    const result = await timing.measure(
      "getCachedSessionAndCurrentUserResult",
      () => getCachedSessionAndCurrentUserResult(),
    );

    if ("response" in result) {
      return result;
    }

    return { user: result.user } as const;
  } finally {
    timing.flushLog();
  }
}

export async function requireSessionAndCurrentUser() {
  const timing = createRequestTiming(
    "current-user:requireSessionAndCurrentUser",
  );

  try {
    return await timing.measure("getCachedSessionAndCurrentUserResult", () =>
      getCachedSessionAndCurrentUserResult(),
    );
  } finally {
    timing.flushLog();
  }
}

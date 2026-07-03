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
    const authState = await getCachedAuthState();
    await timing.measure("getCachedAuthSession", () => authState.session);

    const email = await timing.measure(
      "extractSessionEmail",
      () => authState.email,
    );

    return email;
  } finally {
    timing.flushLog();
  }
});

const getCachedCurrentUser = cache(async () => {
  const timing = createRequestTiming("current-user:getCurrentUser");

  try {
    const authState = await getCachedAuthState();
    await timing.measure("getCachedAuthSession", () => authState.session);

    const sessionUser = await timing.measure(
      "extractSessionUser",
      () => authState.sessionUser,
    );

    if (sessionUser) {
      return sessionUser;
    }

    const email = await timing.measure(
      "extractSessionEmail",
      () => authState.email,
    );
    if (!email) {
      return null;
    }

    const user = await timing.measure("findUserByEmailFallback", () =>
      prisma.user.findUnique({ where: { email } }),
    );

    return user;
  } finally {
    timing.flushLog();
  }
});

export async function getSessionEmail(): Promise<string | null> {
  return getCachedSessionEmail();
}

export async function requireCurrentUser() {
  const timing = createRequestTiming("current-user:requireCurrentUser");

  try {
    const [email, user] = await Promise.all([
      timing.measure("getCachedSessionEmail", () => getCachedSessionEmail()),
      timing.measure("getCachedCurrentUser", () => getCachedCurrentUser()),
    ]);

    if (!email) {
      return { response: jsonError("認証が必要です", 401) } as const;
    }

    if (!user) {
      return {
        response: jsonError(
          "ユーザーが見つかりません。POST /api/users で作成してください",
          404,
        ),
      } as const;
    }

    return { user } as const;
  } finally {
    timing.flushLog();
  }
}

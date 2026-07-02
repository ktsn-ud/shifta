import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api/http";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

const getCachedSessionEmail = cache(async (): Promise<string | null> => {
  const timing = createRequestTiming("current-user:getSessionEmail");

  try {
    const session = await timing.measure("auth", () => auth());
    const email = await timing.measure(
      "extractSessionEmail",
      () => session?.user?.email ?? null,
    );

    return email;
  } finally {
    timing.flushLog();
  }
});

const getCachedCurrentUser = cache(async () => {
  const timing = createRequestTiming("current-user:getCurrentUser");

  try {
    const email = await timing.measure("getCachedSessionEmail", () =>
      getCachedSessionEmail(),
    );
    if (!email) {
      return null;
    }

    const user = await timing.measure("findUserByEmail", () =>
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

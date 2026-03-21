import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";
import { cache } from "react";

const getCachedSessionEmail = cache(async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.email ?? null;
});

const getCachedCurrentUser = cache(async () => {
  const email = await getCachedSessionEmail();
  if (!email) {
    return null;
  }

  return prisma.user.findUnique({ where: { email } });
});

export async function getSessionEmail(): Promise<string | null> {
  return getCachedSessionEmail();
}

export async function requireCurrentUser() {
  const [email, user] = await Promise.all([
    getCachedSessionEmail(),
    getCachedCurrentUser(),
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
}

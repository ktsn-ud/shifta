import { auth } from "@/lib/auth"
import { jsonError } from "@/lib/api/http"
import { prisma } from "@/lib/prisma"

export async function getSessionEmail(): Promise<string | null> {
  const session = await auth()
  return session?.user?.email ?? null
}

export async function requireCurrentUser() {
  const email = await getSessionEmail()
  if (!email) {
    return { response: jsonError("認証が必要です", 401) } as const
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return {
      response: jsonError(
        "ユーザーが見つかりません。POST /api/users で作成してください",
        404,
      ),
    } as const
  }

  return { user } as const
}

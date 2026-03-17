import { jsonError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

export async function requireOwnedWorkplace(
  workplaceId: string,
  userId: string,
) {
  const workplace = await prisma.workplace.findFirst({
    where: {
      id: workplaceId,
      userId,
    },
  });

  if (!workplace) {
    return { response: jsonError("勤務先が見つかりません", 404) } as const;
  }

  return { workplace } as const;
}

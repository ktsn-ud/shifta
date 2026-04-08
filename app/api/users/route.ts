import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionEmail } from "@/lib/api/current-user";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

const createUserSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().trim().min(1).max(100).nullable().optional(),
    image: z.string().url().nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const sessionEmail = await getSessionEmail();
    if (!sessionEmail) {
      return jsonError("認証が必要です", 401);
    }

    const body = await parseJsonBody(request, createUserSchema);
    if (!body.success) {
      return body.response;
    }

    const targetEmail = body.data.email ?? sessionEmail;
    if (targetEmail !== sessionEmail) {
      return jsonError("ログイン中ユーザー以外は作成できません", 403);
    }

    const user = await prisma.user.upsert({
      where: { email: targetEmail },
      update: {
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.image !== undefined ? { image: body.data.image } : {}),
        // Keep the old API contract (`created`) while collapsing to one query.
        updatedAt: new Date(),
      },
      create: {
        email: targetEmail,
        name: body.data.name ?? null,
        image: body.data.image ?? null,
      },
    });

    const created = user.createdAt.getTime() === user.updatedAt.getTime();
    return NextResponse.json(
      { data: user, created },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    console.error("POST /api/users failed", error);
    return jsonError("ユーザー作成に失敗しました", 500);
  }
}

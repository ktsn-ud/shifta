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

    const existingUser = await prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (existingUser) {
      const user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: body.data.name ?? existingUser.name,
          image: body.data.image ?? existingUser.image,
        },
      });

      return NextResponse.json({ data: user, created: false });
    }

    const user = await prisma.user.create({
      data: {
        email: targetEmail,
        name: body.data.name ?? null,
        image: body.data.image ?? null,
      },
    });

    return NextResponse.json({ data: user, created: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users failed", error);
    return jsonError("ユーザー作成に失敗しました", 500);
  }
}

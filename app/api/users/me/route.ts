import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionEmail, requireCurrentUser } from "@/lib/api/current-user";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().trim().min(1).max(100).nullable().optional(),
    image: z.string().url().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "更新対象がありません",
  });

export async function GET() {
  try {
    const result = await requireCurrentUser();
    if ("response" in result) {
      return result.response;
    }

    return NextResponse.json({ data: result.user });
  } catch (error) {
    console.error("GET /api/users/me failed", error);
    return jsonError("ユーザー取得に失敗しました", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const sessionEmail = await getSessionEmail();
    if (!sessionEmail) {
      return jsonError("認証が必要です", 401);
    }

    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const body = await parseJsonBody(request, updateUserSchema);
    if (!body.success) {
      return body.response;
    }

    if (body.data.email && body.data.email !== sessionEmail) {
      return jsonError("ログイン中メールアドレス以外には更新できません", 400);
    }

    const updateData: {
      name?: string | null;
      image?: string | null;
    } = {};

    if ("name" in body.data) {
      updateData.name = body.data.name;
    }
    if ("image" in body.data) {
      updateData.image = body.data.image;
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError("更新対象がありません", 400);
    }

    const user = await prisma.user.update({
      where: { id: current.user.id },
      data: updateData,
    });

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("PUT /api/users/me failed", error);
    return jsonError("ユーザー更新に失敗しました", 500);
  }
}

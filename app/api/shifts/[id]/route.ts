import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  jsonError,
  parseJsonBody,
  verifyMutationRequest,
} from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import {
  syncShiftAfterUpdate,
  syncShiftDeletion,
} from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";
import {
  buildShiftData,
  ShiftValidationError,
  shiftInputSchema,
} from "../_shared";

type Context = {
  params: Promise<{ id: string }>;
};

async function findOwnedShift(shiftId: string, userId: string) {
  return prisma.shift.findFirst({
    where: {
      id: shiftId,
      workplace: {
        userId,
      },
    },
    include: {
      lessonRange: true,
      workplace: true,
    },
  });
}

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { id } = await context.params;
    const shift = await findOwnedShift(id, current.user.id);
    if (!shift) {
      return jsonError("シフトが見つかりません", 404);
    }

    return NextResponse.json({ data: shift });
  } catch (error) {
    console.error("GET /api/shifts/:id failed", error);
    return jsonError("シフト取得に失敗しました", 500);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { id } = await context.params;
    const existing = await findOwnedShift(id, current.user.id);
    if (!existing) {
      return jsonError("シフトが見つかりません", 404);
    }

    const body = await parseJsonBody(request, shiftInputSchema);
    if (!body.success) {
      return body.response;
    }

    const workplaceResult = await requireOwnedWorkplace(
      body.data.workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    let built: Awaited<ReturnType<typeof buildShiftData>>;
    try {
      built = await buildShiftData(body.data, workplaceResult.workplace.type);
    } catch (error) {
      if (error instanceof ShiftValidationError) {
        return jsonError(error.message, 400);
      }
      throw error;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.update({
        where: { id },
        data: built.shiftData,
      });

      if (built.lessonRange) {
        await tx.shiftLessonRange.upsert({
          where: { shiftId: id },
          create: {
            shiftId: id,
            startPeriod: built.lessonRange.startPeriod,
            endPeriod: built.lessonRange.endPeriod,
          },
          update: {
            startPeriod: built.lessonRange.startPeriod,
            endPeriod: built.lessonRange.endPeriod,
          },
        });
      } else {
        await tx.shiftLessonRange.deleteMany({ where: { shiftId: id } });
      }

      return tx.shift.findUnique({
        where: { id: shift.id },
        include: {
          lessonRange: true,
          workplace: true,
        },
      });
    });

    const syncResult = updated
      ? await syncShiftAfterUpdate(updated.id, current.user.id)
      : null;

    const latest = updated
      ? await prisma.shift.findUnique({
          where: { id: updated.id },
          include: {
            lessonRange: true,
            workplace: true,
          },
        })
      : null;

    return NextResponse.json({ data: latest, sync: syncResult });
  } catch (error) {
    console.error("PUT /api/shifts/:id failed", error);
    return jsonError("シフト更新に失敗しました", 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const csrfError = verifyMutationRequest(request);
    if (csrfError) {
      return csrfError;
    }

    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { id } = await context.params;
    const existing = await prisma.shift.findUnique({
      where: { id },
      include: {
        lessonRange: true,
        workplace: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (!existing) {
      return jsonError("シフトが見つかりません", 404);
    }

    if (existing.workplace.userId !== current.user.id) {
      return jsonError("このシフトを削除する権限がありません", 403);
    }

    const syncResult = await syncShiftDeletion(
      id,
      current.user.id,
      existing.googleEventId,
    );
    await prisma.$transaction(async (tx) => {
      await tx.shiftLessonRange.deleteMany({ where: { shiftId: id } });
      await tx.shift.delete({ where: { id } });
    });

    return NextResponse.json({
      id,
      message: "Shift deleted successfully",
      sync: syncResult,
    });
  } catch (error) {
    console.error("DELETE /api/shifts/:id failed", error);
    return jsonError("シフト削除に失敗しました", 500);
  }
}

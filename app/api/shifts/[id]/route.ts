import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

function revalidateShiftRelatedPaths(): void {
  revalidatePath("/my");
  revalidatePath("/my/shifts/list");
  revalidatePath("/my/shifts/confirm");
  revalidatePath("/my/summary");
  revalidatePath("/my/payroll-details/monthly");
  revalidatePath("/my/payroll-details/workplace-yearly");
}

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
      workplace: {
        select: {
          id: true,
          name: true,
          color: true,
          type: true,
        },
      },
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
          update: {
            timetableSetId: built.lessonRange.timetableSetId,
            startPeriod: built.lessonRange.startPeriod,
            endPeriod: built.lessonRange.endPeriod,
          },
          create: {
            shiftId: id,
            timetableSetId: built.lessonRange.timetableSetId,
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
          workplace: {
            select: {
              id: true,
              name: true,
              color: true,
              type: true,
            },
          },
        },
      });
    });

    if (updated) {
      after(async () => {
        try {
          await syncShiftAfterUpdate(updated.id, current.user.id);
        } catch (error) {
          console.error("PUT /api/shifts/:id background sync failed", {
            userId: current.user.id,
            shiftId: updated.id,
            error,
          });
        }
      });
    }

    revalidateShiftRelatedPaths();

    return NextResponse.json({
      data: updated,
      syncStatus: updated ? "pending" : null,
    });
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

    await prisma.shift.delete({ where: { id } });

    revalidateShiftRelatedPaths();

    after(async () => {
      try {
        await syncShiftDeletion(id, current.user.id, existing.googleEventId);
      } catch (error) {
        console.error("DELETE /api/shifts/:id background sync failed", {
          userId: current.user.id,
          shiftId: id,
          googleEventId: existing.googleEventId,
          error,
        });
      }
    });

    return NextResponse.json({
      id,
      message: "Shift deleted successfully",
      syncStatus: "pending",
    });
  } catch (error) {
    console.error("DELETE /api/shifts/:id failed", error);
    return jsonError("シフト削除に失敗しました", 500);
  }
}

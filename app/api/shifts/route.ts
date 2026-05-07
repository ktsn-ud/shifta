import { after } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";
import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
import { getMonthShifts } from "@/lib/shifts/month-shifts";
import {
  syncShiftAfterCreate,
  syncShiftDeletion,
} from "@/lib/google-calendar/syncStatus";
import {
  buildShiftData,
  ShiftValidationError,
  shiftInputSchema,
} from "./_shared";

const shiftListQuerySchema = z
  .object({
    workplaceId: z.string().min(1).optional(),
    startDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください")
      .optional(),
    endDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください")
      .optional(),
    includeEstimate: z.enum(["true", "false"]).optional(),
  })
  .refine(
    (value) => {
      if (!value.startDate || !value.endDate) {
        return true;
      }

      return parseDateOnly(value.startDate) <= parseDateOnly(value.endDate);
    },
    {
      message: "startDate は endDate 以下で指定してください",
    },
  );

const shiftBulkDeleteSchema = z
  .object({
    shiftIds: z.array(z.string().min(1)).min(1).max(100),
  })
  .strict();

function revalidateShiftMutationTags(input: {
  userId: string;
  workplaceIds?: string[];
}): void {
  revalidateShiftDomainTags({ userId: input.userId });

  const workplaceIds = input.workplaceIds ?? [];
  for (const workplaceId of new Set(workplaceIds)) {
    revalidateShiftDomainTags({ userId: input.userId, workplaceId });
  }
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
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

    const created = await prisma.shift.create({
      data: {
        ...built.shiftData,
        ...(built.lessonRange
          ? {
              lessonRange: {
                create: {
                  timetableSetId: built.lessonRange.timetableSetId,
                  startPeriod: built.lessonRange.startPeriod,
                  endPeriod: built.lessonRange.endPeriod,
                },
              },
            }
          : {}),
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

    if (created) {
      after(async () => {
        try {
          await syncShiftAfterCreate(created.id, current.user.id);
        } catch (error) {
          console.error("POST /api/shifts background sync failed", {
            userId: current.user.id,
            shiftId: created.id,
            error,
          });
        }
      });
    }

    revalidateShiftMutationTags({
      userId: current.user.id,
      workplaceIds: [body.data.workplaceId],
    });

    return jsonNoStore(
      {
        data: created,
        syncStatus: created ? "pending" : null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/shifts failed", error);
    return jsonError("シフトの作成に失敗しました", 500);
  }
}

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = shiftListQuerySchema.safeParse({
      workplaceId: url.searchParams.get("workplaceId") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
      includeEstimate: url.searchParams.get("includeEstimate") ?? undefined,
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    if (query.data.workplaceId) {
      const workplaceResult = await requireOwnedWorkplace(
        query.data.workplaceId,
        current.user.id,
      );

      if ("response" in workplaceResult) {
        return workplaceResult.response;
      }
    }

    const shifts = await getMonthShifts({
      userId: current.user.id,
      startDate: query.data.startDate ?? "1900-01-01",
      endDate: query.data.endDate ?? "2999-12-31",
      includeEstimate: query.data.includeEstimate === "true",
      workplaceIds: query.data.workplaceId
        ? [query.data.workplaceId]
        : undefined,
    });

    return jsonNoStore({ data: shifts });
  } catch (error) {
    console.error("GET /api/shifts failed", error);
    return jsonError("シフト一覧の取得に失敗しました", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const body = await parseJsonBody(request, shiftBulkDeleteSchema);
    if (!body.success) {
      return body.response;
    }

    const uniqueShiftIds = Array.from(new Set(body.data.shiftIds));
    if (uniqueShiftIds.length === 0) {
      return jsonError("削除対象のシフトが指定されていません", 400);
    }

    const targets = await prisma.shift.findMany({
      where: {
        id: {
          in: uniqueShiftIds,
        },
      },
      select: {
        id: true,
        googleEventId: true,
        workplace: {
          select: {
            userId: true,
            id: true,
          },
        },
      },
    });

    if (targets.length !== uniqueShiftIds.length) {
      return jsonError("削除対象のシフトが見つかりません", 404);
    }

    const unauthorized = targets.find(
      (target) => target.workplace.userId !== current.user.id,
    );
    if (unauthorized) {
      return jsonError("このシフトを削除する権限がありません", 403);
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.shift.deleteMany({
        where: {
          id: {
            in: uniqueShiftIds,
          },
          workplace: {
            userId: current.user.id,
          },
        },
      });

      if (deleted.count !== uniqueShiftIds.length) {
        throw new Error("SHIFT_BULK_DELETE_CONFLICT");
      }
    });

    revalidateShiftMutationTags({
      userId: current.user.id,
      workplaceIds: targets.map((target) => target.workplace.id),
    });

    after(async () => {
      const results = await Promise.allSettled(
        targets.map(async (target) => {
          return syncShiftDeletion(
            target.id,
            current.user.id,
            target.googleEventId,
          );
        }),
      );

      const failedCount = results.filter((result) => {
        if (result.status === "rejected") {
          return true;
        }

        return result.value.ok === false;
      }).length;

      if (failedCount > 0) {
        console.warn("DELETE /api/shifts background sync partially failed", {
          userId: current.user.id,
          total: targets.length,
          failed: failedCount,
        });
      }
    });

    return jsonNoStore({
      deletedIds: uniqueShiftIds,
      deletedCount: uniqueShiftIds.length,
      syncStatus: "pending",
    });
  } catch (error) {
    console.error("DELETE /api/shifts failed", error);
    return jsonError("シフトの一括削除に失敗しました", 500);
  }
}

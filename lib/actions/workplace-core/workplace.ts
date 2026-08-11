import { after, connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";
import {
  buildPendingSyncResponse,
  buildSuccessSyncResponse,
} from "@/lib/google-calendar/sync-response";
import { syncShiftDeletionsAfterWorkplaceDeletion } from "@/lib/google-calendar/syncStatus";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getCachedWorkplaceDetail } from "@/lib/cache/workplace-read-cache";

const colorRegex = /^#[0-9A-Fa-f]{6}$/;
const PAYROLL_DAY_MIN = 1;
const PAYROLL_DAY_MAX = 31;

type Context = {
  params: Promise<{ workplaceId: string }>;
};

type WorkplaceWithCounts = {
  id: string;
  name: string;
  type: "GENERAL" | "CRAM_SCHOOL";
  color: string;
  closingDayType: "DAY_OF_MONTH" | "END_OF_MONTH";
  closingDay: number | null;
  payday: number;
  _count: {
    shifts: number;
    payrollRules: number;
    timetableSets: number;
  };
};

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "P2003"
  );
}

function isWorkplaceDeleteConflictError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === "WORKPLACE_DELETE_CONFLICT"
  );
}

const updateWorkplaceSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(50).optional(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]).optional(),
    color: z
      .string()
      .regex(colorRegex, "HEX形式(#RRGGBB)で入力してください")
      .optional(),
    closingDayType: z.enum(["DAY_OF_MONTH", "END_OF_MONTH"]).optional(),
    closingDay: z.coerce
      .number()
      .int()
      .min(PAYROLL_DAY_MIN)
      .max(PAYROLL_DAY_MAX)
      .nullable()
      .optional(),
    payday: z.coerce
      .number()
      .int()
      .min(PAYROLL_DAY_MIN)
      .max(PAYROLL_DAY_MAX)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "更新対象がありません",
  });

function shouldIncludeCounts(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  const includeCountsParam = searchParams.get("includeCounts");
  if (includeCountsParam === null) {
    return true;
  }

  return includeCountsParam !== "false";
}

async function findOwnedWorkplaceWithCounts(
  id: string,
  userId: string,
): Promise<WorkplaceWithCounts | null> {
  return prisma.workplace.findFirst({
    where: {
      id,
      userId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      color: true,
      closingDayType: true,
      closingDay: true,
      payday: true,
      _count: {
        select: {
          shifts: true,
          payrollRules: true,
          timetableSets: true,
        },
      },
    },
  });
}

export async function GET(request: Request, context: Context) {
  const timing = createRequestTiming("GET /api/workplaces/:id");
  try {
    timing.startStep("connection");
    try {
      await connection();
    } finally {
      timing.endStep("connection");
    }
    const current = await timing.measure("auth", () => requireCurrentUser());
    if ("response" in current) {
      return timing.applyServerTiming(current.response);
    }

    const { workplaceId } = await timing.measure(
      "params",
      () => context.params,
    );
    const includeCounts = shouldIncludeCounts(request);
    const workplace = await timing.measure("workplaceDetail", () =>
      getCachedWorkplaceDetail(current.user.id, workplaceId),
    );

    if (!workplace) {
      return timing.applyServerTiming(jsonError("勤務先が見つかりません", 404));
    }

    if (!includeCounts) {
      const { _count: unusedCount, ...detail } = workplace;
      void unusedCount;
      return timing.applyServerTiming(jsonNoStore({ data: detail }));
    }

    return timing.applyServerTiming(
      jsonNoStore({
        data: workplace,
      }),
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("GET /api/workplaces/:id failed", error);
    return timing.applyServerTiming(
      jsonError("勤務先の取得に失敗しました", 500),
    );
  }
}

export async function updateWorkplaceRouteAction(
  request: Request,
  context: Context,
) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
    const existing = await findOwnedWorkplaceWithCounts(
      workplaceId,
      current.user.id,
    );
    if (!existing) {
      return jsonError("勤務先が見つかりません", 404);
    }

    const body = await parseJsonBody(request, updateWorkplaceSchema);
    if (!body.success) {
      return body.response;
    }

    const hasClosingDay = Object.prototype.hasOwnProperty.call(
      body.data,
      "closingDay",
    );
    const nextClosingDayType =
      body.data.closingDayType ?? existing.closingDayType;
    const nextClosingDay = hasClosingDay
      ? (body.data.closingDay ?? null)
      : existing.closingDay;
    const nextPayday = body.data.payday ?? existing.payday;

    if (
      nextClosingDayType === "END_OF_MONTH" &&
      hasClosingDay &&
      body.data.closingDay !== null
    ) {
      return jsonError("月末締めのとき締日は null で指定してください", 400);
    }

    if (nextClosingDayType === "DAY_OF_MONTH" && nextClosingDay === null) {
      return jsonError("日付指定のとき締日は必須です", 400);
    }

    if (
      nextClosingDayType === "DAY_OF_MONTH" &&
      nextClosingDay === nextPayday
    ) {
      return jsonError("締日と給料日を同日に設定することはできません", 400);
    }

    const workplace = await prisma.workplace.update({
      where: { id: workplaceId },
      data: {
        ...body.data,
        closingDayType: nextClosingDayType,
        closingDay:
          nextClosingDayType === "END_OF_MONTH" ? null : nextClosingDay,
        payday: nextPayday,
      },
    });

    return jsonNoStore({
      data: workplace,
      sync: buildSuccessSyncResponse(),
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("PUT /api/workplaces/:id failed", error);
    return jsonError("勤務先の更新に失敗しました", 500);
  }
}

export async function deleteWorkplaceRouteAction(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
    const existing = await findOwnedWorkplaceWithCounts(
      workplaceId,
      current.user.id,
    );
    if (!existing) {
      return jsonError("勤務先が見つかりません", 404);
    }

    const deletedWorkplace = await prisma.$transaction(async (tx) => {
      const latest = await tx.workplace.findFirst({
        where: {
          id: workplaceId,
          userId: current.user.id,
        },
        select: {
          shifts: {
            where: {
              googleEventId: {
                not: null,
              },
            },
            select: {
              id: true,
              googleEventId: true,
            },
          },
          _count: {
            select: {
              shifts: true,
              payrollRules: true,
              timetableSets: true,
              actualPayrolls: true,
            },
          },
        },
      });

      if (!latest) {
        throw new Error("WORKPLACE_DELETE_CONFLICT");
      }

      await tx.shiftLessonRange.deleteMany({
        where: {
          timetableSet: {
            workplaceId,
          },
        },
      });
      await tx.workplace.delete({ where: { id: workplaceId } });

      return latest;
    });

    const relatedCounts = {
      shifts: deletedWorkplace._count.shifts,
      payrollRules: deletedWorkplace._count.payrollRules,
      timetableSets: deletedWorkplace._count.timetableSets,
      actualPayrolls: deletedWorkplace._count.actualPayrolls,
    };
    const shiftDeletionTargets = deletedWorkplace.shifts.flatMap((shift) =>
      shift.googleEventId === null
        ? []
        : [{ id: shift.id, googleEventId: shift.googleEventId }],
    );

    if (shiftDeletionTargets.length > 0) {
      after(async () => {
        try {
          const summary = await syncShiftDeletionsAfterWorkplaceDeletion(
            shiftDeletionTargets,
            current.user.id,
          );

          if (summary.failed > 0) {
            console.warn(
              "DELETE /api/workplaces/:id background sync partially failed",
              summary,
            );
          }
        } catch {
          console.warn(
            "DELETE /api/workplaces/:id background sync partially failed",
            {
              total: shiftDeletionTargets.length,
              failed: shiftDeletionTargets.length,
            },
          );
        }
      });
    }

    return jsonNoStore({
      data: {
        id: workplaceId,
        deleted: true,
        relatedCounts,
      },
      sync:
        shiftDeletionTargets.length > 0
          ? buildPendingSyncResponse()
          : buildSuccessSyncResponse(),
      warning:
        relatedCounts.shifts +
          relatedCounts.payrollRules +
          relatedCounts.timetableSets +
          relatedCounts.actualPayrolls >
        0
          ? "関連データをCASCADE削除しました"
          : null,
    });
  } catch (error) {
    unstable_rethrow(error);
    if (
      isForeignKeyConstraintError(error) ||
      isWorkplaceDeleteConflictError(error)
    ) {
      return jsonError("勤務先の削除中にデータ競合が発生しました", 409);
    }

    console.error("DELETE /api/workplaces/:id failed", error);
    return jsonError("勤務先の削除に失敗しました", 500);
  }
}

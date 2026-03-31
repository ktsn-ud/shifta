import { type Prisma } from "@/lib/generated/prisma/client";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { calculateWorkedMinutes } from "@/lib/payroll/estimate";
import {
  calculateShiftPayrollResultByRule,
  findApplicablePayrollRule,
  groupPayrollRulesByWorkplace,
} from "@/lib/payroll/summarizeByPeriod";
import { prisma } from "@/lib/prisma";
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

    const created = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({ data: built.shiftData });

      if (built.lessonRange) {
        await tx.shiftLessonRange.create({
          data: {
            shiftId: shift.id,
            startPeriod: built.lessonRange.startPeriod,
            endPeriod: built.lessonRange.endPeriod,
          },
        });
      }

      return tx.shift.findUnique({
        where: { id: shift.id },
        include: {
          lessonRange: true,
          workplace: true,
        },
      });
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

    const latest = created
      ? await prisma.shift.findUnique({
          where: { id: created.id },
          include: {
            lessonRange: true,
            workplace: true,
          },
        })
      : null;

    return NextResponse.json(
      {
        data: latest,
        syncStatus: latest ? "pending" : null,
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

    const where: Prisma.ShiftWhereInput = {
      workplace: { userId: current.user.id },
    };

    if (query.data.workplaceId) {
      where.workplaceId = query.data.workplaceId;
    }

    if (query.data.startDate || query.data.endDate) {
      where.date = {
        ...(query.data.startDate
          ? { gte: parseDateOnly(query.data.startDate) }
          : {}),
        ...(query.data.endDate
          ? { lte: parseDateOnly(query.data.endDate) }
          : {}),
      };
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        lessonRange: true,
        workplace: true,
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    });

    if (query.data.includeEstimate !== "true") {
      return NextResponse.json({ data: shifts });
    }

    const workplaceIds = Array.from(
      new Set(shifts.map((shift) => shift.workplaceId)),
    );

    if (workplaceIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const payrollRules = await prisma.payrollRule.findMany({
      where: {
        workplaceId: {
          in: workplaceIds,
        },
      },
      orderBy: [{ workplaceId: "asc" }, { startDate: "desc" }],
    });

    const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);

    const withEstimate = shifts.map((shift) => {
      const workedMinutes = calculateWorkedMinutes({
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
        shiftType: shift.shiftType,
        lessonRange: shift.lessonRange
          ? {
              startPeriod: shift.lessonRange.startPeriod,
              endPeriod: shift.lessonRange.endPeriod,
            }
          : null,
      });
      const selectedRule = findApplicablePayrollRule(
        rulesByWorkplace,
        shift.workplaceId,
        shift.date,
      );
      const estimatedPay = selectedRule
        ? calculateShiftPayrollResultByRule(shift, selectedRule).totalWage
        : null;

      return {
        ...shift,
        workedMinutes,
        estimatedPay,
      };
    });

    return NextResponse.json({ data: withEstimate });
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
      await tx.shiftLessonRange.deleteMany({
        where: {
          shiftId: {
            in: uniqueShiftIds,
          },
        },
      });

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

    return NextResponse.json({
      deletedIds: uniqueShiftIds,
      deletedCount: uniqueShiftIds.length,
      syncStatus: "pending",
    });
  } catch (error) {
    console.error("DELETE /api/shifts failed", error);
    return jsonError("シフトの一括削除に失敗しました", 500);
  }
}

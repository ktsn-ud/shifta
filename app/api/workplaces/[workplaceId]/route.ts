import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  jsonError,
  parseJsonBody,
  verifyMutationRequest,
} from "@/lib/api/http";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";
import { buildSuccessSyncResponse } from "@/lib/google-calendar/sync-response";
import { revalidateWorkplaceDomainTags } from "@/lib/cache/revalidate";

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

type WorkplaceDetail = Omit<WorkplaceWithCounts, "_count">;

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

async function findOwnedWorkplaceDetail(
  id: string,
  userId: string,
): Promise<WorkplaceDetail | null> {
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
    },
  });
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
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
    const includeCounts = shouldIncludeCounts(request);
    const workplace = includeCounts
      ? await findOwnedWorkplaceWithCounts(workplaceId, current.user.id)
      : await findOwnedWorkplaceDetail(workplaceId, current.user.id);

    if (!workplace) {
      return jsonError("勤務先が見つかりません", 404);
    }

    if (!includeCounts) {
      return jsonNoStore({ data: workplace });
    }

    return jsonNoStore({
      data: workplace,
    });
  } catch (error) {
    console.error("GET /api/workplaces/:id failed", error);
    return jsonError("勤務先の取得に失敗しました", 500);
  }
}

export async function PUT(request: Request, context: Context) {
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

    revalidateWorkplaceDomainTags({
      userId: current.user.id,
      workplaceId,
    });

    return jsonNoStore({
      data: workplace,
      sync: buildSuccessSyncResponse(),
    });
  } catch (error) {
    console.error("PUT /api/workplaces/:id failed", error);
    return jsonError("勤務先の更新に失敗しました", 500);
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

    const { workplaceId } = await context.params;
    const existing = await findOwnedWorkplaceWithCounts(
      workplaceId,
      current.user.id,
    );
    if (!existing) {
      return jsonError("勤務先が見つかりません", 404);
    }

    const relatedCounts = {
      shifts: existing._count.shifts,
      payrollRules: existing._count.payrollRules,
      timetableSets: existing._count.timetableSets,
    };

    await prisma.workplace.delete({ where: { id: workplaceId } });

    revalidateWorkplaceDomainTags({
      userId: current.user.id,
      workplaceId,
    });

    return jsonNoStore({
      data: {
        id: workplaceId,
        deleted: true,
        relatedCounts,
      },
      sync: buildSuccessSyncResponse(),
      warning:
        relatedCounts.shifts +
          relatedCounts.payrollRules +
          relatedCounts.timetableSets >
        0
          ? "関連データをCASCADE削除しました"
          : null,
    });
  } catch (error) {
    console.error("DELETE /api/workplaces/:id failed", error);
    return jsonError("勤務先の削除に失敗しました", 500);
  }
}

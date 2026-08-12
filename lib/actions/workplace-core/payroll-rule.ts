import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";
import { buildSuccessSyncResponse } from "@/lib/google-calendar/sync-response";
import { getCachedPayrollRule } from "@/lib/cache/workplace-read-cache";
import {
  buildOverlappingPayrollRuleWhere,
  normalizePayrollRule,
  type NormalizedPayrollRule,
  validatePayrollRuleForWorkplaceType,
} from "@/lib/actions/workplace-core/payroll-rule-utils";

const payrollRuleSchema = z.strictObject({
  startDate: z
    .string()
    .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
  endDate: z
    .string()
    .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください")
    .nullable()
    .optional(),
  baseHourlyWage: z.coerce.number().positive(),
  holidayAllowanceHourly: z.coerce.number().min(0).optional().default(0),
  nightPremiumRate: z.coerce.number().min(0),
  overtimePremiumRate: z.coerce.number().min(0),
  dailyOvertimeThreshold: z.coerce.number().positive(),
  holidayType: z.enum(["NONE", "WEEKEND", "HOLIDAY", "WEEKEND_HOLIDAY"]),
});

type Context = {
  params: Promise<{ workplaceId: string; id: string }>;
};

async function findOverlappingRules(
  workplaceId: string,
  normalized: NormalizedPayrollRule,
  excludeId?: string,
) {
  return prisma.payrollRule.findMany({
    where: buildOverlappingPayrollRuleWhere(workplaceId, normalized, excludeId),
    select: {
      id: true,
    },
  });
}

async function findPayrollRule(id: string, workplaceId: string) {
  return prisma.payrollRule.findFirst({
    where: {
      id,
      workplaceId,
    },
  });
}

export async function GET(_: Request, context: Context) {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId, id } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    const rule = await getCachedPayrollRule(current.user.id, workplaceId, id);
    if (!rule) {
      return jsonError("給与ルールが見つかりません", 404);
    }

    return jsonNoStore({ data: rule });
  } catch (error) {
    console.error(
      "GET /api/workplaces/:workplaceId/payroll-rules/:id failed",
      error,
    );
    return jsonError("給与ルールの取得に失敗しました", 500);
  }
}

export async function updatePayrollRuleRouteAction(
  request: Request,
  context: Context,
) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId, id } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    const existing = await findPayrollRule(id, workplaceId);
    if (!existing) {
      return jsonError("給与ルールが見つかりません", 404);
    }

    const body = await parseJsonBody(request, payrollRuleSchema);
    if (!body.success) {
      return body.response;
    }

    let normalized: NormalizedPayrollRule;
    try {
      normalized = normalizePayrollRule(body.data);
    } catch (error) {
      if (error instanceof Error && error.message === "DATE_RANGE_INVALID") {
        return jsonError(
          "endDate は startDate より後の日付にしてください",
          400,
        );
      }
      return jsonError("日付の形式が不正です", 400);
    }

    const typeValidationError = validatePayrollRuleForWorkplaceType(
      workplaceResult.workplace.type,
      normalized,
    );
    if (typeValidationError) {
      return jsonError(typeValidationError, 400);
    }

    const overlaps = await findOverlappingRules(workplaceId, normalized, id);

    const rule = await prisma.payrollRule.update({
      where: { id },
      data: {
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        baseHourlyWage: normalized.baseHourlyWage.toString(),
        holidayAllowanceHourly: normalized.holidayAllowanceHourly.toString(),
        nightPremiumRate: normalized.nightPremiumRate.toString(),
        overtimePremiumRate: normalized.overtimePremiumRate.toString(),
        dailyOvertimeThreshold: normalized.dailyOvertimeThreshold.toString(),
        holidayType: normalized.holidayType,
      },
    });

    return jsonNoStore({
      data: rule,
      sync: buildSuccessSyncResponse(),
      warning:
        overlaps.length > 0
          ? {
              message: "同一勤務先内で適用期間が重複しています",
              overlappingRuleIds: overlaps.map((item) => item.id),
            }
          : null,
    });
  } catch (error) {
    console.error(
      "PUT /api/workplaces/:workplaceId/payroll-rules/:id failed",
      error,
    );
    return jsonError("給与ルールの更新に失敗しました", 500);
  }
}

export async function deletePayrollRuleRouteAction(
  _: Request,
  context: Context,
) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId, id } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    const existing = await findPayrollRule(id, workplaceId);
    if (!existing) {
      return jsonError("給与ルールが見つかりません", 404);
    }

    await prisma.payrollRule.delete({ where: { id } });

    return jsonNoStore({
      data: {
        id,
        deleted: true,
      },
      sync: buildSuccessSyncResponse(),
    });
  } catch (error) {
    console.error(
      "DELETE /api/workplaces/:workplaceId/payroll-rules/:id failed",
      error,
    );
    return jsonError("給与ルールの削除に失敗しました", 500);
  }
}

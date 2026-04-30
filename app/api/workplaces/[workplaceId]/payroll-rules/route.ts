import { NextResponse } from "next/server";
import { type Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly, DATE_ONLY_REGEX } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { requireOwnedWorkplace } from "@/lib/api/workplace";
import { prisma } from "@/lib/prisma";

const payrollRuleSchema = z
  .object({
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
  })
  .strict();

type Context = {
  params: Promise<{ workplaceId: string }>;
};

type NormalizedPayrollRule = {
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: number;
  holidayAllowanceHourly: number;
  nightPremiumRate: number;
  overtimePremiumRate: number;
  dailyOvertimeThreshold: number;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
};

function normalizePayrollRule(
  input: z.infer<typeof payrollRuleSchema>,
): NormalizedPayrollRule {
  const startDate = parseDateOnly(input.startDate);
  const endDate = input.endDate ? parseDateOnly(input.endDate) : null;

  if (endDate && endDate <= startDate) {
    throw new Error("DATE_RANGE_INVALID");
  }

  return {
    startDate,
    endDate,
    baseHourlyWage: input.baseHourlyWage,
    holidayAllowanceHourly: input.holidayAllowanceHourly,
    nightPremiumRate: input.nightPremiumRate,
    overtimePremiumRate: input.overtimePremiumRate,
    dailyOvertimeThreshold: input.dailyOvertimeThreshold,
    holidayType: input.holidayType,
  };
}

function buildOverlappingPayrollRuleWhere(
  workplaceId: string,
  normalized: NormalizedPayrollRule,
  excludeId?: string,
): Prisma.PayrollRuleWhereInput {
  return {
    workplaceId,
    ...(excludeId ? { id: { not: excludeId } } : {}),
    ...(normalized.endDate
      ? {
          startDate: {
            lt: normalized.endDate,
          },
        }
      : {}),
    OR: [
      { endDate: null },
      {
        endDate: {
          gt: normalized.startDate,
        },
      },
    ],
  };
}

async function findOverlappingRules(
  db: Prisma.TransactionClient | typeof prisma,
  workplaceId: string,
  normalized: NormalizedPayrollRule,
  excludeId?: string,
) {
  return db.payrollRule.findMany({
    where: buildOverlappingPayrollRuleWhere(workplaceId, normalized, excludeId),
    select: {
      id: true,
    },
  });
}

function validateByWorkplaceType(
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
  normalized: NormalizedPayrollRule,
): string | null {
  if (normalized.baseHourlyWage <= 0) {
    return `${workplaceType}勤務先では baseHourlyWage を正の数で指定してください`;
  }

  return null;
}

export async function POST(request: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
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

    const typeValidationError = validateByWorkplaceType(
      workplaceResult.workplace.type,
      normalized,
    );
    if (typeValidationError) {
      return jsonError(typeValidationError, 400);
    }

    const { payrollRule, overlaps } = await prisma.$transaction(async (tx) => {
      const currentOverlappedRule = await tx.payrollRule.findFirst({
        where: {
          workplaceId,
          endDate: null,
          startDate: {
            lt: normalized.startDate,
          },
        },
        orderBy: [{ startDate: "desc" }],
        select: {
          id: true,
        },
      });

      if (currentOverlappedRule) {
        await tx.payrollRule.update({
          where: {
            id: currentOverlappedRule.id,
          },
          data: {
            endDate: normalized.startDate,
          },
        });
      }

      const overlaps = await findOverlappingRules(tx, workplaceId, normalized);

      const payrollRule = await tx.payrollRule.create({
        data: {
          workplaceId,
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

      return { payrollRule, overlaps };
    });

    return NextResponse.json(
      {
        data: payrollRule,
        warning:
          overlaps.length > 0
            ? {
                message: "同一勤務先内で適用期間が重複しています",
                overlappingRuleIds: overlaps.map((rule) => rule.id),
              }
            : null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "POST /api/workplaces/:workplaceId/payroll-rules failed",
      error,
    );
    return jsonError("給与ルールの作成に失敗しました", 500);
  }
}

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { workplaceId } = await context.params;
    const workplaceResult = await requireOwnedWorkplace(
      workplaceId,
      current.user.id,
    );
    if ("response" in workplaceResult) {
      return workplaceResult.response;
    }

    const rules = await prisma.payrollRule.findMany({
      where: { workplaceId },
      orderBy: [{ startDate: "desc" }],
    });

    return NextResponse.json({ data: rules });
  } catch (error) {
    console.error(
      "GET /api/workplaces/:workplaceId/payroll-rules failed",
      error,
    );
    return jsonError("給与ルール一覧の取得に失敗しました", 500);
  }
}

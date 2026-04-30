import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

const colorRegex = /^#[0-9A-Fa-f]{6}$/;
const PAYROLL_DAY_MIN = 1;
const PAYROLL_DAY_MAX = 31;

const workplacePayrollCycleBaseSchema = z.object({
  closingDayType: z.enum(["DAY_OF_MONTH", "END_OF_MONTH"]),
  closingDay: z.coerce
    .number()
    .int()
    .min(PAYROLL_DAY_MIN)
    .max(PAYROLL_DAY_MAX)
    .nullable()
    .optional(),
  payday: z.coerce.number().int().min(PAYROLL_DAY_MIN).max(PAYROLL_DAY_MAX),
});

const createInitialPayrollRuleSchema = z
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

const createWorkplaceSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    color: z.string().regex(colorRegex, "HEX形式(#RRGGBB)で入力してください"),
    closingDayType: workplacePayrollCycleBaseSchema.shape.closingDayType,
    closingDay: workplacePayrollCycleBaseSchema.shape.closingDay,
    payday: workplacePayrollCycleBaseSchema.shape.payday,
    initialPayrollRule: createInitialPayrollRuleSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.closingDayType === "DAY_OF_MONTH" && value.closingDay == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closingDay"],
        message: "日付指定のとき締日は必須です",
      });
      return;
    }

    if (value.closingDayType === "END_OF_MONTH" && value.closingDay != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closingDay"],
        message: "月末締めのとき締日は null で指定してください",
      });
      return;
    }

    if (
      value.closingDayType === "DAY_OF_MONTH" &&
      value.closingDay != null &&
      value.closingDay === value.payday
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closingDay"],
        message: "締日と給料日を同日に設定することはできません",
      });
    }
  });

type NormalizedInitialPayrollRule = {
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: number;
  holidayAllowanceHourly: number;
  nightPremiumRate: number;
  overtimePremiumRate: number;
  dailyOvertimeThreshold: number;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
};

function normalizeInitialPayrollRule(
  input: z.infer<typeof createInitialPayrollRuleSchema>,
): NormalizedInitialPayrollRule {
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

function validateByWorkplaceType(
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
  normalized: NormalizedInitialPayrollRule,
): string | null {
  if (normalized.baseHourlyWage <= 0) {
    return `${workplaceType}勤務先では baseHourlyWage を正の数で指定してください`;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const body = await parseJsonBody(request, createWorkplaceSchema);
    if (!body.success) {
      return body.response;
    }

    let normalizedInitialRule: NormalizedInitialPayrollRule | null = null;
    if (body.data.initialPayrollRule) {
      try {
        normalizedInitialRule = normalizeInitialPayrollRule(
          body.data.initialPayrollRule,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "DATE_RANGE_INVALID") {
          return jsonError(
            "initialPayrollRule.endDate は startDate より後の日付にしてください",
            400,
          );
        }

        return jsonError("initialPayrollRule の日付形式が不正です", 400);
      }

      const typeValidationError = validateByWorkplaceType(
        body.data.type,
        normalizedInitialRule,
      );
      if (typeValidationError) {
        return jsonError(typeValidationError, 400);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const workplace = await tx.workplace.create({
        data: {
          userId: current.user.id,
          name: body.data.name,
          type: body.data.type,
          color: body.data.color,
          closingDayType: body.data.closingDayType,
          closingDay:
            body.data.closingDayType === "END_OF_MONTH"
              ? null
              : body.data.closingDay,
          payday: body.data.payday,
        },
      });

      let initialPayrollRule = null;
      if (normalizedInitialRule) {
        initialPayrollRule = await tx.payrollRule.create({
          data: {
            workplaceId: workplace.id,
            startDate: normalizedInitialRule.startDate,
            endDate: normalizedInitialRule.endDate,
            baseHourlyWage: normalizedInitialRule.baseHourlyWage.toString(),
            holidayAllowanceHourly:
              normalizedInitialRule.holidayAllowanceHourly.toString(),
            nightPremiumRate: normalizedInitialRule.nightPremiumRate.toString(),
            overtimePremiumRate:
              normalizedInitialRule.overtimePremiumRate.toString(),
            dailyOvertimeThreshold:
              normalizedInitialRule.dailyOvertimeThreshold.toString(),
            holidayType: normalizedInitialRule.holidayType,
          },
        });
      }

      return { workplace, initialPayrollRule };
    });

    return NextResponse.json(
      { data: result.workplace, initialPayrollRule: result.initialPayrollRule },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/workplaces failed", error);
    return jsonError("勤務先の作成に失敗しました", 500);
  }
}

function shouldIncludeCounts(request: Request): boolean {
  const { searchParams } = new URL(request.url);
  const includeCountsParam = searchParams.get("includeCounts");
  if (includeCountsParam === null) {
    return true;
  }

  return includeCountsParam !== "false";
}

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const includeCounts = shouldIncludeCounts(request);
    if (includeCounts === false) {
      const workplaces = await prisma.workplace.findMany({
        where: { userId: current.user.id },
        select: {
          id: true,
          name: true,
          color: true,
          type: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ data: workplaces });
    }

    const workplaces = await prisma.workplace.findMany({
      where: { userId: current.user.id },
      include: {
        _count: {
          select: {
            shifts: true,
            payrollRules: true,
            timetableSets: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      data: workplaces.map((workplace) => ({
        ...workplace,
        _count: {
          shifts: workplace._count.shifts,
          payrollRules: workplace._count.payrollRules,
          timetableSets: workplace._count.timetableSets,
        },
      })),
    });
  } catch (error) {
    console.error("GET /api/workplaces failed", error);
    return jsonError("勤務先一覧の取得に失敗しました", 500);
  }
}

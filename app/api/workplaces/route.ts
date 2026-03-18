import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  DATE_ONLY_REGEX,
  TIME_ONLY_REGEX,
  parseDateOnly,
  parseTimeOnly,
} from "@/lib/api/date-time";
import { jsonError, parseJsonBody } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

const colorRegex = /^#[0-9A-Fa-f]{6}$/;

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
    perLessonWage: z.coerce.number().positive().nullable().optional(),
    holidayHourlyWage: z.coerce.number().positive().nullable().optional(),
    nightMultiplier: z.coerce.number().min(1),
    overtimeMultiplier: z.coerce.number().min(1),
    nightStart: z
      .string()
      .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    nightEnd: z.string().regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください"),
    dailyOvertimeThreshold: z.coerce.number().positive(),
    holidayType: z.enum(["NONE", "WEEKEND", "HOLIDAY", "WEEKEND_HOLIDAY"]),
  })
  .strict();

const createWorkplaceSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    color: z.string().regex(colorRegex, "HEX形式(#RRGGBB)で入力してください"),
    initialPayrollRule: createInitialPayrollRuleSchema.optional(),
  })
  .strict();

type NormalizedInitialPayrollRule = {
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: number;
  perLessonWage: number | null;
  holidayHourlyWage: number | null;
  nightMultiplier: number;
  overtimeMultiplier: number;
  nightStart: Date;
  nightEnd: Date;
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
    perLessonWage: input.perLessonWage ?? null,
    holidayHourlyWage: input.holidayHourlyWage ?? null,
    nightMultiplier: input.nightMultiplier,
    overtimeMultiplier: input.overtimeMultiplier,
    nightStart: parseTimeOnly(input.nightStart),
    nightEnd: parseTimeOnly(input.nightEnd),
    dailyOvertimeThreshold: input.dailyOvertimeThreshold,
    holidayType: input.holidayType,
  };
}

function validateByWorkplaceType(
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
  normalized: NormalizedInitialPayrollRule,
): string | null {
  if (workplaceType === "GENERAL" && normalized.baseHourlyWage <= 0) {
    return "GENERAL勤務先では baseHourlyWage を正の数で指定してください";
  }

  if (workplaceType === "CRAM_SCHOOL") {
    if (normalized.perLessonWage === null || normalized.perLessonWage <= 0) {
      return "CRAM_SCHOOL勤務先では perLessonWage を正の数で指定してください";
    }
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

        return jsonError(
          "initialPayrollRule の日付または時刻の形式が不正です",
          400,
        );
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
            perLessonWage:
              normalizedInitialRule.perLessonWage === null
                ? null
                : normalizedInitialRule.perLessonWage.toString(),
            holidayHourlyWage:
              normalizedInitialRule.holidayHourlyWage === null
                ? null
                : normalizedInitialRule.holidayHourlyWage.toString(),
            nightMultiplier: normalizedInitialRule.nightMultiplier.toString(),
            overtimeMultiplier:
              normalizedInitialRule.overtimeMultiplier.toString(),
            nightStart: normalizedInitialRule.nightStart,
            nightEnd: normalizedInitialRule.nightEnd,
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

export async function GET() {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const workplaces = await prisma.workplace.findMany({
      where: { userId: current.user.id },
      include: {
        _count: {
          select: {
            shifts: true,
            payrollRules: true,
            timetables: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: workplaces });
  } catch (error) {
    console.error("GET /api/workplaces failed", error);
    return jsonError("勤務先一覧の取得に失敗しました", 500);
  }
}

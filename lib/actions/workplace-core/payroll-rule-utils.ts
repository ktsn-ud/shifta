import { type Prisma } from "@/lib/generated/prisma/client";
import { parseDateOnly } from "@/lib/api/date-time";

type PayrollRuleInput = {
  startDate: string;
  endDate?: string | null;
  baseHourlyWage: number;
  holidayAllowanceHourly: number;
  nightPremiumRate: number;
  overtimePremiumRate: number;
  dailyOvertimeThreshold: number;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
};

export type NormalizedPayrollRule = {
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: number;
  holidayAllowanceHourly: number;
  nightPremiumRate: number;
  overtimePremiumRate: number;
  dailyOvertimeThreshold: number;
  holidayType: PayrollRuleInput["holidayType"];
};

export function normalizePayrollRule(
  input: PayrollRuleInput,
): NormalizedPayrollRule {
  const startDate = parseDateOnly(input.startDate);
  const endDate = input.endDate ? parseDateOnly(input.endDate) : null;

  if (endDate && endDate <= startDate) {
    throw new Error("DATE_RANGE_INVALID");
  }

  return { ...input, startDate, endDate };
}

export function buildOverlappingPayrollRuleWhere(
  workplaceId: string,
  normalized: NormalizedPayrollRule,
  excludeId?: string,
): Prisma.PayrollRuleWhereInput {
  return {
    workplaceId,
    ...(excludeId ? { id: { not: excludeId } } : {}),
    ...(normalized.endDate ? { startDate: { lt: normalized.endDate } } : {}),
    OR: [{ endDate: null }, { endDate: { gt: normalized.startDate } }],
  };
}

export function validatePayrollRuleForWorkplaceType(
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
  normalized: NormalizedPayrollRule,
): string | null {
  if (normalized.baseHourlyWage <= 0) {
    return `${workplaceType}勤務先では baseHourlyWage を正の数で指定してください`;
  }

  return null;
}

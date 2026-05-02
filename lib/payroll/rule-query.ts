import type { Prisma } from "@/lib/generated/prisma/client";

export type PayrollRuleDateRange = {
  startDate: Date;
  endDate: Date;
};

export function resolvePayrollRuleDateRange<T extends { date: Date }>(
  shifts: readonly T[],
): PayrollRuleDateRange | null {
  if (shifts.length === 0) {
    return null;
  }

  let startDate = shifts[0].date;
  let endDate = shifts[0].date;

  for (const shift of shifts) {
    if (shift.date < startDate) {
      startDate = shift.date;
    }
    if (shift.date > endDate) {
      endDate = shift.date;
    }
  }

  return { startDate, endDate };
}

export function buildPayrollRuleWhereForDateRange(
  workplaceIds: readonly string[],
  range: PayrollRuleDateRange,
): Prisma.PayrollRuleWhereInput {
  return {
    workplaceId: {
      in: [...workplaceIds],
    },
    startDate: {
      lte: range.endDate,
    },
    OR: [
      {
        endDate: null,
      },
      {
        endDate: {
          gt: range.startDate,
        },
      },
    ],
  };
}

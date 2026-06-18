import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ActualPayrollAmount = {
  taxableAmount: number;
  nonTaxableAmount: number;
  totalAmount: number;
};

export type ActualPayrollRecord = ActualPayrollAmount & {
  note: string | null;
};

export type PayrollDisplayValue = {
  estimatedAmount: number;
  actualAmount: ActualPayrollAmount | null;
  displayAmount: number;
  differenceAmount: number;
  isActualApplied: boolean;
};

export type ActualPayrollCoverage = ActualPayrollAmount & {
  registeredWorkplaceCount: number;
  totalWorkplaceCount: number;
  isPartial: boolean;
};

export function roundCurrency(value: number): number {
  return Math.round(value);
}

export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function toMonthKeyUtc(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function buildWorkplaceMonthKey(
  workplaceId: string,
  monthKey: string,
): string {
  return `${workplaceId}:${monthKey}`;
}

export function decimalToNumber(
  value: number | string | { toString: () => string } | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = Number(value.toString());
  if (Number.isFinite(numeric) === false) {
    return fallback;
  }

  return numeric;
}

export function toActualPayrollAmount(
  record:
    | {
        taxableAmount: Prisma.Decimal | number | string;
        nonTaxableAmount: Prisma.Decimal | number | string;
      }
    | null
    | undefined,
): ActualPayrollAmount | null {
  if (!record) {
    return null;
  }

  const taxableAmount = roundCurrency(decimalToNumber(record.taxableAmount));
  const nonTaxableAmount = roundCurrency(
    decimalToNumber(record.nonTaxableAmount),
  );

  return {
    taxableAmount,
    nonTaxableAmount,
    totalAmount: taxableAmount + nonTaxableAmount,
  };
}

export function createPayrollDisplayValue(
  estimatedAmount: number,
  actualAmount: ActualPayrollAmount | null,
): PayrollDisplayValue {
  const normalizedEstimated = roundCurrency(estimatedAmount);
  const displayAmount = actualAmount
    ? roundCurrency(actualAmount.totalAmount)
    : normalizedEstimated;

  return {
    estimatedAmount: normalizedEstimated,
    actualAmount,
    displayAmount,
    differenceAmount: displayAmount - normalizedEstimated,
    isActualApplied: actualAmount !== null,
  };
}

export function createEmptyActualPayrollCoverage(
  totalWorkplaceCount: number,
): ActualPayrollCoverage {
  return {
    taxableAmount: 0,
    nonTaxableAmount: 0,
    totalAmount: 0,
    registeredWorkplaceCount: 0,
    totalWorkplaceCount,
    isPartial: false,
  };
}

export function summarizeActualPayrollCoverage(
  records: Array<ActualPayrollAmount | null>,
  totalWorkplaceCount: number,
): ActualPayrollCoverage {
  const coverage = createEmptyActualPayrollCoverage(totalWorkplaceCount);

  for (const record of records) {
    if (!record) {
      continue;
    }

    coverage.taxableAmount += record.taxableAmount;
    coverage.nonTaxableAmount += record.nonTaxableAmount;
    coverage.totalAmount += record.totalAmount;
    coverage.registeredWorkplaceCount += 1;
  }

  coverage.taxableAmount = roundCurrency(coverage.taxableAmount);
  coverage.nonTaxableAmount = roundCurrency(coverage.nonTaxableAmount);
  coverage.totalAmount = roundCurrency(coverage.totalAmount);
  coverage.isPartial =
    coverage.registeredWorkplaceCount > 0 &&
    coverage.registeredWorkplaceCount < totalWorkplaceCount;

  return coverage;
}

export async function getActualPayrollMap(input: {
  workplaceIds: string[];
  monthKeys: string[];
}): Promise<Map<string, ActualPayrollRecord>> {
  if (input.workplaceIds.length === 0 || input.monthKeys.length === 0) {
    return new Map();
  }

  const monthDates = input.monthKeys.map((monthKey) =>
    startOfMonthUtc(new Date(`${monthKey}-01T00:00:00.000Z`)),
  );
  const minMonth = monthDates.reduce((current, value) =>
    value < current ? value : current,
  );
  const maxMonth = monthDates.reduce((current, value) =>
    value > current ? value : current,
  );

  const rows = await prisma.actualPayroll.findMany({
    where: {
      workplaceId: {
        in: input.workplaceIds,
      },
      paymentMonth: {
        gte: minMonth,
        lte: maxMonth,
      },
    },
    select: {
      workplaceId: true,
      paymentMonth: true,
      taxableAmount: true,
      nonTaxableAmount: true,
      note: true,
    },
  });

  const allowedMonths = new Set(input.monthKeys);
  const result = new Map<string, ActualPayrollRecord>();

  for (const row of rows) {
    const monthKey = toMonthKeyUtc(row.paymentMonth);
    if (!allowedMonths.has(monthKey)) {
      continue;
    }

    const amount = toActualPayrollAmount(row);
    if (!amount) {
      continue;
    }

    result.set(buildWorkplaceMonthKey(row.workplaceId, monthKey), {
      ...amount,
      note: row.note,
    });
  }

  return result;
}

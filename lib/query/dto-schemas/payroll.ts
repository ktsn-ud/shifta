import { z } from "zod";
import type { ActualPayrollEditorResult } from "@/lib/payroll/actual-editor";
import type { PayrollDisplayValue } from "@/lib/payroll/actual-payroll";
import type {
  PayrollDetailBreakdownResult,
  PayrollDetailsMonthlyResult,
  PayrollDetailsWorkplaceYearlyResult,
} from "@/lib/payroll/details";
import type { PayrollPreviewBaselineResult } from "@/lib/payroll/preview-baseline";
import type {
  PayrollSummaryAmountResult,
  PayrollSummaryResult,
  PayrollSummaryYearContextResult,
} from "@/lib/payroll/summary";
import {
  dateOnlySchema,
  finiteNumberSchema,
  monthIndexSchema,
  monthKeySchema,
  nonNegativeIntegerSchema,
} from "@/lib/query/dto-schemas/common";

const actualPayrollAmountSchema = z.strictObject({
  taxableAmount: finiteNumberSchema,
  nonTaxableAmount: finiteNumberSchema,
  totalAmount: finiteNumberSchema,
});

const actualPayrollRecordSchema = actualPayrollAmountSchema.extend({
  note: z.string().nullable(),
});

const payrollDisplayValueSchema: z.ZodType<PayrollDisplayValue> =
  z.strictObject({
    estimatedAmount: finiteNumberSchema,
    actualAmount: actualPayrollAmountSchema.nullable(),
    displayAmount: finiteNumberSchema,
    differenceAmount: finiteNumberSchema,
    isActualApplied: z.boolean(),
  });

const actualPayrollCoverageSchema = actualPayrollAmountSchema.extend({
  registeredWorkplaceCount: nonNegativeIntegerSchema,
  totalWorkplaceCount: nonNegativeIntegerSchema,
  isPartial: z.boolean(),
});

const payrollBreakdownSchema: z.ZodType<PayrollDetailBreakdownResult> =
  z.strictObject({
    totalWorkHours: finiteNumberSchema,
    baseHours: finiteNumberSchema,
    holidayHours: finiteNumberSchema,
    nightHours: finiteNumberSchema,
    overtimeHours: finiteNumberSchema,
    totalWage: finiteNumberSchema,
    baseWage: finiteNumberSchema,
    holidayWage: finiteNumberSchema,
    nightWage: finiteNumberSchema,
    workDuration: z.string(),
    baseDuration: z.string(),
    holidayDuration: z.string(),
    nightDuration: z.string(),
    overtimeDuration: z.string(),
    effectiveBaseHourlyWage: finiteNumberSchema.nullable(),
    effectiveHolidayAllowanceHourly: finiteNumberSchema.nullable(),
    effectiveNightHourlyWage: finiteNumberSchema.nullable(),
    effectiveNightPremiumRate: finiteNumberSchema.nullable(),
  });

const payrollSummaryTotalsSchema = z.strictObject({
  taxableAmount: finiteNumberSchema,
  nonTaxableAmount: finiteNumberSchema,
  totalAmount: finiteNumberSchema,
  totalWorkHours: finiteNumberSchema,
});

export const payrollSummaryResponseSchema: z.ZodType<PayrollSummaryResult> =
  z.strictObject({
    year: finiteNumberSchema,
    workplaces: z.array(
      z.strictObject({
        workplaceId: z.string(),
        workplaceName: z.string(),
        workplaceColor: z.string(),
      }),
    ),
    months: z.array(
      z.strictObject({
        month: monthIndexSchema,
        monthKey: monthKeySchema,
        incomeByWorkplace: z.array(
          z.strictObject({
            workplaceId: z.string(),
            taxableAmount: finiteNumberSchema,
            nonTaxableAmount: finiteNumberSchema,
            totalAmount: finiteNumberSchema,
          }),
        ),
        hoursByWorkplace: z.array(
          z.strictObject({
            workplaceId: z.string(),
            totalWorkHours: finiteNumberSchema,
          }),
        ),
        totals: payrollSummaryTotalsSchema,
      }),
    ),
    yearlyTotals: z.strictObject({
      byWorkplace: z.array(
        z.strictObject({
          workplaceId: z.string(),
          taxableAmount: finiteNumberSchema,
          nonTaxableAmount: finiteNumberSchema,
          totalAmount: finiteNumberSchema,
          totalWorkHours: finiteNumberSchema,
        }),
      ),
      grandTotals: payrollSummaryTotalsSchema,
    }),
  });

export const payrollSummaryYearContextResponseSchema: z.ZodType<PayrollSummaryYearContextResult> =
  z.strictObject({
    month: monthKeySchema,
    currentMonthCumulative: finiteNumberSchema,
    yearlyTotal: finiteNumberSchema,
    currentMonthActualCoverage: actualPayrollCoverageSchema,
    yearlyActualCoverage: actualPayrollCoverageSchema,
    estimatedCurrentMonthCumulative: finiteNumberSchema,
    estimatedYearlyTotal: finiteNumberSchema,
  });

export const payrollSummaryAmountResponseSchema: z.ZodType<PayrollSummaryAmountResult> =
  z.strictObject({
    month: monthKeySchema,
    totalWage: finiteNumberSchema,
  });

export const actualPayrollResponseSchema: z.ZodType<ActualPayrollEditorResult> =
  z.strictObject({
    month: monthKeySchema,
    rows: z.array(
      z.strictObject({
        workplaceId: z.string(),
        workplaceName: z.string(),
        workplaceColor: z.string(),
        periodStartDate: dateOnlySchema,
        periodEndDate: dateOnlySchema,
        estimatedAmount: finiteNumberSchema,
        taxableAmount: finiteNumberSchema.nullable(),
        nonTaxableAmount: finiteNumberSchema.nullable(),
        totalActualAmount: finiteNumberSchema.nullable(),
        displayAmount: finiteNumberSchema,
        differenceAmount: finiteNumberSchema,
        note: z.string().nullable(),
        hasActualPayroll: z.boolean(),
      }),
    ),
  });

export const payrollDetailsMonthlyResponseSchema: z.ZodType<PayrollDetailsMonthlyResult> =
  z.strictObject({
    month: monthKeySchema,
    shiftCount: nonNegativeIntegerSchema,
    totals: payrollBreakdownSchema,
    totalsDisplayValue: payrollDisplayValueSchema,
    actualCoverage: actualPayrollCoverageSchema,
    byWorkplace: z.array(
      z.strictObject({
        workplaceId: z.string(),
        workplaceName: z.string(),
        workplaceColor: z.string(),
        periodStartDate: dateOnlySchema,
        periodEndDate: dateOnlySchema,
        displayValue: payrollDisplayValueSchema,
        actualPayroll: actualPayrollRecordSchema.nullable(),
        totalWorkHours: finiteNumberSchema,
        baseHours: finiteNumberSchema,
        holidayHours: finiteNumberSchema,
        nightHours: finiteNumberSchema,
        overtimeHours: finiteNumberSchema,
        totalWage: finiteNumberSchema,
        baseWage: finiteNumberSchema,
        holidayWage: finiteNumberSchema,
        nightWage: finiteNumberSchema,
        workDuration: z.string(),
        baseDuration: z.string(),
        holidayDuration: z.string(),
        nightDuration: z.string(),
        overtimeDuration: z.string(),
        effectiveBaseHourlyWage: finiteNumberSchema.nullable(),
        effectiveHolidayAllowanceHourly: finiteNumberSchema.nullable(),
        effectiveNightHourlyWage: finiteNumberSchema.nullable(),
        effectiveNightPremiumRate: finiteNumberSchema.nullable(),
      }),
    ),
  });

export const payrollDetailsWorkplaceYearlyResponseSchema: z.ZodType<PayrollDetailsWorkplaceYearlyResult> =
  z.strictObject({
    year: finiteNumberSchema,
    shiftCount: nonNegativeIntegerSchema,
    workplaces: z.array(
      z.strictObject({
        workplaceId: z.string(),
        shiftCount: nonNegativeIntegerSchema,
        workplaceName: z.string(),
        workplaceColor: z.string(),
        yearlyTotals: payrollBreakdownSchema,
        yearlyDisplayValue: payrollDisplayValueSchema,
        actualCoverage: actualPayrollCoverageSchema,
        months: z.array(
          z.strictObject({
            month: monthIndexSchema,
            monthKey: monthKeySchema,
            periodStartDate: dateOnlySchema,
            periodEndDate: dateOnlySchema,
            displayValue: payrollDisplayValueSchema,
            actualPayroll: actualPayrollRecordSchema.nullable(),
            totalWorkHours: finiteNumberSchema,
            baseHours: finiteNumberSchema,
            holidayHours: finiteNumberSchema,
            nightHours: finiteNumberSchema,
            overtimeHours: finiteNumberSchema,
            totalWage: finiteNumberSchema,
            baseWage: finiteNumberSchema,
            holidayWage: finiteNumberSchema,
            nightWage: finiteNumberSchema,
            workDuration: z.string(),
            baseDuration: z.string(),
            holidayDuration: z.string(),
            nightDuration: z.string(),
            overtimeDuration: z.string(),
            effectiveBaseHourlyWage: finiteNumberSchema.nullable(),
            effectiveHolidayAllowanceHourly: finiteNumberSchema.nullable(),
            effectiveNightHourlyWage: finiteNumberSchema.nullable(),
            effectiveNightPremiumRate: finiteNumberSchema.nullable(),
          }),
        ),
      }),
    ),
  });

export const payrollPreviewBaselineResponseSchema: z.ZodType<PayrollPreviewBaselineResult> =
  z.strictObject({
    data: z.strictObject({
      months: z.array(
        z.strictObject({
          month: monthKeySchema,
          totalWage: finiteNumberSchema,
          byWorkplace: z.array(
            z.strictObject({
              workplaceId: z.string(),
              wage: finiteNumberSchema,
              periodStartDate: dateOnlySchema,
              periodEndDate: dateOnlySchema,
            }),
          ),
        }),
      ),
    }),
  });

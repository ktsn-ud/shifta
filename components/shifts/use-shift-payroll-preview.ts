"use client";

import { useMemo } from "react";
import {
  calculateShiftPayrollPreview,
  type PreviewPayrollRule,
  type PreviewShiftInput,
  type PreviewTimetableSet,
  type PreviewWorkplace,
} from "@/lib/payroll/preview";
import { usePayrollPreviewBaselineQuery } from "@/lib/query/queries/payroll";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch-json";
import { payrollAnnualPreviewResponseSchema } from "@/lib/query/dto-schemas/payroll";
import { toErrorMessage } from "@/lib/messages";

export type ShiftPayrollPreviewDisplayMonth = {
  month: string;
  baselineWage: number;
  additionalWage: number;
  projectedWage: number;
  shiftCount: number;
  unresolvedCount: number;
  messages: string[];
};

export type ShiftPayrollPreviewDisplayYear = {
  year: number;
  baselineTaxableAmount: number;
  baselineTotalAmount: number;
  additionalTaxableAmount: number;
  additionalTotalAmount: number;
  projectedTaxableAmount: number;
  projectedTotalAmount: number;
};

function parsePayrollAnnualPreviewPayload(
  payload: unknown,
  requestedYears: number[],
) {
  const result = payrollAnnualPreviewResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error("PAYROLL_ANNUAL_PREVIEW_RESPONSE_INVALID");
  }

  const returnedYears = new Set<number>();
  if (result.data.data.years.length !== requestedYears.length) {
    throw new Error("PAYROLL_ANNUAL_PREVIEW_RESPONSE_INVALID");
  }

  const requestedYearSet = new Set(requestedYears);
  for (const item of result.data.data.years) {
    if (!requestedYearSet.has(item.year) || returnedYears.has(item.year)) {
      throw new Error("PAYROLL_ANNUAL_PREVIEW_RESPONSE_INVALID");
    }
    returnedYears.add(item.year);
  }

  return result.data;
}

export function useShiftPayrollPreview(input: {
  userId: string;
  shifts: PreviewShiftInput[];
  workplaces: PreviewWorkplace[];
  payrollRules: PreviewPayrollRule[];
  timetableSets: PreviewTimetableSet[];
}) {
  const previewResult = useMemo(
    () =>
      calculateShiftPayrollPreview({
        shifts: input.shifts,
        workplaces: input.workplaces,
        payrollRules: input.payrollRules,
        timetableSets: input.timetableSets,
      }),
    [input.payrollRules, input.shifts, input.timetableSets, input.workplaces],
  );

  const months = useMemo(
    () => previewResult.months.map((item) => item.month),
    [previewResult.months],
  );

  const baselineQuery = usePayrollPreviewBaselineQuery({
    userId: input.userId,
    months,
    enabled: months.length > 0,
  });

  const baselineByMonth = useMemo(() => {
    const map = new Map<string, number>();
    const baselineMonths = baselineQuery.data?.data.months ?? [];
    for (const item of baselineMonths) {
      map.set(item.month, item.totalAmount);
    }
    return map;
  }, [baselineQuery.data?.data.months]);

  const displayMonths = useMemo<ShiftPayrollPreviewDisplayMonth[]>(() => {
    return previewResult.months.map((month) => {
      const baselineWage = baselineByMonth.get(month.month) ?? 0;
      return {
        month: month.month,
        baselineWage,
        additionalWage: month.additionalTotalAmount,
        projectedWage: baselineWage + month.additionalTotalAmount,
        shiftCount: month.shiftCount,
        unresolvedCount: month.unresolvedCount,
        messages: month.messages,
      };
    });
  }, [baselineByMonth, previewResult.months]);

  const years = useMemo(
    () =>
      Array.from(
        new Set(
          previewResult.months.map((item) => Number(item.month.slice(0, 4))),
        ),
      )
        .filter(Number.isInteger)
        .sort((left, right) => left - right),
    [previewResult.months],
  );
  const annualQuery = useQuery({
    queryKey: ["payroll", "previewAnnual", input.userId, years],
    queryFn: ({ signal }) =>
      fetchJson(`/api/payroll/preview-annual?years=${years.join(",")}`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "年間支給見込の取得に失敗しました。",
        parse: (payload) => parsePayrollAnnualPreviewPayload(payload, years),
      }),
    enabled: years.length > 0,
    staleTime: 30_000,
  });
  const displayYears = useMemo<ShiftPayrollPreviewDisplayYear[]>(() => {
    const baseline = new Map(
      (annualQuery.data?.data.years ?? []).map((item) => [item.year, item]),
    );
    const additions = new Map<number, { taxable: number; total: number }>();
    for (const month of previewResult.months) {
      const year = Number(month.month.slice(0, 4));
      const current = additions.get(year) ?? { taxable: 0, total: 0 };
      current.taxable += month.additionalWage;
      current.total += month.additionalTotalAmount;
      additions.set(year, current);
    }
    return years.map((year) => {
      const current = baseline.get(year);
      const addition = additions.get(year) ?? { taxable: 0, total: 0 };
      return {
        year,
        baselineTaxableAmount: current?.taxableAmount ?? 0,
        baselineTotalAmount: current?.totalAmount ?? 0,
        additionalTaxableAmount: addition.taxable,
        additionalTotalAmount: addition.total,
        projectedTaxableAmount:
          (current?.taxableAmount ?? 0) + addition.taxable,
        projectedTotalAmount: (current?.totalAmount ?? 0) + addition.total,
      };
    });
  }, [annualQuery.data?.data.years, previewResult.months, years]);

  const baselineErrorMessage = baselineQuery.error
    ? toErrorMessage(
        baselineQuery.error,
        "現在の支給見込の取得に失敗しました。追加予定額のみ表示しています。",
      )
    : null;
  const annualErrorMessage = annualQuery.error
    ? toErrorMessage(annualQuery.error, "年間支給見込の取得に失敗しました。")
    : null;
  const isAnnualResponseComplete =
    annualQuery.data?.data.years.length === years.length;

  return {
    items: previewResult.items,
    unresolvedCount: previewResult.unresolvedCount,
    months: displayMonths,
    years: displayYears,
    isBaselineLoading: baselineQuery.isLoading,
    baselineErrorMessage,
    isAnnualLoading: years.length > 0 && annualQuery.isFetching,
    annualErrorMessage,
    isAnnualResponseIncomplete:
      years.length > 0 &&
      !annualQuery.isFetching &&
      !annualErrorMessage &&
      !isAnnualResponseComplete,
  };
}

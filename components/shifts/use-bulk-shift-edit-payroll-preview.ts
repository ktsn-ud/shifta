"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { calculateBulkEditPayrollPreview } from "@/lib/payroll/bulk-edit-preview";
import type {
  PreviewPayrollRule,
  PreviewShiftInput,
  PreviewTimetableSet,
  PreviewWorkplace,
} from "@/lib/payroll/preview";
import { usePayrollPreviewBaselineQuery } from "@/lib/query/queries/payroll";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";
import { payrollAnnualPreviewResponseSchema } from "@/lib/query/dto-schemas/payroll";
import { toErrorMessage } from "@/lib/messages";

export type BulkEditPayrollPreviewMonth = {
  month: string;
  baselineWage: number;
  baselineTransportationAllowance: number;
  baselineTotalAmount: number;
  differenceWage: number;
  differenceTransportationAllowance: number;
  differenceTotalAmount: number;
  projectedWage: number;
  projectedTransportationAllowance: number;
  projectedTotalAmount: number;
  changeCount: number;
  unresolvedCount: number;
  messages: string[];
};

export type BulkEditPayrollPreviewYear = {
  year: number;
  baselineTaxableAmount: number;
  baselineTotalAmount: number;
  differenceTaxableAmount: number;
  differenceTotalAmount: number;
  projectedTaxableAmount: number;
  projectedTotalAmount: number;
  actualPayrollExcludedCount: number;
};

function parseAnnualPayload(payload: unknown, requestedYears: number[]) {
  const result = payrollAnnualPreviewResponseSchema.safeParse(payload);
  if (
    !result.success ||
    result.data.data.years.length !== requestedYears.length
  ) {
    throw new Error("PAYROLL_ANNUAL_PREVIEW_RESPONSE_INVALID");
  }
  const received = new Set(result.data.data.years.map((item) => item.year));
  if (
    received.size !== requestedYears.length ||
    requestedYears.some((year) => !received.has(year))
  ) {
    throw new Error("PAYROLL_ANNUAL_PREVIEW_RESPONSE_INVALID");
  }
  return result.data;
}

export function useBulkShiftEditPayrollPreview(input: {
  userId: string;
  beforeShifts: PreviewShiftInput[];
  afterShifts: PreviewShiftInput[];
  workplaces: PreviewWorkplace[];
  payrollRules: PreviewPayrollRule[];
  timetableSets: PreviewTimetableSet[];
}) {
  const difference = useMemo(
    () =>
      calculateBulkEditPayrollPreview({
        beforeShifts: input.beforeShifts,
        afterShifts: input.afterShifts,
        workplaces: input.workplaces,
        payrollRules: input.payrollRules,
        timetableSets: input.timetableSets,
      }),
    [
      input.afterShifts,
      input.beforeShifts,
      input.payrollRules,
      input.timetableSets,
      input.workplaces,
    ],
  );
  const months = useMemo(
    () => difference.months.map((item) => item.month),
    [difference.months],
  );
  const baselineQuery = usePayrollPreviewBaselineQuery({
    userId: input.userId,
    months,
    enabled: months.length > 0,
  });
  const years = useMemo(
    () =>
      Array.from(new Set(months.map((month) => Number(month.slice(0, 4)))))
        .filter(Number.isInteger)
        .sort((a, b) => a - b),
    [months],
  );
  const annualQuery = useQuery({
    queryKey: queryKeys.payroll.previewAnnual({
      userId: input.userId,
      years,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/payroll/preview-annual?years=${years.join(",")}`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "年間支給見込の取得に失敗しました。",
        parse: (payload) => parseAnnualPayload(payload, years),
      }),
    enabled: years.length > 0,
    staleTime: 30_000,
  });
  const previewMonths = useMemo<BulkEditPayrollPreviewMonth[]>(() => {
    const baseline = new Map(
      (baselineQuery.data?.data.months ?? []).map((item) => [item.month, item]),
    );
    return difference.months.map((item) => {
      const current = baseline.get(item.month);
      const baselineWage = current?.totalWage ?? 0;
      const baselineTransportationAllowance =
        current?.totalTransportationAllowance ?? 0;
      const baselineTotalAmount = current?.totalAmount ?? 0;
      return {
        month: item.month,
        baselineWage,
        baselineTransportationAllowance,
        baselineTotalAmount,
        differenceWage: item.wage,
        differenceTransportationAllowance: item.transportationAllowance,
        differenceTotalAmount: item.totalAmount,
        projectedWage: baselineWage + item.wage,
        projectedTransportationAllowance:
          baselineTransportationAllowance + item.transportationAllowance,
        projectedTotalAmount: baselineTotalAmount + item.totalAmount,
        changeCount: item.changeCount,
        unresolvedCount: item.unresolvedCount,
        messages: item.messages,
      };
    });
  }, [baselineQuery.data?.data.months, difference.months]);
  const previewYears = useMemo<BulkEditPayrollPreviewYear[]>(() => {
    const baseline = new Map(
      (annualQuery.data?.data.years ?? []).map((item) => [item.year, item]),
    );
    const actualKeys = new Set(
      (annualQuery.data?.data.actualPayrollKeys ?? []).map(
        (item) => `${item.workplaceId}:${item.paymentMonth}`,
      ),
    );
    const totals = new Map<
      number,
      { taxable: number; total: number; excludedKeys: Set<string> }
    >();
    for (const item of difference.differences) {
      const year = Number(item.paymentMonth.slice(0, 4));
      const current = totals.get(year) ?? {
        taxable: 0,
        total: 0,
        excludedKeys: new Set<string>(),
      };
      const key = `${item.workplaceId}:${item.paymentMonth}`;
      if (actualKeys.has(key)) {
        current.excludedKeys.add(key);
      } else {
        current.taxable += item.wage;
        current.total += item.wage + item.transportationAllowance;
      }
      totals.set(year, current);
    }
    return years.map((year) => {
      const current = baseline.get(year);
      const differenceForYear = totals.get(year) ?? {
        taxable: 0,
        total: 0,
        excludedKeys: new Set<string>(),
      };
      return {
        year,
        baselineTaxableAmount: current?.taxableAmount ?? 0,
        baselineTotalAmount: current?.totalAmount ?? 0,
        differenceTaxableAmount: differenceForYear.taxable,
        differenceTotalAmount: differenceForYear.total,
        projectedTaxableAmount:
          (current?.taxableAmount ?? 0) + differenceForYear.taxable,
        projectedTotalAmount:
          (current?.totalAmount ?? 0) + differenceForYear.total,
        actualPayrollExcludedCount: differenceForYear.excludedKeys.size,
      };
    });
  }, [
    annualQuery.data?.data.actualPayrollKeys,
    annualQuery.data?.data.years,
    difference.differences,
    years,
  ]);

  const baselineErrorMessage = baselineQuery.error
    ? toErrorMessage(
        baselineQuery.error,
        "現在の支給見込の取得に失敗しました。差分のみ表示しています。",
      )
    : null;
  const annualErrorMessage = annualQuery.error
    ? toErrorMessage(annualQuery.error, "年間支給見込の取得に失敗しました。")
    : null;

  return {
    months: previewMonths,
    years: previewYears,
    unresolvedCount: difference.unresolvedCount,
    isBaselineLoading: baselineQuery.isLoading,
    baselineErrorMessage,
    isAnnualLoading: years.length > 0 && annualQuery.isFetching,
    annualErrorMessage,
    isAnnualResponseIncomplete:
      years.length > 0 &&
      !annualQuery.isFetching &&
      !annualErrorMessage &&
      annualQuery.data?.data.years.length !== years.length,
  };
}

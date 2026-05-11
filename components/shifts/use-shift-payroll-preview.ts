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
      map.set(item.month, item.totalWage);
    }
    return map;
  }, [baselineQuery.data?.data.months]);

  const displayMonths = useMemo<ShiftPayrollPreviewDisplayMonth[]>(() => {
    return previewResult.months.map((month) => {
      const baselineWage = baselineByMonth.get(month.month) ?? 0;
      return {
        month: month.month,
        baselineWage,
        additionalWage: month.additionalWage,
        projectedWage: baselineWage + month.additionalWage,
        shiftCount: month.shiftCount,
        unresolvedCount: month.unresolvedCount,
        messages: month.messages,
      };
    });
  }, [baselineByMonth, previewResult.months]);

  const baselineErrorMessage = baselineQuery.error
    ? toErrorMessage(
        baselineQuery.error,
        "現在の支給見込の取得に失敗しました。追加予定額のみ表示しています。",
      )
    : null;

  return {
    items: previewResult.items,
    unresolvedCount: previewResult.unresolvedCount,
    months: displayMonths,
    isBaselineLoading: baselineQuery.isLoading,
    baselineErrorMessage,
  };
}

"use client";

import { useMemo, useState } from "react";
import { ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  BulkEditPayrollPreviewMonth,
  BulkEditPayrollPreviewYear,
} from "@/components/shifts/use-bulk-shift-edit-payroll-preview";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value));
}

function formatSignedCurrency(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatPaymentMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月支給`;
}

export function BulkShiftEditPayrollPreviewFloating(props: {
  months: BulkEditPayrollPreviewMonth[];
  years: BulkEditPayrollPreviewYear[];
  unresolvedCount: number;
  isBaselineLoading: boolean;
  baselineErrorMessage: string | null;
  isAnnualLoading: boolean;
  annualErrorMessage: string | null;
  isAnnualResponseIncomplete: boolean;
}) {
  const [isExpandedOnMobile, setIsExpandedOnMobile] = useState(false);
  const totalDifference = useMemo(
    () =>
      props.months.reduce(
        (total, item) => total + item.differenceTotalAmount,
        0,
      ),
    [props.months],
  );
  const canShowBaseline =
    !props.isBaselineLoading && props.baselineErrorMessage === null;

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:right-6 md:bottom-6 md:w-[380px]"
      aria-label="支給額への影響プレビュー"
    >
      <div className="mx-3 mb-3 rounded-xl border bg-background/95 shadow-xl backdrop-blur md:mx-0 md:mb-0">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left md:hidden"
          onClick={() => setIsExpandedOnMobile((current) => !current)}
          aria-expanded={isExpandedOnMobile}
          aria-controls="bulk-shift-edit-payroll-preview-body"
        >
          <div>
            <p className="text-sm font-semibold">支給額への影響</p>
            <p className="text-xs text-muted-foreground">
              {props.months.length > 0
                ? `差分 合計 ${formatSignedCurrency(totalDifference)}`
                : "勤務内容を変更すると支給額への影響を確認できます"}
            </p>
          </div>
          <ChevronUpIcon
            className={cn(
              "size-4 transition-transform",
              isExpandedOnMobile ? "rotate-0" : "rotate-180",
            )}
          />
        </button>
        <div
          id="bulk-shift-edit-payroll-preview-body"
          className={cn(
            "space-y-3 border-t px-3 py-3 md:block md:border-t-0",
            isExpandedOnMobile ? "block" : "hidden",
          )}
        >
          <div className="hidden md:block">
            <p className="text-sm font-semibold">支給額への影響</p>
            <p className="text-xs text-muted-foreground">
              変更前との差分を支給月ごとに確認できます
            </p>
          </div>
          {props.baselineErrorMessage ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
              {props.baselineErrorMessage}
            </p>
          ) : null}
          {props.isBaselineLoading ? (
            <p className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
              現在の支給見込を取得中です。
            </p>
          ) : null}
          {props.months.length === 0 ? (
            <p className="rounded-md border px-2 py-2 text-xs text-muted-foreground">
              勤務内容を変更すると支給額への影響を確認できます
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {props.months.map((month) => (
                <section
                  key={month.month}
                  className="space-y-1 rounded-lg border px-2 py-2"
                >
                  <p className="text-xs font-semibold">
                    {formatPaymentMonthLabel(month.month)}
                  </p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    {canShowBaseline ? (
                      <>
                        <span className="text-muted-foreground">変更前</span>
                        <span className="text-right">
                          {formatCurrency(month.baselineTotalAmount)}
                        </span>
                      </>
                    ) : null}
                    <span className="text-muted-foreground">差分</span>
                    <span className="text-right font-medium">
                      {formatSignedCurrency(month.differenceTotalAmount)}
                    </span>
                    {canShowBaseline ? (
                      <>
                        <span className="font-semibold">変更後</span>
                        <span className="text-right text-sm font-semibold">
                          {formatCurrency(month.projectedTotalAmount)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    給与 {formatSignedCurrency(month.differenceWage)} / 交通費{" "}
                    {formatSignedCurrency(
                      month.differenceTransportationAllowance,
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    対象変更: {month.changeCount}件
                    {month.unresolvedCount > 0
                      ? ` / 未計算: ${month.unresolvedCount}件`
                      : ""}
                  </p>
                  {month.messages[0] ? (
                    <p className="text-[11px] text-amber-700">
                      {month.messages[0]}
                    </p>
                  ) : null}
                </section>
              ))}
            </div>
          )}
          {props.unresolvedCount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              入力途中のため、差分に含めていない行があります（
              {props.unresolvedCount}件）。
            </p>
          ) : null}
          {props.years.length > 0 ? (
            <div className="space-y-2 border-t pt-2">
              <p className="text-xs font-semibold">年間支給額への影響</p>
              {props.isAnnualLoading ? (
                <p className="rounded-md border px-2 py-2 text-xs text-muted-foreground">
                  年間支給見込を取得中です。
                </p>
              ) : props.annualErrorMessage ||
                props.isAnnualResponseIncomplete ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-xs text-amber-700">
                  {props.annualErrorMessage ??
                    "年間支給見込の取得に失敗しました。"}
                </p>
              ) : (
                props.years.map((year) => (
                  <section
                    key={year.year}
                    className="rounded-lg border px-2 py-2 text-xs"
                  >
                    <p className="font-semibold">{year.year}年支給</p>
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      <span className="text-muted-foreground" />
                      <span className="text-right text-muted-foreground">
                        給与
                      </span>
                      <span className="text-right text-muted-foreground">
                        総支給額
                      </span>
                      <span>変更前</span>
                      <span className="text-right">
                        {formatCurrency(year.baselineTaxableAmount)}
                      </span>
                      <span className="text-right">
                        {formatCurrency(year.baselineTotalAmount)}
                      </span>
                      <span>差分</span>
                      <span className="text-right">
                        {formatSignedCurrency(year.differenceTaxableAmount)}
                      </span>
                      <span className="text-right">
                        {formatSignedCurrency(year.differenceTotalAmount)}
                      </span>
                      <span className="font-semibold">変更後</span>
                      <span className="text-right font-semibold">
                        {formatCurrency(year.projectedTaxableAmount)}
                      </span>
                      <span className="text-right font-semibold">
                        {formatCurrency(year.projectedTotalAmount)}
                      </span>
                    </div>
                    {year.actualPayrollExcludedCount > 0 ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        実給与登録済みの {year.actualPayrollExcludedCount}
                        件分は差分に含めていません。
                      </p>
                    ) : null}
                  </section>
                ))
              )}
            </div>
          ) : null}
          <div className="md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setIsExpandedOnMobile(false)}
            >
              閉じる
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

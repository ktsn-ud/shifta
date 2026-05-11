"use client";

import { useMemo, useState } from "react";
import { ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ShiftPayrollPreviewDisplayMonth } from "@/components/shifts/use-shift-payroll-preview";

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(Math.round(value));
}

function formatSignedCurrency(value: number): string {
  const absolute = formatCurrency(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${absolute}`;
}

function formatPaymentMonthLabel(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return month;
  }

  return `${year}年${monthNumber}月支給`;
}

export function ShiftPayrollPreviewFloating(props: {
  title?: string;
  months: ShiftPayrollPreviewDisplayMonth[];
  unresolvedCount: number;
  emptyMessage: string;
  baselineErrorMessage?: string | null;
}) {
  const {
    title = "支給額プレビュー",
    months,
    unresolvedCount,
    emptyMessage,
    baselineErrorMessage,
  } = props;
  const [isExpandedOnMobile, setIsExpandedOnMobile] = useState(false);

  const totalAdditional = useMemo(
    () => months.reduce((sum, item) => sum + item.additionalWage, 0),
    [months],
  );

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:right-6 md:bottom-6 md:w-[360px]"
      aria-label={title}
    >
      <div className="mx-3 mb-3 rounded-xl border bg-background/95 shadow-xl backdrop-blur md:mx-0 md:mb-0">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left md:hidden"
          onClick={() => setIsExpandedOnMobile((current) => !current)}
          aria-expanded={isExpandedOnMobile}
          aria-controls="shift-payroll-preview-floating-body"
        >
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">
              {months.length > 0
                ? `追加予定額 合計 ${formatSignedCurrency(totalAdditional)}`
                : emptyMessage}
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
          id="shift-payroll-preview-floating-body"
          className={cn(
            "space-y-3 border-t px-3 py-3 md:block md:border-t-0",
            isExpandedOnMobile ? "block" : "hidden",
          )}
        >
          <div className="hidden md:block">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">
              入力中のシフトを反映した支給見込です
            </p>
          </div>

          {baselineErrorMessage ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
              {baselineErrorMessage}
            </p>
          ) : null}

          {months.length === 0 ? (
            <p className="rounded-md border px-2 py-2 text-xs text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {months.map((month) => {
                const hasOnlyUnresolved =
                  month.shiftCount === 0 && month.unresolvedCount > 0;
                return (
                  <section
                    key={month.month}
                    className="space-y-1 rounded-lg border px-2 py-2"
                  >
                    <p className="text-xs font-semibold">
                      {formatPaymentMonthLabel(month.month)}
                    </p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                      <span className="text-muted-foreground">
                        現在の支給見込
                      </span>
                      <span className="text-right font-medium">
                        {formatCurrency(month.baselineWage)}
                      </span>
                      <span className="text-muted-foreground">追加予定額</span>
                      <span className="text-right font-medium">
                        {hasOnlyUnresolved
                          ? "—"
                          : formatSignedCurrency(month.additionalWage)}
                      </span>
                      <span className="text-muted-foreground">登録後見込</span>
                      <span className="text-right text-sm font-semibold">
                        {hasOnlyUnresolved
                          ? "—"
                          : formatCurrency(month.projectedWage)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      対象シフト数: {month.shiftCount}件
                      {month.unresolvedCount > 0
                        ? ` / 未計算: ${month.unresolvedCount}件`
                        : ""}
                    </p>
                    {month.messages.length > 0 ? (
                      <p className="text-[11px] text-amber-700">
                        {month.messages[0]}
                      </p>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}

          {unresolvedCount > 0 && months.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              入力不備のため未計算の行があります（{unresolvedCount}件）。
            </p>
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

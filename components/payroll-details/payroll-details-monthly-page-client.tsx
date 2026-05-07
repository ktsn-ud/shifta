"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SpinnerPanel } from "@/components/ui/spinner";
import { PayrollDetailsViewSwitch } from "@/components/payroll-details/payroll-details-view-switch";
import { ValueFrame } from "@/components/payroll-details/value-frame";
import { formatCurrency } from "@/components/payroll-details/format";
import {
  formatMonthLabel,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { toErrorMessage } from "@/lib/messages";
import { usePayrollDetailsMonthlyQuery } from "@/lib/query/queries/payroll";
import { type PayrollDetailsMonthlyResult } from "@/lib/payroll/details";

type PayrollDetailsMonthlyPageClientProps = {
  currentUserId: string;
  initialMonth: string;
  initialDetails: PayrollDetailsMonthlyResult;
};

export function PayrollDetailsMonthlyPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">給与詳細（月毎表示）</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          月毎の内訳と計算根拠を読み込み中です。
        </p>
      </header>
      <SpinnerPanel className="min-h-[360px]" label="給与詳細を読み込み中..." />
    </section>
  );
}

export function PayrollDetailsMonthlyPageClient({
  currentUserId,
  initialMonth,
  initialDetails,
}: PayrollDetailsMonthlyPageClientProps) {
  const [draftMonthValue, setDraftMonthValue] = useState(initialMonth);
  const [appliedMonthValue, setAppliedMonthValue] = useState(initialMonth);

  const currentMonthValue = toMonthInputValue(startOfMonth(new Date()));
  const isValidAppliedMonth = fromMonthInputValue(appliedMonthValue) !== null;
  const canApplyMonth =
    fromMonthInputValue(draftMonthValue) !== null &&
    draftMonthValue !== appliedMonthValue;

  const selectedMonthLabel = useMemo(() => {
    const parsed = fromMonthInputValue(appliedMonthValue);
    return parsed ? formatMonthLabel(parsed) : appliedMonthValue;
  }, [appliedMonthValue]);

  const workplaceYearlyHref = "/my/payroll-details/workplace-yearly";

  const applyMonthValue = (nextValue: string) => {
    if (fromMonthInputValue(nextValue) === null) {
      return;
    }

    setAppliedMonthValue(nextValue);
  };

  const handleBackToCurrentMonth = () => {
    setDraftMonthValue(currentMonthValue);
    setAppliedMonthValue(currentMonthValue);
  };

  const detailsQuery = usePayrollDetailsMonthlyQuery({
    userId: currentUserId,
    month: appliedMonthValue,
    enabled: isValidAppliedMonth,
    initialData:
      isValidAppliedMonth && appliedMonthValue === initialMonth
        ? initialDetails
        : undefined,
  });

  const details = detailsQuery.data ?? null;
  const isLoading = isValidAppliedMonth ? detailsQuery.isLoading : false;
  const errorMessage = !isValidAppliedMonth
    ? "月は YYYY-MM 形式で指定してください。"
    : detailsQuery.error
      ? toErrorMessage(
          detailsQuery.error,
          "給与詳細（月毎表示）の取得に失敗しました。",
        )
      : null;
  const hasAnyShift =
    details?.byWorkplace.some(
      (workplace) => workplace.totalWorkHours > 0 || workplace.totalWage > 0,
    ) ?? false;

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">給与詳細（月毎表示）</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedMonthLabel}支給分の内訳を確認できます。
          </p>
        </div>

        <PayrollDetailsViewSwitch
          currentMode="monthly"
          href={workplaceYearlyHref}
        />

        {!isLoading ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackToCurrentMonth}
              disabled={appliedMonthValue === currentMonthValue}
            >
              今月に戻る
            </Button>
            <Input
              type="month"
              value={draftMonthValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyMonthValue(draftMonthValue);
                }
              }}
              onChange={(event) => {
                setDraftMonthValue(event.currentTarget.value);
              }}
              className="w-44"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => applyMonthValue(draftMonthValue)}
              disabled={!canApplyMonth}
            >
              適用
            </Button>
          </div>
        ) : null}
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="給与詳細を読み込み中..."
        />
      ) : details ? (
        <>
          {!hasAnyShift ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              対象月のシフトはありません
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card size="sm">
              <CardHeader>
                <CardTitle>支給合計</CardTitle>
                <CardDescription>{selectedMonthLabel}支給分</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatCurrency(details.totals.totalWage)}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>総勤務時間</CardTitle>
                <CardDescription>休憩控除後の合計</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold">
                  {details.totals.workDuration}
                </p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>基本勤務</CardTitle>
                <CardDescription>時間 / 金額</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-base font-semibold">
                  {details.totals.baseDuration} /{" "}
                  {formatCurrency(details.totals.baseWage)}
                </p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>深夜勤務</CardTitle>
                <CardDescription>時間 / 金額</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-base font-semibold">
                  {details.totals.nightDuration} /{" "}
                  {formatCurrency(details.totals.nightWage)}
                </p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>休日勤務</CardTitle>
                <CardDescription>時間 / 金額</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-base font-semibold">
                  {details.totals.holidayDuration} /{" "}
                  {formatCurrency(details.totals.holidayWage)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>勤務先別内訳</CardTitle>
              <CardDescription>図は横スクロールが可能です。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {details.byWorkplace.map((item) => (
                <div
                  key={`${item.workplaceId}-formula`}
                  className="space-y-3 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center gap-8">
                    <p className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.workplaceColor }}
                        />
                        {item.workplaceName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.periodStartDate} 〜 {item.periodEndDate}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <div className="inline-grid w-max grid-cols-[max-content_auto_max-content] items-center gap-x-1 gap-y-2 text-xs">
                      <div className="flex items-center gap-2 justify-self-start whitespace-nowrap">
                        <ValueFrame
                          label="基本勤務時間"
                          value={item.baseDuration}
                          tone="base"
                        />
                        <span>×</span>
                        <ValueFrame
                          label="適用時給"
                          value={
                            item.effectiveBaseHourlyWage === null
                              ? "-"
                              : formatCurrency(item.effectiveBaseHourlyWage)
                          }
                          tone="neutral"
                        />
                      </div>
                      <span className="font-medium text-muted-foreground">
                        =
                      </span>
                      <ValueFrame
                        label="基本勤務金額"
                        value={formatCurrency(item.baseWage)}
                        tone="base"
                        emphasis="strong"
                      />

                      <div className="flex items-center gap-2 justify-self-start whitespace-nowrap">
                        <ValueFrame
                          label="深夜勤務時間"
                          value={item.nightDuration}
                          tone="night"
                        />
                        <span>×</span>
                        <ValueFrame
                          label="深夜時給(割増込)"
                          value={
                            item.effectiveNightHourlyWage === null
                              ? "-"
                              : formatCurrency(item.effectiveNightHourlyWage)
                          }
                          tone="neutral"
                        />
                      </div>
                      <span className="font-medium text-muted-foreground">
                        =
                      </span>
                      <ValueFrame
                        label="深夜勤務金額"
                        value={formatCurrency(item.nightWage)}
                        tone="night"
                        emphasis="strong"
                      />

                      <div className="flex items-center gap-2 justify-self-start whitespace-nowrap">
                        <ValueFrame
                          label="休日勤務時間"
                          value={item.holidayDuration}
                          tone="holiday"
                        />
                        <span>×</span>
                        <ValueFrame
                          label="休日手当(円/時)"
                          value={
                            item.effectiveHolidayAllowanceHourly === null
                              ? "-"
                              : formatCurrency(
                                  item.effectiveHolidayAllowanceHourly,
                                )
                          }
                          tone="neutral"
                        />
                      </div>
                      <span className="font-medium text-muted-foreground">
                        =
                      </span>
                      <ValueFrame
                        label="休日勤務金額"
                        value={formatCurrency(item.holidayWage)}
                        tone="holiday"
                        emphasis="strong"
                      />

                      <div className="w-full justify-self-stretch space-y-2">
                        <div className="border-t border-foreground/30" />
                        <ValueFrame
                          label="総勤務時間"
                          value={item.workDuration}
                          tone="neutral"
                          emphasis="strong"
                        />
                      </div>
                      <div />
                      <div className="space-y-2">
                        <div className="border-t border-foreground/30" />
                        <ValueFrame
                          label="合計"
                          value={formatCurrency(item.totalWage)}
                          tone="total"
                          emphasis="strong"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}

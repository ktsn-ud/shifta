"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpinnerPanel } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMonthLabel, fromMonthInputValue } from "@/lib/calendar/date";
import { toErrorMessage } from "@/lib/messages";
import { type PayrollSummaryResult } from "@/lib/payroll/summary";
import { usePayrollSummaryQuery } from "@/lib/query/queries/payroll";

type SummaryPageClientProps = {
  currentUserId: string;
  initialSummary: PayrollSummaryResult;
  initialMonth: string;
  currentMonthValue: string;
};

type SummaryHeaderProps = {
  draftMonthValue: string;
  currentMonthValue: string;
  requestedMonthValue: string;
  canApplyMonth: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onDraftMonthValueChange: (value: string) => void;
  onApplyMonth: () => void;
  onBackToCurrentMonth: () => void;
};

type SummaryPrimaryMetricsProps = {
  summary: PayrollSummaryResult;
  selectedMonthLabel: string;
};

type SummarySecondaryMetricsProps = {
  summary: PayrollSummaryResult;
};

type SummaryWorkplaceChartCardProps = {
  byWorkplace: PayrollSummaryResult["byWorkplace"];
};

type SummaryWorkplaceTableCardProps = {
  byWorkplace: PayrollSummaryResult["byWorkplace"];
};

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const WorkplaceWageChart = dynamic(
  () =>
    import("@/components/summary/workplace-wage-chart").then(
      (mod) => mod.WorkplaceWageChart,
    ),
  {
    ssr: false,
    loading: () => (
      <SpinnerPanel className="h-[280px]" label="グラフを読み込み中..." />
    ),
  },
);

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatHours(value: number): string {
  return `${value.toFixed(2)} 時間`;
}

function toWorkplaceChartData(
  byWorkplace: PayrollSummaryResult["byWorkplace"],
) {
  return byWorkplace.map((item) => ({
    workplaceName: item.workplaceName,
    displayWage: item.displayValue.displayAmount,
  }));
}

function SummaryHeader({
  draftMonthValue,
  currentMonthValue,
  requestedMonthValue,
  canApplyMonth,
  isInitialLoading,
  isRefreshing,
  onDraftMonthValueChange,
  onApplyMonth,
  onBackToCurrentMonth,
}: SummaryHeaderProps) {
  return (
    <header className="space-y-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Summary
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">給与サマリー</h2>
        <p className="text-sm text-muted-foreground">
          支給月別の実績優先給与と勤務時間を確認できます。
        </p>
      </div>

      {!isInitialLoading ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackToCurrentMonth}
            disabled={requestedMonthValue === currentMonthValue || isRefreshing}
          >
            今月に戻る
          </Button>
          <Input
            type="month"
            value={draftMonthValue}
            disabled={isRefreshing}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onApplyMonth();
              }
            }}
            onChange={(event) => {
              onDraftMonthValueChange(event.currentTarget.value);
            }}
            className="w-44"
          />
          <Button
            type="button"
            size="sm"
            onClick={onApplyMonth}
            disabled={!canApplyMonth || isRefreshing}
          >
            適用
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function SummaryPrimaryMetrics({
  summary,
  selectedMonthLabel,
}: SummaryPrimaryMetricsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card size="sm" className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>実績支給額</CardTitle>
          <CardDescription>{selectedMonthLabel}支給分</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-3xl font-semibold tracking-tight">
            {formatCurrency(summary.totalWage)}
          </p>
          <p className="text-xs text-muted-foreground">
            課税 {formatCurrency(summary.actualCoverage.taxableAmount)} / 非課税{" "}
            {formatCurrency(summary.actualCoverage.nonTaxableAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.actualCoverage.registeredWorkplaceCount === 0
              ? "実給与は未登録です"
              : summary.actualCoverage.isPartial
                ? `実給与登録済み ${summary.actualCoverage.registeredWorkplaceCount}/${summary.actualCoverage.totalWorkplaceCount} 勤務先`
                : "全勤務先で実給与登録済み"}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>概算給与</CardTitle>
          <CardDescription>シフトから算出した見込額</CardDescription>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatCurrency(summary.estimatedTotalWage)}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>総勤務時間</CardTitle>
          <CardDescription>休憩控除後の合計</CardDescription>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatHours(summary.totalWorkHours)}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>深夜勤務</CardTitle>
          <CardDescription>深夜帯の合計時間</CardDescription>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatHours(summary.totalNightHours)}
        </CardContent>
      </Card>
    </div>
  );
}

function SummarySecondaryMetrics({ summary }: SummarySecondaryMetricsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>確定済み支給額</CardTitle>
          <CardDescription>当月支給分のうち確定済みシフト分</CardDescription>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatCurrency(summary.confirmedShiftWage)}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>年内受取累計（選択月まで）</CardTitle>
          <CardDescription>実績優先の累計表示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold">
            {formatCurrency(summary.currentMonthCumulative)}
          </p>
          <p className="text-xs text-muted-foreground">
            課税{" "}
            {formatCurrency(summary.currentMonthActualCoverage.taxableAmount)} /
            非課税{" "}
            {formatCurrency(
              summary.currentMonthActualCoverage.nonTaxableAmount,
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            概算 {formatCurrency(summary.estimatedCurrentMonthCumulative)}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>年間受取見込（1月〜12月）</CardTitle>
          <CardDescription>実績優先の年間表示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold">
            {formatCurrency(summary.yearlyTotal)}
          </p>
          <p className="text-xs text-muted-foreground">
            課税 {formatCurrency(summary.yearlyActualCoverage.taxableAmount)} /
            非課税{" "}
            {formatCurrency(summary.yearlyActualCoverage.nonTaxableAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            概算 {formatCurrency(summary.estimatedYearlyTotal)}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>残業時間</CardTitle>
          <CardDescription>所定時間超過分</CardDescription>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatHours(summary.totalOvertimeHours)}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryWorkplaceChartCard({
  byWorkplace,
}: SummaryWorkplaceChartCardProps) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle>勤務先別給与</CardTitle>
        <CardDescription>選択月支給分の実績支給額グラフ</CardDescription>
      </CardHeader>
      <CardContent>
        <WorkplaceWageChart byWorkplace={toWorkplaceChartData(byWorkplace)} />
      </CardContent>
    </Card>
  );
}

function SummaryWorkplaceTableCard({
  byWorkplace,
}: SummaryWorkplaceTableCardProps) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle>勤務先別内訳</CardTitle>
        <CardDescription>勤務時間と給与の明細</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-border/70">
          <Table>
            <TableHeader className="bg-muted/35">
              <TableRow>
                <TableHead>勤務先</TableHead>
                <TableHead>対象期間</TableHead>
                <TableHead className="text-right">勤務時間</TableHead>
                <TableHead className="text-right">実績支給額</TableHead>
                <TableHead className="text-right">概算</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byWorkplace.length > 0 ? (
                byWorkplace.map((item) => (
                  <TableRow key={item.workplaceId}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.workplaceColor }}
                        />
                        {item.workplaceName}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.periodStartDate} 〜 {item.periodEndDate}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatHours(item.workHours)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.displayValue.displayAmount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(item.wage)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    対象期間のシフトはありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Summary
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          給与サマリー
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          支給月別の実績優先給与と勤務時間を確認できます。
        </p>
      </header>

      <SpinnerPanel
        className="min-h-[360px]"
        label="給与サマリーを読み込み中..."
      />
    </section>
  );
}

export function SummaryPageClient({
  currentUserId,
  initialSummary,
  initialMonth,
  currentMonthValue,
}: SummaryPageClientProps) {
  const [draftMonthValue, setDraftMonthValue] = useState(initialMonth);
  const [requestedMonthValue, setRequestedMonthValue] = useState(initialMonth);
  const isValidRequestedMonth =
    fromMonthInputValue(requestedMonthValue) !== null;
  const canApplyMonth =
    fromMonthInputValue(draftMonthValue) !== null &&
    draftMonthValue !== requestedMonthValue;

  const summaryQuery = usePayrollSummaryQuery({
    userId: currentUserId,
    month: requestedMonthValue,
    enabled: isValidRequestedMonth,
    initialData:
      isValidRequestedMonth && requestedMonthValue === initialMonth
        ? initialSummary
        : undefined,
  });

  const summary = summaryQuery.data ?? null;
  const displayMonthValue = summary?.month ?? requestedMonthValue;
  const selectedMonth =
    fromMonthInputValue(displayMonthValue) ??
    fromMonthInputValue(currentMonthValue);
  const selectedMonthLabel = selectedMonth
    ? formatMonthLabel(selectedMonth)
    : displayMonthValue;
  const isInitialLoading =
    isValidRequestedMonth && summaryQuery.isLoading && summary === null;
  const isRefreshing =
    isValidRequestedMonth && summaryQuery.isFetching && summary !== null;
  const errorMessage = !isValidRequestedMonth
    ? "月は YYYY-MM 形式で指定してください。"
    : summaryQuery.error
      ? toErrorMessage(summaryQuery.error, "給与集計の取得に失敗しました。")
      : null;

  return (
    <section className="space-y-6 p-4 md:p-6">
      <SummaryHeader
        draftMonthValue={draftMonthValue}
        currentMonthValue={currentMonthValue}
        requestedMonthValue={requestedMonthValue}
        canApplyMonth={canApplyMonth}
        isInitialLoading={isInitialLoading}
        isRefreshing={isRefreshing}
        onDraftMonthValueChange={setDraftMonthValue}
        onApplyMonth={() => {
          if (fromMonthInputValue(draftMonthValue) === null) {
            return;
          }

          setRequestedMonthValue(draftMonthValue);
        }}
        onBackToCurrentMonth={() => {
          setDraftMonthValue(currentMonthValue);
          setRequestedMonthValue(currentMonthValue);
        }}
      />

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isInitialLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="給与サマリーを読み込み中..."
        />
      ) : summary ? (
        <LoadingOverlay isLoading={isRefreshing} className="rounded-xl">
          <div className="space-y-4">
            <SummaryPrimaryMetrics
              summary={summary}
              selectedMonthLabel={selectedMonthLabel}
            />
            <SummarySecondaryMetrics summary={summary} />
            <div className="grid gap-4 xl:grid-cols-2">
              <SummaryWorkplaceChartCard byWorkplace={summary.byWorkplace} />
              <SummaryWorkplaceTableCard byWorkplace={summary.byWorkplace} />
            </div>
          </div>
        </LoadingOverlay>
      ) : null}
    </section>
  );
}

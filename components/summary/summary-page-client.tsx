"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpinnerPanel } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMonthLabel,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { toErrorMessage } from "@/lib/messages";
import { usePayrollSummaryQuery } from "@/lib/query/queries/payroll";
import { type PayrollSummaryResult } from "@/lib/payroll/summary";

type SummaryPageClientProps = {
  currentUserId: string;
  initialSummary: PayrollSummaryResult;
  initialMonth: string;
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

export function SummaryPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <div>
          <h2 className="text-xl font-semibold">給与サマリー</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            支給月別の概算給与と勤務時間を確認できます。
          </p>
        </div>
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
}: SummaryPageClientProps) {
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

  const summaryQuery = usePayrollSummaryQuery({
    userId: currentUserId,
    month: appliedMonthValue,
    enabled: isValidAppliedMonth,
    initialData:
      isValidAppliedMonth && appliedMonthValue === initialMonth
        ? initialSummary
        : undefined,
  });

  const summary = summaryQuery.data ?? null;
  const isLoading = isValidAppliedMonth ? summaryQuery.isLoading : false;
  const errorMessage = !isValidAppliedMonth
    ? "月は YYYY-MM 形式で指定してください。"
    : summaryQuery.error
      ? toErrorMessage(summaryQuery.error, "給与集計の取得に失敗しました。")
      : null;

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">給与サマリー</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            支給月別の概算給与と勤務時間を確認できます。
          </p>
        </div>

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
          label="給与サマリーを読み込み中..."
        />
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>概算給与</CardTitle>
                <CardDescription>{selectedMonthLabel}支給分</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatCurrency(summary.totalWage)}
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

          <div className="grid gap-4 lg:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <CardTitle>確定済み支給額</CardTitle>
                <CardDescription>
                  当月支給分のうち確定済みシフト分
                </CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatCurrency(summary.confirmedShiftWage)}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>年内受取累計（選択月まで）</CardTitle>
                <CardDescription>1月から選択月までの支給合計</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatCurrency(summary.currentMonthCumulative)}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>年間受取見込（1月〜12月）</CardTitle>
                <CardDescription>当年1月から12月までの支給見込</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatCurrency(summary.yearlyTotal)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>勤務先別給与</CardTitle>
                <CardDescription>選択月支給分の給与内訳グラフ</CardDescription>
              </CardHeader>
              <CardContent>
                <WorkplaceWageChart byWorkplace={summary.byWorkplace} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>勤務先別内訳</CardTitle>
                <CardDescription>勤務時間と給与の明細</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>勤務先</TableHead>
                      <TableHead>対象期間</TableHead>
                      <TableHead className="text-right">勤務時間</TableHead>
                      <TableHead className="text-right">給与</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byWorkplace.length > 0 ? (
                      summary.byWorkplace.map((item) => (
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
                            {formatCurrency(item.wage)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center">
                          対象期間のシフトはありません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </section>
  );
}

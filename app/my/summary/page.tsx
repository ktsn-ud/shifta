"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
  toMonthInputValue,
} from "@/lib/calendar/date";

const summaryResponseSchema = z.object({
  totalWage: z.number(),
  totalWorkHours: z.number(),
  totalNightHours: z.number(),
  totalOvertimeHours: z.number(),
  byWorkplace: z.array(
    z.object({
      workplaceId: z.string(),
      workplaceName: z.string(),
      workplaceColor: z.string(),
      wage: z.number(),
      workHours: z.number(),
    }),
  ),
  previousMonthWage: z.number(),
  currentMonthCumulative: z.number(),
  yearlyTotal: z.number(),
});

type SummaryResponse = z.infer<typeof summaryResponseSchema>;
type PeriodMode = "month" | "custom";

const chartConfig = {
  wage: {
    label: "給与",
    color: "var(--chart-1)",
  },
} as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatHours(value: number): string {
  return `${value.toFixed(2)} 時間`;
}

export default function SummaryPage() {
  const initialMonth = useMemo(() => startOfMonth(new Date()), []);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [monthValue, setMonthValue] = useState(toMonthInputValue(initialMonth));
  const [customStartDate, setCustomStartDate] = useState(
    toDateOnlyString(initialMonth),
  );
  const [customEndDate, setCustomEndDate] = useState(
    toDateOnlyString(endOfMonth(initialMonth)),
  );
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetPeriod = useMemo(() => {
    if (periodMode === "month") {
      const monthDate = fromMonthInputValue(monthValue) ?? initialMonth;
      return {
        startDate: toDateOnlyString(startOfMonth(monthDate)),
        endDate: toDateOnlyString(endOfMonth(monthDate)),
      };
    }

    return {
      startDate: customStartDate,
      endDate: customEndDate,
    };
  }, [customEndDate, customStartDate, initialMonth, monthValue, periodMode]);

  const previousDiff = useMemo(() => {
    if (!summary) {
      return null;
    }

    return summary.totalWage - summary.previousMonthWage;
  }, [summary]);

  useEffect(() => {
    if (!targetPeriod.startDate || !targetPeriod.endDate) {
      setSummary(null);
      setIsLoading(false);
      return;
    }

    if (targetPeriod.startDate > targetPeriod.endDate) {
      setSummary(null);
      setIsLoading(false);
      setErrorMessage("開始日は終了日以前で指定してください。");
      return;
    }

    const abortController = new AbortController();

    async function fetchSummary() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({
          startDate: targetPeriod.startDate,
          endDate: targetPeriod.endDate,
        });

        const response = await fetch(
          `/api/payroll/summary?${params.toString()}`,
          {
            signal: abortController.signal,
            cache: "no-store",
          },
        );

        if (response.ok === false) {
          throw new Error("PAYROLL_SUMMARY_FETCH_FAILED");
        }

        const parsed = summaryResponseSchema.safeParse(
          (await response.json()) as unknown,
        );

        if (parsed.success === false) {
          throw new Error("PAYROLL_SUMMARY_RESPONSE_INVALID");
        }

        setSummary(parsed.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch payroll summary", error);
        setSummary(null);
        setErrorMessage("給与集計の取得に失敗しました。");
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchSummary();

    return () => {
      abortController.abort();
    };
  }, [targetPeriod.endDate, targetPeriod.startDate]);

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">給与サマリー</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            期間別の概算給与と勤務時間を確認できます。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${
              periodMode === "month"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background"
            }`}
            onClick={() => setPeriodMode("month")}
          >
            月選択
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm ${
              periodMode === "custom"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background"
            }`}
            onClick={() => setPeriodMode("custom")}
          >
            カスタム期間
          </button>

          {periodMode === "month" ? (
            <Input
              type="month"
              value={monthValue}
              onChange={(event) => setMonthValue(event.currentTarget.value)}
              className="w-44"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(event) =>
                  setCustomStartDate(event.currentTarget.value)
                }
                className="w-44"
              />
              <span className="text-sm text-muted-foreground">〜</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(event) =>
                  setCustomEndDate(event.currentTarget.value)
                }
                className="w-44"
              />
            </div>
          )}
        </div>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          集計データを読み込み中です...
        </p>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>概算給与</CardTitle>
                <CardDescription>
                  {targetPeriod.startDate} 〜 {targetPeriod.endDate}
                </CardDescription>
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
                <CardTitle>前月合計</CardTitle>
                <CardDescription>前月同時期との比較</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold">
                  {formatCurrency(summary.previousMonthWage)}
                </p>
                <p className="text-sm text-muted-foreground">
                  前月比:{" "}
                  <span
                    className={
                      previousDiff !== null && previousDiff < 0
                        ? "text-destructive"
                        : "text-emerald-700"
                    }
                  >
                    {previousDiff === null
                      ? "-"
                      : `${previousDiff > 0 ? "+" : ""}${formatCurrency(previousDiff)}`}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>当月累計</CardTitle>
                <CardDescription>1月からの累計</CardDescription>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatCurrency(summary.currentMonthCumulative)}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>年間累計</CardTitle>
                <CardDescription>年初からの累計</CardDescription>
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
                <CardDescription>期間内の給与内訳グラフ</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={chartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart data={summary.byWorkplace}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="workplaceName"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) =>
                        `${Math.round(value / 1000)}k`
                      }
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [
                            formatCurrency(Number(value)),
                            "給与",
                          ]}
                        />
                      }
                    />
                    <Bar dataKey="wage" fill="var(--color-wage)" radius={4} />
                  </BarChart>
                </ChartContainer>
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
                        <TableCell colSpan={3} className="h-20 text-center">
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

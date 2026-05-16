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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SpinnerPanel } from "@/components/ui/spinner";
import { PayrollDetailsViewSwitch } from "@/components/payroll-details/payroll-details-view-switch";
import { formatCurrency } from "@/components/payroll-details/format";
import { toErrorMessage } from "@/lib/messages";
import { usePayrollDetailsWorkplaceYearlyQuery } from "@/lib/query/queries/payroll";
import { type PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";

type PayrollDetailsWorkplaceYearlyPageClientProps = {
  currentUserId: string;
  initialYear: number;
  initialDetails: PayrollDetailsWorkplaceYearlyResult;
};

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function isValidYearInput(value: string): boolean {
  if (!/^\d{4}$/.test(value)) {
    return false;
  }

  const year = Number(value);
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

function toYearNumber(value: string): number | null {
  if (!isValidYearInput(value)) {
    return null;
  }

  return Number(value);
}

function formatDateWithoutYear(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) {
    return date;
  }

  return `${month}/${day}`;
}

export function PayrollDetailsWorkplaceYearlyPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Payroll Details
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          給与詳細（勤務先毎表示）
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          勤務先毎の年次内訳を読み込み中です。
        </p>
      </header>
      <SpinnerPanel className="min-h-[360px]" label="給与詳細を読み込み中..." />
    </section>
  );
}

export function PayrollDetailsWorkplaceYearlyPageClient({
  currentUserId,
  initialYear,
  initialDetails,
}: PayrollDetailsWorkplaceYearlyPageClientProps) {
  const [draftYearValue, setDraftYearValue] = useState(String(initialYear));
  const [appliedYearValue, setAppliedYearValue] = useState(String(initialYear));

  const currentYearValue = String(new Date().getFullYear());
  const canApplyYear =
    isValidYearInput(draftYearValue) && draftYearValue !== appliedYearValue;

  const appliedYearNumber = useMemo(
    () => toYearNumber(appliedYearValue),
    [appliedYearValue],
  );

  const monthlyHref = "/my/payroll-details/monthly";

  const applyYearValue = (nextValue: string) => {
    if (!isValidYearInput(nextValue)) {
      return;
    }

    setAppliedYearValue(nextValue);
  };

  const handleBackToCurrentYear = () => {
    setDraftYearValue(currentYearValue);
    setAppliedYearValue(currentYearValue);
  };

  const detailsQuery = usePayrollDetailsWorkplaceYearlyQuery({
    userId: currentUserId,
    year: appliedYearNumber ?? initialYear,
    enabled: appliedYearNumber !== null,
    initialData:
      appliedYearNumber !== null && appliedYearNumber === initialYear
        ? initialDetails
        : undefined,
  });

  const details = detailsQuery.data ?? null;
  const isLoading = appliedYearNumber !== null ? detailsQuery.isLoading : false;
  const errorMessage =
    appliedYearNumber === null
      ? "年は YYYY 形式（2000〜2100）で指定してください。"
      : detailsQuery.error
        ? toErrorMessage(
            detailsQuery.error,
            "給与詳細（勤務先毎表示）の取得に失敗しました。",
          )
        : null;
  const hasAnyShift =
    details?.workplaces.some((workplace) =>
      workplace.months.some(
        (month) => month.totalWorkHours > 0 || month.totalWage > 0,
      ),
    ) ?? false;

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Payroll Details
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            給与詳細（勤務先毎表示）
          </h2>
          <p className="text-sm text-muted-foreground">
            {appliedYearNumber ? `${appliedYearNumber}年` : appliedYearValue}
            受取分の勤務先別月次内訳を確認できます。
          </p>
        </div>

        <PayrollDetailsViewSwitch
          currentMode="workplace-yearly"
          href={monthlyHref}
        />

        {!isLoading ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackToCurrentYear}
              disabled={appliedYearValue === currentYearValue}
            >
              今年に戻る
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_YEAR}
              max={MAX_YEAR}
              step={1}
              value={draftYearValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyYearValue(draftYearValue);
                }
              }}
              onChange={(event) => {
                setDraftYearValue(event.currentTarget.value);
              }}
              className="w-32"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => applyYearValue(draftYearValue)}
              disabled={!canApplyYear}
            >
              適用
            </Button>
          </div>
        ) : null}
      </header>

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              対象年のシフトはありません
            </p>
          ) : null}

          {details.workplaces.length === 0 ? (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              対象年のシフトはありません
            </p>
          ) : (
            <div className="space-y-6">
              {details.workplaces.map((workplace) => (
                <Card
                  key={workplace.workplaceId}
                  className="border-border/80 bg-card/95 shadow-sm"
                >
                  <CardHeader className="border-b border-border/70">
                    <CardTitle>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: workplace.workplaceColor }}
                        />
                        {workplace.workplaceName}
                      </span>
                    </CardTitle>
                    <CardDescription>
                      {appliedYearValue}年 受取見込
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Card
                        size="sm"
                        className="border-primary/30 bg-primary/5"
                      >
                        <CardHeader>
                          <CardTitle>年間受取見込</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xl font-semibold">
                          {formatCurrency(workplace.yearlyTotals.totalWage)}
                        </CardContent>
                      </Card>
                      <Card size="sm">
                        <CardHeader>
                          <CardTitle>年間 基本勤務金額</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xl font-semibold">
                          {formatCurrency(workplace.yearlyTotals.baseWage)}
                        </CardContent>
                      </Card>
                      <Card size="sm">
                        <CardHeader>
                          <CardTitle>年間 深夜勤務金額</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xl font-semibold">
                          {formatCurrency(workplace.yearlyTotals.nightWage)}
                        </CardContent>
                      </Card>
                      <Card size="sm">
                        <CardHeader>
                          <CardTitle>年間 休日勤務金額</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xl font-semibold">
                          {formatCurrency(workplace.yearlyTotals.holidayWage)}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-border/70">
                      <Table>
                        <TableHeader className="bg-muted/35">
                          <TableRow>
                            <TableHead className="sticky left-0 z-20 border-r bg-muted/35">
                              月
                            </TableHead>
                            <TableHead className="border-r">
                              支給対象期間
                            </TableHead>
                            <TableHead className="text-right">
                              総勤務時間
                            </TableHead>
                            <TableHead className="text-right">
                              基本勤務時間
                            </TableHead>
                            <TableHead className="text-right">
                              深夜勤務時間
                            </TableHead>
                            <TableHead className="border-r text-right">
                              休日勤務時間
                            </TableHead>
                            <TableHead className="text-right">
                              基本勤務金額
                            </TableHead>
                            <TableHead className="text-right">
                              深夜勤務金額
                            </TableHead>
                            <TableHead className="text-right">
                              休日勤務金額
                            </TableHead>
                            <TableHead className="text-right">月合計</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {workplace.months.map((month) => (
                            <TableRow
                              key={`${workplace.workplaceId}-${month.monthKey}`}
                            >
                              <TableCell className="sticky left-0 z-10 border-r bg-card">
                                {month.month}月
                              </TableCell>
                              <TableCell className="border-r">
                                {formatDateWithoutYear(month.periodStartDate)}{" "}
                                〜 {formatDateWithoutYear(month.periodEndDate)}
                              </TableCell>
                              <TableCell className="bg-muted/40 text-right font-medium">
                                {month.workDuration}
                              </TableCell>
                              <TableCell className="text-right">
                                {month.baseDuration}
                              </TableCell>
                              <TableCell className="text-right">
                                {month.nightDuration}
                              </TableCell>
                              <TableCell className="border-r text-right">
                                {month.holidayDuration}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(month.baseWage)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(month.nightWage)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(month.holidayWage)}
                              </TableCell>
                              <TableCell className="bg-muted/40 text-right font-medium">
                                {formatCurrency(month.totalWage)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

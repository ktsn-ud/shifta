"use client";

import { useState } from "react";
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
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpinnerPanel } from "@/components/ui/spinner";
import { PayrollDetailsViewSwitch } from "@/components/payroll-details/payroll-details-view-switch";
import { formatCurrency } from "@/components/payroll-details/format";
import { toErrorMessage } from "@/lib/messages";
import { usePayrollDetailsWorkplaceYearlyQuery } from "@/lib/query/queries/payroll";
import { type PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";

type PayrollDetailsWorkplaceYearlyPageClientProps = {
  currentUserId: string;
  initialYear: number;
  currentYearValue: string;
  initialDetails: PayrollDetailsWorkplaceYearlyResult;
};

type PayrollDetailsYearlyWorkplaceItem =
  PayrollDetailsWorkplaceYearlyResult["workplaces"][number];

type PayrollDetailsYearlyMonthItem =
  PayrollDetailsYearlyWorkplaceItem["months"][number];

type PayrollDetailsYearlyHeaderProps = {
  displayYearNumber: number | null;
  displayYearValue: string;
  draftYearValue: string;
  currentYearValue: string;
  requestedYearValue: string;
  canApplyYear: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  monthlyHref: string;
  onDraftYearValueChange: (value: string) => void;
  onApplyYearValue: (value: string) => void;
  onBackToCurrentYear: () => void;
};

type PayrollDetailsYearlyEmptyStateProps = {
  message: string;
};

type PayrollDetailsYearlyWorkplaceCardProps = {
  workplace: PayrollDetailsYearlyWorkplaceItem;
  displayYearValue: string;
};

type PayrollDetailsYearlySummaryCardsProps = {
  workplace: PayrollDetailsYearlyWorkplaceItem;
};

type PayrollDetailsYearlyTableProps = {
  workplace: PayrollDetailsYearlyWorkplaceItem;
};

type PayrollDetailsYearlyMonthRowProps = {
  month: PayrollDetailsYearlyMonthItem;
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
          勤務先毎の年次実績を読み込み中です。
        </p>
      </header>
      <SpinnerPanel className="min-h-[360px]" label="給与詳細を読み込み中..." />
    </section>
  );
}

function PayrollDetailsYearlyHeader({
  displayYearNumber,
  displayYearValue,
  draftYearValue,
  currentYearValue,
  requestedYearValue,
  canApplyYear,
  isInitialLoading,
  isRefreshing,
  monthlyHref,
  onDraftYearValueChange,
  onApplyYearValue,
  onBackToCurrentYear,
}: PayrollDetailsYearlyHeaderProps) {
  return (
    <header className="space-y-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Payroll Details
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">
          給与詳細（勤務先毎表示）
        </h2>
        <p className="text-sm text-muted-foreground">
          {displayYearNumber ? `${displayYearNumber}年` : displayYearValue}
          受取分の勤務先別月次実績を確認できます。
        </p>
      </div>

      <PayrollDetailsViewSwitch
        currentMode="workplace-yearly"
        href={monthlyHref}
      />

      {!isInitialLoading ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackToCurrentYear}
            disabled={requestedYearValue === currentYearValue || isRefreshing}
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
            disabled={isRefreshing}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onApplyYearValue(draftYearValue);
              }
            }}
            onChange={(event) => {
              onDraftYearValueChange(event.currentTarget.value);
            }}
            className="w-32"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => onApplyYearValue(draftYearValue)}
            disabled={!canApplyYear || isRefreshing}
          >
            適用
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function PayrollDetailsYearlyEmptyState({
  message,
}: PayrollDetailsYearlyEmptyStateProps) {
  return (
    <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function PayrollDetailsYearlyWorkplaceCard({
  workplace,
  displayYearValue,
}: PayrollDetailsYearlyWorkplaceCardProps) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
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
        <CardDescription>{displayYearValue}年 受取見込</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PayrollDetailsYearlySummaryCards workplace={workplace} />
        <PayrollDetailsYearlyTable workplace={workplace} />
      </CardContent>
    </Card>
  );
}

function PayrollDetailsYearlySummaryCards({
  workplace,
}: PayrollDetailsYearlySummaryCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card size="sm" className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>年間実績支給額</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-xl font-semibold">
            {formatCurrency(workplace.yearlyDisplayValue.displayAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            課税 {formatCurrency(workplace.actualCoverage.taxableAmount)} /
            非課税 {formatCurrency(workplace.actualCoverage.nonTaxableAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {workplace.actualCoverage.registeredWorkplaceCount === 0
              ? "実給与は未登録です"
              : workplace.actualCoverage.isPartial
                ? `実給与登録済み ${workplace.actualCoverage.registeredWorkplaceCount}/${workplace.actualCoverage.totalWorkplaceCount} か月`
                : "12か月すべて実給与登録済み"}
          </p>
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
  );
}

function PayrollDetailsYearlyTable({
  workplace,
}: PayrollDetailsYearlyTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table>
        <TableHeader className="bg-muted/35">
          <TableRow>
            <TableHead className="sticky left-0 z-20 border-r bg-muted/35">
              月
            </TableHead>
            <TableHead className="border-r">支給対象期間</TableHead>
            <TableHead className="text-right">総勤務時間</TableHead>
            <TableHead className="text-right">基本勤務時間</TableHead>
            <TableHead className="text-right">深夜勤務時間</TableHead>
            <TableHead className="border-r text-right">休日勤務時間</TableHead>
            <TableHead className="text-right">基本勤務金額</TableHead>
            <TableHead className="text-right">深夜勤務金額</TableHead>
            <TableHead className="text-right">休日勤務金額</TableHead>
            <TableHead className="text-right">概算</TableHead>
            <TableHead className="text-right">実績支給額</TableHead>
            <TableHead className="text-right">実績（課税）</TableHead>
            <TableHead className="text-right">実績（非課税）</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workplace.months.map((month) => (
            <PayrollDetailsYearlyMonthRow
              key={`${workplace.workplaceId}-${month.monthKey}`}
              month={month}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PayrollDetailsYearlyMonthRow({
  month,
}: PayrollDetailsYearlyMonthRowProps) {
  return (
    <TableRow>
      <TableCell className="sticky left-0 z-10 border-r bg-card">
        {month.month}月
      </TableCell>
      <TableCell className="border-r">
        {formatDateWithoutYear(month.periodStartDate)} 〜{" "}
        {formatDateWithoutYear(month.periodEndDate)}
      </TableCell>
      <TableCell className="bg-muted/40 text-right font-medium">
        {month.workDuration}
      </TableCell>
      <TableCell className="text-right">{month.baseDuration}</TableCell>
      <TableCell className="text-right">{month.nightDuration}</TableCell>
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
      <TableCell className="bg-primary/5 text-right font-medium text-primary">
        {formatCurrency(month.displayValue.displayAmount)}
      </TableCell>
      <TableCell className="text-right">
        {month.actualPayroll
          ? formatCurrency(month.actualPayroll.taxableAmount)
          : "-"}
      </TableCell>
      <TableCell className="text-right">
        {month.actualPayroll
          ? formatCurrency(month.actualPayroll.nonTaxableAmount)
          : "-"}
      </TableCell>
    </TableRow>
  );
}

export function PayrollDetailsWorkplaceYearlyPageClient({
  currentUserId,
  initialYear,
  currentYearValue,
  initialDetails,
}: PayrollDetailsWorkplaceYearlyPageClientProps) {
  const [draftYearValue, setDraftYearValue] = useState(String(initialYear));
  const [requestedYearValue, setRequestedYearValue] = useState(
    String(initialYear),
  );

  const canApplyYear =
    isValidYearInput(draftYearValue) && draftYearValue !== requestedYearValue;

  const requestedYearNumber = toYearNumber(requestedYearValue);

  const monthlyHref = "/my/payroll-details/monthly";

  const applyYearValue = (nextValue: string) => {
    if (!isValidYearInput(nextValue)) {
      return;
    }

    setRequestedYearValue(nextValue);
  };

  const handleBackToCurrentYear = () => {
    setDraftYearValue(currentYearValue);
    setRequestedYearValue(currentYearValue);
  };

  const detailsQuery = usePayrollDetailsWorkplaceYearlyQuery({
    userId: currentUserId,
    year: requestedYearNumber ?? initialYear,
    enabled: requestedYearNumber !== null,
    initialData:
      requestedYearNumber !== null && requestedYearNumber === initialYear
        ? initialDetails
        : undefined,
  });

  const details = detailsQuery.data ?? null;
  const displayYearNumber = details?.year ?? requestedYearNumber;
  const displayYearValue = String(displayYearNumber ?? requestedYearValue);
  const isInitialLoading =
    requestedYearNumber !== null && detailsQuery.isLoading && details === null;
  const isRefreshing =
    requestedYearNumber !== null && detailsQuery.isFetching && details !== null;
  const errorMessage =
    requestedYearNumber === null
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
      <PayrollDetailsYearlyHeader
        displayYearNumber={displayYearNumber ?? null}
        displayYearValue={displayYearValue}
        draftYearValue={draftYearValue}
        currentYearValue={currentYearValue}
        requestedYearValue={requestedYearValue}
        canApplyYear={canApplyYear}
        isInitialLoading={isInitialLoading}
        isRefreshing={isRefreshing}
        monthlyHref={monthlyHref}
        onDraftYearValueChange={setDraftYearValue}
        onApplyYearValue={applyYearValue}
        onBackToCurrentYear={handleBackToCurrentYear}
      />

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isInitialLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="給与詳細を読み込み中..."
        />
      ) : details ? (
        <LoadingOverlay isLoading={isRefreshing} className="rounded-xl">
          <div className="space-y-6">
            {!hasAnyShift ? (
              <PayrollDetailsYearlyEmptyState message="対象年のシフトはありません" />
            ) : null}

            {details.workplaces.length === 0 ? (
              <PayrollDetailsYearlyEmptyState message="対象年のシフトはありません" />
            ) : (
              <div className="space-y-6">
                {details.workplaces.map((workplace) => (
                  <PayrollDetailsYearlyWorkplaceCard
                    key={workplace.workplaceId}
                    workplace={workplace}
                    displayYearValue={displayYearValue}
                  />
                ))}
              </div>
            )}
          </div>
        </LoadingOverlay>
      ) : null}
    </section>
  );
}

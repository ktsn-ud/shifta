"use client";

import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RefreshStatusFloating } from "@/components/ui/refresh-status-floating";
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
import { toErrorMessage } from "@/lib/messages";
import {
  type PayrollSummaryHoursByWorkplaceItem,
  type PayrollSummaryIncomeByWorkplaceItem,
  type PayrollSummaryMonthItem,
  type PayrollSummaryResult,
  type PayrollSummaryYearlyWorkplaceTotal,
} from "@/lib/payroll/summary";
import { usePayrollSummaryQuery } from "@/lib/query/queries/payroll";

type SummaryPageClientProps = {
  currentUserId: string;
  initialSummary: PayrollSummaryResult;
  initialYear: number;
  currentYearValue: string;
};

type SummaryHeaderProps = {
  displayYearValue: string;
  draftYearValue: string;
  currentYearValue: string;
  requestedYearValue: string;
  canApplyYear: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onDraftYearValueChange: (value: string) => void;
  onApplyYearValue: (value: string) => void;
  onBackToCurrentYear: () => void;
};

type SummaryIncomeTableProps = {
  summary: PayrollSummaryResult;
};

type SummaryWorkHoursTableProps = {
  summary: PayrollSummaryResult;
};

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const SUMMARY_MONTH_COLUMN_CLASS =
  "sticky left-0 z-30 w-20 min-w-20 border-r-0 bg-muted shadow-[inset_-2px_0_0_0_rgba(148,163,184,0.95),10px_0_14px_-10px_rgba(15,23,42,0.45)]";
const SUMMARY_MONTH_CELL_CLASS =
  "sticky left-0 z-20 w-20 min-w-20 border-r-0 bg-card font-medium shadow-[inset_-2px_0_0_0_rgba(148,163,184,0.95),10px_0_14px_-10px_rgba(15,23,42,0.35)]";
const SUMMARY_MONTH_TOTAL_CELL_CLASS =
  "sticky left-0 z-20 w-20 min-w-20 border-r-0 bg-primary/10 font-semibold shadow-[inset_-2px_0_0_0_rgba(148,163,184,0.95),10px_0_14px_-10px_rgba(15,23,42,0.35)]";
const SUMMARY_INCOME_VALUE_COLUMN_CLASS = "w-32 min-w-32 text-right";
const SUMMARY_HOURS_VALUE_COLUMN_CLASS = "w-28 min-w-28 text-right";
const SUMMARY_WORKPLACE_GROUP_CLASS = "w-96 min-w-96 text-center";
const SUMMARY_WORKPLACE_HOURS_GROUP_CLASS = "w-28 min-w-28 text-center";

function withGroupDivider(className: string): string {
  return `${className} border-l border-border/70`;
}

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

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatHours(value: number): string {
  return `${value.toFixed(2)} 時間`;
}

function findIncomeByWorkplace(
  items: PayrollSummaryIncomeByWorkplaceItem[],
  workplaceId: string,
): PayrollSummaryIncomeByWorkplaceItem | null {
  return items.find((item) => item.workplaceId === workplaceId) ?? null;
}

function findHoursByWorkplace(
  items: PayrollSummaryHoursByWorkplaceItem[],
  workplaceId: string,
): PayrollSummaryHoursByWorkplaceItem | null {
  return items.find((item) => item.workplaceId === workplaceId) ?? null;
}

function findYearlyTotalByWorkplace(
  items: PayrollSummaryYearlyWorkplaceTotal[],
  workplaceId: string,
): PayrollSummaryYearlyWorkplaceTotal | null {
  return items.find((item) => item.workplaceId === workplaceId) ?? null;
}

function hasAnySummaryRows(summary: PayrollSummaryResult): boolean {
  return summary.months.some(
    (month) => month.totals.totalAmount > 0 || month.totals.totalWorkHours > 0,
  );
}

function SummaryHeader({
  displayYearValue,
  draftYearValue,
  currentYearValue,
  requestedYearValue,
  canApplyYear,
  isInitialLoading,
  isRefreshing,
  onDraftYearValueChange,
  onApplyYearValue,
  onBackToCurrentYear,
}: SummaryHeaderProps) {
  return (
    <header className="space-y-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Summary
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">給与サマリー</h2>
        <p className="text-sm text-muted-foreground">
          {displayYearValue}年受取分の所得と勤務時間を年次表で確認できます。
        </p>
      </div>

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

function SummaryIncomeTable({ summary }: SummaryIncomeTableProps) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle>所得テーブル</CardTitle>
        <CardDescription>
          実給与がある月は実績、未登録月は概算を課税所得として表示します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table className="min-w-max table-fixed">
            <TableHeader className="bg-muted/35">
              <TableRow>
                <TableHead className={SUMMARY_MONTH_COLUMN_CLASS}>月</TableHead>
                {summary.workplaces.map((workplace) => (
                  <TableHead
                    key={workplace.workplaceId}
                    colSpan={3}
                    className={withGroupDivider(SUMMARY_WORKPLACE_GROUP_CLASS)}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: workplace.workplaceColor }}
                      />
                      {workplace.workplaceName}
                    </span>
                  </TableHead>
                ))}
                <TableHead
                  colSpan={3}
                  className={withGroupDivider(SUMMARY_WORKPLACE_GROUP_CLASS)}
                >
                  全勤務先合計
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className={SUMMARY_MONTH_COLUMN_CLASS} />
                {summary.workplaces.flatMap((workplace) => [
                  <TableHead
                    key={`${workplace.workplaceId}-taxable`}
                    className={withGroupDivider(
                      SUMMARY_INCOME_VALUE_COLUMN_CLASS,
                    )}
                  >
                    課税所得
                  </TableHead>,
                  <TableHead
                    key={`${workplace.workplaceId}-non-taxable`}
                    className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}
                  >
                    非課税所得
                  </TableHead>,
                  <TableHead
                    key={`${workplace.workplaceId}-total`}
                    className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}
                  >
                    合計支給額
                  </TableHead>,
                ])}
                <TableHead
                  className={withGroupDivider(
                    SUMMARY_INCOME_VALUE_COLUMN_CLASS,
                  )}
                >
                  課税所得
                </TableHead>
                <TableHead className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}>
                  非課税所得
                </TableHead>
                <TableHead className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}>
                  合計支給額
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.months.map((month) => (
                <SummaryIncomeTableRow
                  key={month.monthKey}
                  month={month}
                  workplaceIds={summary.workplaces.map(
                    (workplace) => workplace.workplaceId,
                  )}
                />
              ))}
              <TableRow className="bg-primary/5">
                <TableCell className={SUMMARY_MONTH_TOTAL_CELL_CLASS}>
                  年合計
                </TableCell>
                {summary.workplaces.flatMap((workplace) => {
                  const workplaceTotal = findYearlyTotalByWorkplace(
                    summary.yearlyTotals.byWorkplace,
                    workplace.workplaceId,
                  );

                  return [
                    <TableCell
                      key={`${workplace.workplaceId}-taxable`}
                      className={`${withGroupDivider(
                        SUMMARY_INCOME_VALUE_COLUMN_CLASS,
                      )} font-semibold`}
                    >
                      {formatCurrency(workplaceTotal?.taxableAmount ?? 0)}
                    </TableCell>,
                    <TableCell
                      key={`${workplace.workplaceId}-non-taxable`}
                      className={`${SUMMARY_INCOME_VALUE_COLUMN_CLASS} font-semibold`}
                    >
                      {formatCurrency(workplaceTotal?.nonTaxableAmount ?? 0)}
                    </TableCell>,
                    <TableCell
                      key={`${workplace.workplaceId}-total`}
                      className={`${SUMMARY_INCOME_VALUE_COLUMN_CLASS} font-semibold`}
                    >
                      {formatCurrency(workplaceTotal?.totalAmount ?? 0)}
                    </TableCell>,
                  ];
                })}
                <TableCell
                  className={`${withGroupDivider(
                    SUMMARY_INCOME_VALUE_COLUMN_CLASS,
                  )} font-semibold`}
                >
                  {formatCurrency(
                    summary.yearlyTotals.grandTotals.taxableAmount,
                  )}
                </TableCell>
                <TableCell
                  className={`${SUMMARY_INCOME_VALUE_COLUMN_CLASS} font-semibold`}
                >
                  {formatCurrency(
                    summary.yearlyTotals.grandTotals.nonTaxableAmount,
                  )}
                </TableCell>
                <TableCell
                  className={`${SUMMARY_INCOME_VALUE_COLUMN_CLASS} font-semibold`}
                >
                  {formatCurrency(summary.yearlyTotals.grandTotals.totalAmount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryIncomeTableRow({
  month,
  workplaceIds,
}: {
  month: PayrollSummaryMonthItem;
  workplaceIds: string[];
}) {
  return (
    <TableRow>
      <TableCell className={SUMMARY_MONTH_CELL_CLASS}>
        {month.month}月
      </TableCell>
      {workplaceIds.flatMap((workplaceId) => {
        const income = findIncomeByWorkplace(
          month.incomeByWorkplace,
          workplaceId,
        );

        return [
          <TableCell
            key={`${workplaceId}-taxable`}
            className={withGroupDivider(SUMMARY_INCOME_VALUE_COLUMN_CLASS)}
          >
            {formatCurrency(income?.taxableAmount ?? 0)}
          </TableCell>,
          <TableCell
            key={`${workplaceId}-non-taxable`}
            className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}
          >
            {formatCurrency(income?.nonTaxableAmount ?? 0)}
          </TableCell>,
          <TableCell
            key={`${workplaceId}-total`}
            className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}
          >
            {formatCurrency(income?.totalAmount ?? 0)}
          </TableCell>,
        ];
      })}
      <TableCell
        className={withGroupDivider(SUMMARY_INCOME_VALUE_COLUMN_CLASS)}
      >
        {formatCurrency(month.totals.taxableAmount)}
      </TableCell>
      <TableCell className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}>
        {formatCurrency(month.totals.nonTaxableAmount)}
      </TableCell>
      <TableCell className={SUMMARY_INCOME_VALUE_COLUMN_CLASS}>
        {formatCurrency(month.totals.totalAmount)}
      </TableCell>
    </TableRow>
  );
}

function SummaryWorkHoursTable({ summary }: SummaryWorkHoursTableProps) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle>勤務時間テーブル</CardTitle>
        <CardDescription>
          勤務時間は常にシフト実績から集計し、実給与登録では上書きしません。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table className="min-w-max table-fixed">
            <TableHeader className="bg-muted/35">
              <TableRow>
                <TableHead className={SUMMARY_MONTH_COLUMN_CLASS}>月</TableHead>
                {summary.workplaces.map((workplace) => (
                  <TableHead
                    key={workplace.workplaceId}
                    className={withGroupDivider(
                      SUMMARY_WORKPLACE_HOURS_GROUP_CLASS,
                    )}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: workplace.workplaceColor }}
                      />
                      {workplace.workplaceName}
                    </span>
                  </TableHead>
                ))}
                <TableHead
                  className={withGroupDivider(
                    SUMMARY_WORKPLACE_HOURS_GROUP_CLASS,
                  )}
                >
                  全勤務先合計時間
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className={SUMMARY_MONTH_COLUMN_CLASS} />
                {summary.workplaces.map((workplace) => (
                  <TableHead
                    key={`${workplace.workplaceId}-hours`}
                    className={withGroupDivider(
                      SUMMARY_HOURS_VALUE_COLUMN_CLASS,
                    )}
                  >
                    総勤務時間
                  </TableHead>
                ))}
                <TableHead
                  className={withGroupDivider(SUMMARY_HOURS_VALUE_COLUMN_CLASS)}
                >
                  総勤務時間
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.months.map((month) => (
                <TableRow key={month.monthKey}>
                  <TableCell className={SUMMARY_MONTH_CELL_CLASS}>
                    {month.month}月
                  </TableCell>
                  {summary.workplaces.map((workplace) => {
                    const hours = findHoursByWorkplace(
                      month.hoursByWorkplace,
                      workplace.workplaceId,
                    );

                    return (
                      <TableCell
                        key={workplace.workplaceId}
                        className={withGroupDivider(
                          SUMMARY_HOURS_VALUE_COLUMN_CLASS,
                        )}
                      >
                        {formatHours(hours?.totalWorkHours ?? 0)}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className={withGroupDivider(
                      SUMMARY_HOURS_VALUE_COLUMN_CLASS,
                    )}
                  >
                    {formatHours(month.totals.totalWorkHours)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-primary/5">
                <TableCell className={SUMMARY_MONTH_TOTAL_CELL_CLASS}>
                  年合計
                </TableCell>
                {summary.workplaces.map((workplace) => {
                  const workplaceTotal = findYearlyTotalByWorkplace(
                    summary.yearlyTotals.byWorkplace,
                    workplace.workplaceId,
                  );

                  return (
                    <TableCell
                      key={workplace.workplaceId}
                      className={`${withGroupDivider(
                        SUMMARY_HOURS_VALUE_COLUMN_CLASS,
                      )} font-semibold`}
                    >
                      {formatHours(workplaceTotal?.totalWorkHours ?? 0)}
                    </TableCell>
                  );
                })}
                <TableCell
                  className={`${withGroupDivider(
                    SUMMARY_HOURS_VALUE_COLUMN_CLASS,
                  )} font-semibold`}
                >
                  {formatHours(summary.yearlyTotals.grandTotals.totalWorkHours)}
                </TableCell>
              </TableRow>
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
          年次給与サマリーを読み込み中です。
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
  initialYear,
  currentYearValue,
}: SummaryPageClientProps) {
  const [draftYearValue, setDraftYearValue] = useState(String(initialYear));
  const [requestedYearValue, setRequestedYearValue] = useState(
    String(initialYear),
  );

  const requestedYearNumber = toYearNumber(requestedYearValue);
  const canApplyYear =
    isValidYearInput(draftYearValue) && draftYearValue !== requestedYearValue;

  const summaryQuery = usePayrollSummaryQuery({
    userId: currentUserId,
    year: requestedYearNumber ?? initialYear,
    enabled: requestedYearNumber !== null,
    initialData:
      requestedYearNumber !== null && requestedYearNumber === initialYear
        ? initialSummary
        : undefined,
  });

  const summary = summaryQuery.data ?? null;
  const displayYearNumber = summary?.year ?? requestedYearNumber;
  const displayYearValue = String(displayYearNumber ?? requestedYearValue);
  const isInitialLoading =
    requestedYearNumber !== null && summaryQuery.isLoading && summary === null;
  const isRefreshing =
    requestedYearNumber !== null && summaryQuery.isFetching && summary !== null;
  const errorMessage =
    requestedYearNumber === null
      ? "年は YYYY 形式（2000〜2100）で指定してください。"
      : summaryQuery.error
        ? toErrorMessage(summaryQuery.error, "給与集計の取得に失敗しました。")
        : null;
  const hasSummaryRows = summary ? hasAnySummaryRows(summary) : false;

  const applyYearValue = (nextValue: string) => {
    if (!isValidYearInput(nextValue)) {
      return;
    }

    startTransition(() => {
      setRequestedYearValue(nextValue);
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?year=${nextValue}`,
      );
    });
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <SummaryHeader
        displayYearValue={displayYearValue}
        draftYearValue={draftYearValue}
        currentYearValue={currentYearValue}
        requestedYearValue={requestedYearValue}
        canApplyYear={canApplyYear}
        isInitialLoading={isInitialLoading}
        isRefreshing={isRefreshing}
        onDraftYearValueChange={setDraftYearValue}
        onApplyYearValue={applyYearValue}
        onBackToCurrentYear={() => {
          setDraftYearValue(currentYearValue);
          applyYearValue(currentYearValue);
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
        <div className="space-y-4">
          {isRefreshing ? <RefreshStatusFloating /> : null}
          <LoadingOverlay isLoading={isRefreshing} className="rounded-xl">
            {!hasSummaryRows ? (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                対象年の集計データはありません。
              </p>
            ) : (
              <div className="space-y-6">
                <SummaryIncomeTable summary={summary} />
                <SummaryWorkHoursTable summary={summary} />
              </div>
            )}
          </LoadingOverlay>
        </div>
      ) : null}
    </section>
  );
}

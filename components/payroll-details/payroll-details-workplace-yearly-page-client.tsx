"use client";

import { useEffect, useMemo, useState } from "react";
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
import { type PayrollDetailsWorkplaceYearlyResult } from "@/lib/payroll/details";

type PayrollDetailsWorkplaceYearlyPageClientProps = {
  currentUserId: string;
  initialYear: number;
  initialDetails: PayrollDetailsWorkplaceYearlyResult;
};

const YEARLY_CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

type YearlyCacheEntry = {
  expiresAt: number;
  details: PayrollDetailsWorkplaceYearlyResult;
};

const yearlyCache = new Map<string, YearlyCacheEntry>();

function toYearlyCacheKey(userId: string, year: number): string {
  return `${userId}:${year}`;
}

function readYearlyCache(
  cacheKey: string,
): PayrollDetailsWorkplaceYearlyResult | null {
  const cached = yearlyCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    yearlyCache.delete(cacheKey);
    return null;
  }

  return cached.details;
}

function writeYearlyCache(
  cacheKey: string,
  details: PayrollDetailsWorkplaceYearlyResult,
): void {
  yearlyCache.set(cacheKey, {
    details,
    expiresAt: Date.now() + YEARLY_CACHE_TTL_MS,
  });
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
      <header>
        <h2 className="text-xl font-semibold">給与詳細（勤務先毎表示）</h2>
        <p className="mt-1 text-sm text-muted-foreground">
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
  const [details, setDetails] =
    useState<PayrollDetailsWorkplaceYearlyResult | null>(initialDetails);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentYearValue = String(new Date().getFullYear());
  const canApplyYear =
    isValidYearInput(draftYearValue) && draftYearValue !== appliedYearValue;

  const appliedYearNumber = useMemo(
    () => toYearNumber(appliedYearValue),
    [appliedYearValue],
  );

  const hasAnyShift =
    details?.workplaces.some((workplace) =>
      workplace.months.some(
        (month) => month.totalWorkHours > 0 || month.totalWage > 0,
      ),
    ) ?? false;

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

  useEffect(() => {
    const nextYear = toYearNumber(appliedYearValue);
    if (nextYear === null) {
      setDetails(null);
      setErrorMessage("年は YYYY 形式（2000〜2100）で指定してください。");
      setIsLoading(false);
      return;
    }

    if (nextYear === initialYear) {
      writeYearlyCache(
        toYearlyCacheKey(currentUserId, initialYear),
        initialDetails,
      );
      setErrorMessage(null);
      setDetails(initialDetails);
      setIsLoading(false);
      return;
    }

    const cacheKey = toYearlyCacheKey(currentUserId, nextYear);
    const cached = readYearlyCache(cacheKey);
    if (cached) {
      setErrorMessage(null);
      setDetails(cached);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    async function fetchDetails() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({ year: String(nextYear) });
        const response = await fetch(
          `/api/payroll/details/workplace-yearly?${params.toString()}`,
          {
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          throw new Error("PAYROLL_DETAILS_WORKPLACE_YEARLY_FETCH_FAILED");
        }

        const payload = (await response.json()) as unknown;
        if (
          typeof payload !== "object" ||
          payload === null ||
          typeof (payload as { year?: unknown }).year !== "number" ||
          !Array.isArray((payload as { workplaces?: unknown[] }).workplaces)
        ) {
          throw new Error("PAYROLL_DETAILS_WORKPLACE_YEARLY_RESPONSE_INVALID");
        }

        const parsed = payload as PayrollDetailsWorkplaceYearlyResult;
        writeYearlyCache(cacheKey, parsed);
        setDetails(parsed);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(
          "failed to fetch payroll details workplace yearly",
          error,
        );
        setDetails(null);
        setErrorMessage(
          toErrorMessage(
            error,
            "給与詳細（勤務先毎表示）の取得に失敗しました。",
          ),
        );
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchDetails();

    return () => {
      abortController.abort();
    };
  }, [appliedYearValue, currentUserId, initialDetails, initialYear]);

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">給与詳細（勤務先毎表示）</h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
              対象年のシフトはありません
            </p>
          ) : null}

          {details.workplaces.length === 0 ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              対象年のシフトはありません
            </p>
          ) : (
            <div className="space-y-6">
              {details.workplaces.map((workplace) => (
                <Card key={workplace.workplaceId}>
                  <CardHeader>
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
                      <Card size="sm">
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
                          <CardTitle>年間 休日勤務金額</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xl font-semibold">
                          {formatCurrency(workplace.yearlyTotals.holidayWage)}
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
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-20 border-r bg-card">
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
                            休日勤務時間
                          </TableHead>
                          <TableHead className="border-r text-right">
                            深夜勤務時間
                          </TableHead>
                          <TableHead className="text-right">
                            基本勤務金額
                          </TableHead>
                          <TableHead className="text-right">
                            休日勤務金額
                          </TableHead>
                          <TableHead className="text-right">
                            深夜勤務金額
                          </TableHead>
                          <TableHead className="text-right">残業金額</TableHead>
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
                              {formatDateWithoutYear(month.periodStartDate)} 〜{" "}
                              {formatDateWithoutYear(month.periodEndDate)}
                            </TableCell>
                            <TableCell className="bg-muted text-right font-medium">
                              {month.workDuration}
                            </TableCell>
                            <TableCell className="text-right">
                              {month.baseDuration}
                            </TableCell>
                            <TableCell className="text-right">
                              {month.holidayDuration}
                            </TableCell>
                            <TableCell className="border-r text-right">
                              {month.nightDuration}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(month.baseWage)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(month.holidayWage)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(month.nightWage)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(month.overtimeWage)}
                            </TableCell>
                            <TableCell className="bg-muted text-right font-medium">
                              {formatCurrency(month.totalWage)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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

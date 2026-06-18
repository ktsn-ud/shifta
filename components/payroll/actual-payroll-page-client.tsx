"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  formatMonthLabel,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { messages, toErrorMessage } from "@/lib/messages";
import { type ActualPayrollEditorResult } from "@/lib/payroll/actual-editor";
import { invalidateAfterActualPayrollMutation } from "@/lib/query/invalidation";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { useActualPayrollQuery } from "@/lib/query/queries/payroll";
import { queryKeys } from "@/lib/query/query-keys";

type ActualPayrollPageClientProps = {
  currentUserId: string;
  initialMonth: string;
  initialData: ActualPayrollEditorResult;
};

type EditableRow = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  periodStartDate: string;
  periodEndDate: string;
  estimatedAmount: number;
  taxableAmount: string;
  nonTaxableAmount: string;
  totalActualAmount: number | null;
  displayAmount: number;
  differenceAmount: number;
  note: string;
  hasActualPayroll: boolean;
};

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function toEditableRows(data: ActualPayrollEditorResult): EditableRow[] {
  return data.rows.map((row) => ({
    ...row,
    taxableAmount:
      row.taxableAmount === null ? "" : String(Math.trunc(row.taxableAmount)),
    nonTaxableAmount:
      row.nonTaxableAmount === null
        ? ""
        : String(Math.trunc(row.nonTaxableAmount)),
    note: row.note ?? "",
  }));
}

function parseCurrencyInput(value: string): number | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

export function ActualPayrollPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Actual Payroll
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          実給与編集
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          実際の給与明細値を読み込み中です。
        </p>
      </header>
      <SpinnerPanel className="min-h-[360px]" label="実給与を読み込み中..." />
    </section>
  );
}

export function ActualPayrollPageClient({
  currentUserId,
  initialMonth,
  initialData,
}: ActualPayrollPageClientProps) {
  const queryClient = getBrowserQueryClient();
  const [draftMonthValue, setDraftMonthValue] = useState(initialMonth);
  const [requestedMonthValue, setRequestedMonthValue] = useState(initialMonth);
  const [displayMonthValue, setDisplayMonthValue] = useState(initialMonth);
  const [rows, setRows] = useState<EditableRow[]>(() =>
    toEditableRows(initialData),
  );
  const [isSaving, setIsSaving] = useState(false);

  const currentMonthValue = toMonthInputValue(startOfMonth(new Date()));
  const isValidRequestedMonth =
    fromMonthInputValue(requestedMonthValue) !== null;
  const canApplyMonth =
    fromMonthInputValue(draftMonthValue) !== null &&
    draftMonthValue !== requestedMonthValue;
  const selectedMonthLabel = formatMonthLabel(
    fromMonthInputValue(displayMonthValue) ?? startOfMonth(new Date()),
  );

  const actualPayrollQuery = useActualPayrollQuery({
    userId: currentUserId,
    month: requestedMonthValue,
    enabled: isValidRequestedMonth,
    initialData:
      isValidRequestedMonth && requestedMonthValue === initialMonth
        ? initialData
        : undefined,
  });

  useEffect(() => {
    if (actualPayrollQuery.isPlaceholderData || !actualPayrollQuery.data) {
      return;
    }

    setRows(toEditableRows(actualPayrollQuery.data));
    setDisplayMonthValue((current) =>
      current === requestedMonthValue ? current : requestedMonthValue,
    );
  }, [
    actualPayrollQuery.data,
    actualPayrollQuery.isPlaceholderData,
    requestedMonthValue,
  ]);

  const data = actualPayrollQuery.data ?? null;
  const isInitialLoading =
    isValidRequestedMonth && actualPayrollQuery.isLoading && data === null;
  const isRefreshing =
    isValidRequestedMonth && actualPayrollQuery.isFetching && data !== null;
  const errorMessage = !isValidRequestedMonth
    ? "月は YYYY-MM 形式で指定してください。"
    : actualPayrollQuery.error
      ? toErrorMessage(
          actualPayrollQuery.error,
          "実給与データの取得に失敗しました。",
        )
      : null;

  const handleBackToCurrentMonth = () => {
    setDraftMonthValue(currentMonthValue);
    setRequestedMonthValue(currentMonthValue);
  };

  const handleClearRow = (workplaceId: string) => {
    setRows((current) =>
      current.map((row) =>
        row.workplaceId === workplaceId
          ? {
              ...row,
              taxableAmount: "",
              nonTaxableAmount: "",
              note: "",
              totalActualAmount: null,
              displayAmount: row.estimatedAmount,
              differenceAmount: 0,
              hasActualPayroll: false,
            }
          : row,
      ),
    );
  };

  const handleAmountChange = (
    workplaceId: string,
    field: "taxableAmount" | "nonTaxableAmount",
    value: string,
  ) => {
    setRows((current) =>
      current.map((row) => {
        if (row.workplaceId !== workplaceId) {
          return row;
        }

        const nextRow = {
          ...row,
          [field]: value,
        };
        const taxableAmount = parseCurrencyInput(nextRow.taxableAmount);
        const nonTaxableAmount = parseCurrencyInput(nextRow.nonTaxableAmount);
        const hasAnyValue =
          nextRow.taxableAmount.trim().length > 0 ||
          nextRow.nonTaxableAmount.trim().length > 0;

        if (!hasAnyValue || taxableAmount === null) {
          return {
            ...nextRow,
            totalActualAmount: null,
            displayAmount: row.estimatedAmount,
            differenceAmount: 0,
            hasActualPayroll: false,
          };
        }

        const normalizedNonTaxableAmount = nonTaxableAmount ?? 0;
        const totalActualAmount = taxableAmount + normalizedNonTaxableAmount;

        return {
          ...nextRow,
          totalActualAmount,
          displayAmount: totalActualAmount,
          differenceAmount: totalActualAmount - row.estimatedAmount,
          hasActualPayroll: true,
        };
      }),
    );
  };

  const handleSave = async () => {
    const payloadRows = [];

    for (const row of rows) {
      const taxableAmount = parseCurrencyInput(row.taxableAmount);
      const nonTaxableAmount = parseCurrencyInput(row.nonTaxableAmount);
      const trimmedNote = row.note.trim();

      const hasAnyValue =
        row.taxableAmount.trim().length > 0 ||
        row.nonTaxableAmount.trim().length > 0 ||
        trimmedNote.length > 0;

      if (!hasAnyValue) {
        payloadRows.push({
          workplaceId: row.workplaceId,
          taxableAmount: null,
          nonTaxableAmount: null,
          note: null,
        });
        continue;
      }

      if (taxableAmount === null) {
        toast.error(messages.error.validation, {
          description: `${row.workplaceName} の課税対象額を0以上で入力してください。`,
        });
        return;
      }

      payloadRows.push({
        workplaceId: row.workplaceId,
        taxableAmount,
        nonTaxableAmount: nonTaxableAmount ?? 0,
        note: trimmedNote.length > 0 ? trimmedNote : null,
      });
    }

    setIsSaving(true);
    const loadingToastId = toast.loading("実給与を保存中です...");

    try {
      const response = await fetch(
        `/api/payroll/actual?month=${requestedMonthValue}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rows: payloadRows }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          payload?.error?.message ?? messages.error.actualPayrollSaveFailed,
        );
      }

      const payload = (await response.json()) as {
        data: ActualPayrollEditorResult;
      };

      queryClient.setQueryData(
        queryKeys.payroll.actual({
          userId: currentUserId,
          month: requestedMonthValue,
        }),
        payload.data,
      );
      await invalidateAfterActualPayrollMutation(queryClient);
      setRows(toEditableRows(payload.data));
      toast.success(messages.success.actualPayrollSaved);
    } catch (error) {
      console.error("failed to save actual payroll", error);
      toast.error(messages.error.actualPayrollSaveFailed, {
        description: toErrorMessage(
          error,
          messages.error.actualPayrollSaveFailed,
        ),
        duration: 6000,
      });
    } finally {
      toast.dismiss(loadingToastId);
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Actual Payroll
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">実給与編集</h2>
          <p className="text-sm text-muted-foreground">
            {selectedMonthLabel}支給分の実績金額を勤務先ごとに登録します。
          </p>
        </div>

        {!isInitialLoading ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBackToCurrentMonth}
              disabled={
                requestedMonthValue === currentMonthValue || isRefreshing
              }
            >
              今月に戻る
            </Button>
            <Input
              type="month"
              value={draftMonthValue}
              disabled={isRefreshing || isSaving}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setRequestedMonthValue(draftMonthValue);
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
              onClick={() => setRequestedMonthValue(draftMonthValue)}
              disabled={!canApplyMonth || isRefreshing || isSaving}
            >
              適用
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isInitialLoading || isRefreshing || isSaving}
            >
              保存
            </Button>
          </div>
        ) : null}
      </header>

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isInitialLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="実給与データを読み込み中..."
        />
      ) : (
        <LoadingOverlay
          isLoading={isRefreshing || isSaving}
          className="rounded-xl"
        >
          <Card className="border-border/80 bg-card/95 shadow-sm">
            <CardHeader>
              <CardTitle>勤務先別 実給与入力</CardTitle>
              <CardDescription>
                課税対象額と非課税対象額を入力すると、サマリーと給与詳細に優先反映されます。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/35">
                    <TableRow>
                      <TableHead>勤務先</TableHead>
                      <TableHead>対象期間</TableHead>
                      <TableHead className="text-right">概算</TableHead>
                      <TableHead className="text-right">課税対象</TableHead>
                      <TableHead className="text-right">非課税対象</TableHead>
                      <TableHead className="text-right">実合計</TableHead>
                      <TableHead className="text-right">差額</TableHead>
                      <TableHead>メモ</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length > 0 ? (
                      rows.map((row) => (
                        <TableRow key={row.workplaceId}>
                          <TableCell className="font-medium">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: row.workplaceColor }}
                              />
                              {row.workplaceName}
                            </span>
                          </TableCell>
                          <TableCell>
                            {row.periodStartDate} 〜 {row.periodEndDate}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.estimatedAmount)}
                          </TableCell>
                          <TableCell className="min-w-32">
                            <Input
                              inputMode="numeric"
                              value={row.taxableAmount}
                              disabled={isRefreshing || isSaving}
                              onChange={(event) =>
                                handleAmountChange(
                                  row.workplaceId,
                                  "taxableAmount",
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="min-w-32">
                            <Input
                              inputMode="numeric"
                              value={row.nonTaxableAmount}
                              disabled={isRefreshing || isSaving}
                              onChange={(event) =>
                                handleAmountChange(
                                  row.workplaceId,
                                  "nonTaxableAmount",
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {row.totalActualAmount === null
                              ? "未登録"
                              : formatCurrency(row.totalActualAmount)}
                          </TableCell>
                          <TableCell
                            className={
                              row.differenceAmount > 0
                                ? "text-right text-emerald-600"
                                : row.differenceAmount < 0
                                  ? "text-right text-amber-700"
                                  : "text-right"
                            }
                          >
                            {row.totalActualAmount === null
                              ? "-"
                              : formatCurrency(row.differenceAmount)}
                          </TableCell>
                          <TableCell className="min-w-48">
                            <Input
                              value={row.note}
                              disabled={isRefreshing || isSaving}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value;
                                setRows((current) =>
                                  current.map((item) =>
                                    item.workplaceId === row.workplaceId
                                      ? { ...item, note: nextValue }
                                      : item,
                                  ),
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isRefreshing || isSaving}
                              onClick={() => handleClearRow(row.workplaceId)}
                            >
                              クリア
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="h-24 text-center text-muted-foreground"
                        >
                          登録対象の勤務先がありません
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </LoadingOverlay>
      )}
    </section>
  );
}

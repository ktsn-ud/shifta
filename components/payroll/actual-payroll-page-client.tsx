"use client";

import { useReducer } from "react";
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
import { formatMonthLabel, fromMonthInputValue } from "@/lib/calendar/date";
import { messages, toErrorMessage } from "@/lib/messages";
import { type ActualPayrollEditorResult } from "@/lib/payroll/actual-editor";
import { invalidateAfterActualPayrollMutation } from "@/lib/query/invalidation";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { useActualPayrollQuery } from "@/lib/query/queries/payroll";
import { queryKeys } from "@/lib/query/query-keys";

type ActualPayrollPageClientProps = {
  currentUserId: string;
  initialMonth: string;
  currentMonthValue: string;
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

type ActualPayrollFilterState = {
  draftMonthValue: string;
  requestedMonthValue: string;
};

type ActualPayrollFilterAction =
  | { type: "setDraftMonthValue"; value: string }
  | { type: "setRequestedMonthValue"; value: string }
  | { type: "resetToCurrentMonth"; currentMonthValue: string };

type ActualPayrollEditorState = {
  rows: EditableRow[];
  isSaving: boolean;
};

type ActualPayrollEditorAction =
  | { type: "hydrate"; data: ActualPayrollEditorResult }
  | {
      type: "updateAmount";
      workplaceId: string;
      field: "taxableAmount" | "nonTaxableAmount";
      value: string;
    }
  | { type: "updateNote"; workplaceId: string; value: string }
  | { type: "clearRow"; workplaceId: string }
  | { type: "setSaving"; isSaving: boolean };

type ActualPayrollEditorScreenProps = {
  currentUserId: string;
  currentMonthValue: string;
  requestedMonthValue: string;
  draftMonthValue: string;
  canApplyMonth: boolean;
  selectedMonthLabel: string;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  errorMessage: string | null;
  data: ActualPayrollEditorResult;
  onDraftMonthValueChange: (value: string) => void;
  onApplyMonth: () => void;
  onBackToCurrentMonth: () => void;
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

function createActualPayrollFilterState(
  initialMonth: string,
): ActualPayrollFilterState {
  return {
    draftMonthValue: initialMonth,
    requestedMonthValue: initialMonth,
  };
}

function actualPayrollFilterReducer(
  state: ActualPayrollFilterState,
  action: ActualPayrollFilterAction,
): ActualPayrollFilterState {
  switch (action.type) {
    case "setDraftMonthValue":
      return {
        ...state,
        draftMonthValue: action.value,
      };
    case "setRequestedMonthValue":
      return {
        ...state,
        requestedMonthValue: action.value,
      };
    case "resetToCurrentMonth":
      return {
        draftMonthValue: action.currentMonthValue,
        requestedMonthValue: action.currentMonthValue,
      };
  }
}

function createActualPayrollEditorState(
  data: ActualPayrollEditorResult,
): ActualPayrollEditorState {
  return {
    rows: toEditableRows(data),
    isSaving: false,
  };
}

function actualPayrollEditorReducer(
  state: ActualPayrollEditorState,
  action: ActualPayrollEditorAction,
): ActualPayrollEditorState {
  switch (action.type) {
    case "hydrate":
      return createActualPayrollEditorState(action.data);
    case "updateAmount":
      return {
        ...state,
        rows: state.rows.map((row) => {
          if (row.workplaceId !== action.workplaceId) {
            return row;
          }

          const nextRow = {
            ...row,
            [action.field]: action.value,
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
      };
    case "updateNote":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.workplaceId === action.workplaceId
            ? { ...row, note: action.value }
            : row,
        ),
      };
    case "clearRow":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.workplaceId === action.workplaceId
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
      };
    case "setSaving":
      return {
        ...state,
        isSaving: action.isSaving,
      };
  }
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

function ActualPayrollEditorScreen({
  currentUserId,
  currentMonthValue,
  requestedMonthValue,
  draftMonthValue,
  canApplyMonth,
  selectedMonthLabel,
  isInitialLoading,
  isRefreshing,
  errorMessage,
  data,
  onDraftMonthValueChange,
  onApplyMonth,
  onBackToCurrentMonth,
}: ActualPayrollEditorScreenProps) {
  const queryClient = getBrowserQueryClient();
  const [state, dispatch] = useReducer(
    actualPayrollEditorReducer,
    data,
    createActualPayrollEditorState,
  );

  const handleSave = async () => {
    const payloadRows = [];

    for (const row of state.rows) {
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

    dispatch({ type: "setSaving", isSaving: true });
    const loadingToastId = toast.loading("実給与を保存中です...");

    try {
      const response = await fetch(`/api/payroll/actual?month=${data.month}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows: payloadRows }),
      });

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
          month: data.month,
        }),
        payload.data,
      );
      await invalidateAfterActualPayrollMutation(queryClient);
      dispatch({
        type: "hydrate",
        data: payload.data,
      });
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
      dispatch({ type: "setSaving", isSaving: false });
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
              onClick={onBackToCurrentMonth}
              disabled={
                requestedMonthValue === currentMonthValue ||
                isRefreshing ||
                state.isSaving
              }
            >
              今月に戻る
            </Button>
            <Input
              type="month"
              value={draftMonthValue}
              disabled={isRefreshing || state.isSaving}
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
              disabled={!canApplyMonth || isRefreshing || state.isSaving}
            >
              適用
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isInitialLoading || isRefreshing || state.isSaving}
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
          isLoading={isRefreshing || state.isSaving}
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
                    {state.rows.length > 0 ? (
                      state.rows.map((row) => (
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
                              disabled={isRefreshing || state.isSaving}
                              onChange={(event) =>
                                dispatch({
                                  type: "updateAmount",
                                  workplaceId: row.workplaceId,
                                  field: "taxableAmount",
                                  value: event.currentTarget.value,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="min-w-32">
                            <Input
                              inputMode="numeric"
                              value={row.nonTaxableAmount}
                              disabled={isRefreshing || state.isSaving}
                              onChange={(event) =>
                                dispatch({
                                  type: "updateAmount",
                                  workplaceId: row.workplaceId,
                                  field: "nonTaxableAmount",
                                  value: event.currentTarget.value,
                                })
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
                              disabled={isRefreshing || state.isSaving}
                              onChange={(event) => {
                                dispatch({
                                  type: "updateNote",
                                  workplaceId: row.workplaceId,
                                  value: event.currentTarget.value,
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isRefreshing || state.isSaving}
                              onClick={() =>
                                dispatch({
                                  type: "clearRow",
                                  workplaceId: row.workplaceId,
                                })
                              }
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

export function ActualPayrollPageClient({
  currentUserId,
  initialMonth,
  currentMonthValue,
  initialData,
}: ActualPayrollPageClientProps) {
  const [filterState, dispatch] = useReducer(
    actualPayrollFilterReducer,
    initialMonth,
    createActualPayrollFilterState,
  );

  const isValidRequestedMonth =
    fromMonthInputValue(filterState.requestedMonthValue) !== null;
  const canApplyMonth =
    fromMonthInputValue(filterState.draftMonthValue) !== null &&
    filterState.draftMonthValue !== filterState.requestedMonthValue;

  const actualPayrollQuery = useActualPayrollQuery({
    userId: currentUserId,
    month: filterState.requestedMonthValue,
    enabled: isValidRequestedMonth,
    initialData:
      isValidRequestedMonth && filterState.requestedMonthValue === initialMonth
        ? initialData
        : undefined,
  });

  const data = actualPayrollQuery.data ?? null;
  const displayMonthValue = data?.month ?? filterState.requestedMonthValue;
  const selectedMonth =
    fromMonthInputValue(displayMonthValue) ??
    fromMonthInputValue(currentMonthValue);
  const selectedMonthLabel = selectedMonth
    ? formatMonthLabel(selectedMonth)
    : displayMonthValue;
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

  return (
    <ActualPayrollEditorScreen
      key={data?.month ?? filterState.requestedMonthValue}
      currentUserId={currentUserId}
      currentMonthValue={currentMonthValue}
      requestedMonthValue={filterState.requestedMonthValue}
      draftMonthValue={filterState.draftMonthValue}
      canApplyMonth={canApplyMonth}
      selectedMonthLabel={selectedMonthLabel}
      isInitialLoading={isInitialLoading}
      isRefreshing={isRefreshing}
      errorMessage={errorMessage}
      data={data ?? initialData}
      onDraftMonthValueChange={(value) => {
        dispatch({
          type: "setDraftMonthValue",
          value,
        });
      }}
      onApplyMonth={() => {
        if (fromMonthInputValue(filterState.draftMonthValue) === null) {
          return;
        }

        dispatch({
          type: "setRequestedMonthValue",
          value: filterState.draftMonthValue,
        });
      }}
      onBackToCurrentMonth={() => {
        dispatch({
          type: "resetToCurrentMonth",
          currentMonthValue,
        });
      }}
    />
  );
}

"use client";

import { useReducer } from "react";
import { toast } from "sonner";
import { AsyncStateNotice } from "@/components/ui/async-state-notice";
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
  displayMonthValue: string;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isStaleView: boolean;
  errorMessage: string | null;
  data: ActualPayrollEditorResult;
  onDraftMonthValueChange: (value: string) => void;
  onApplyMonth: () => void;
  onBackToCurrentMonth: () => void;
};

type ActualPayrollHeaderProps = {
  selectedMonthLabel: string;
  actions: {
    draftMonthValue: string;
    backToCurrentMonthDisabled: boolean;
    monthInputDisabled: boolean;
    applyDisabled: boolean;
    saveDisabled: boolean;
    isRefreshing: boolean;
    isSaving: boolean;
    onDraftMonthValueChange: (value: string) => void;
    onApplyMonth: () => void;
    onBackToCurrentMonth: () => void;
    onSave: () => void;
  } | null;
};

type ActualPayrollHeaderActions = NonNullable<
  ActualPayrollHeaderProps["actions"]
>;

type ActualPayrollTableCardProps = {
  rows: EditableRow[];
  isDisabled: boolean;
  onTaxableChange: (workplaceId: string, value: string) => void;
  onNonTaxableChange: (workplaceId: string, value: string) => void;
  onNoteChange: (workplaceId: string, value: string) => void;
  onClear: (workplaceId: string) => void;
};

type ActualPayrollTableRowProps = {
  row: EditableRow;
  isDisabled: boolean;
  onTaxableChange: (value: string) => void;
  onNonTaxableChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onClear: () => void;
};

type ActualPayrollScreenState = {
  data: ActualPayrollEditorResult;
  selectedMonthLabel: string;
  displayMonthValue: string;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isStaleView: boolean;
  errorMessage: string | null;
};

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function renderActualPayrollHeaderActions(actions: ActualPayrollHeaderActions) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={actions.onBackToCurrentMonth}
        disabled={actions.backToCurrentMonthDisabled}
      >
        今月に戻る
      </Button>
      <Input
        type="month"
        value={actions.draftMonthValue}
        disabled={actions.monthInputDisabled}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            actions.onApplyMonth();
          }
        }}
        onChange={(event) => {
          actions.onDraftMonthValueChange(event.currentTarget.value);
        }}
        className="w-44"
      />
      <Button
        type="button"
        size="sm"
        onClick={actions.onApplyMonth}
        disabled={actions.applyDisabled}
      >
        {actions.isRefreshing && !actions.isSaving ? "更新中..." : "適用"}
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={actions.onSave}
        disabled={actions.saveDisabled}
      >
        {actions.isSaving ? "保存中..." : "保存"}
      </Button>
    </div>
  );
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

function getDifferenceAmountClassName(differenceAmount: number): string {
  if (differenceAmount > 0) {
    return "text-right text-emerald-600";
  }

  if (differenceAmount < 0) {
    return "text-right text-amber-700";
  }

  return "text-right";
}

function buildActualPayrollScreenState(params: {
  currentMonthValue: string;
  requestedMonthValue: string;
  queryData: ActualPayrollEditorResult | null;
  queryError: unknown;
  isValidRequestedMonth: boolean;
  isLoading: boolean;
  isFetching: boolean;
}): ActualPayrollScreenState {
  const {
    currentMonthValue,
    requestedMonthValue,
    queryData,
    queryError,
    isValidRequestedMonth,
    isLoading,
    isFetching,
  } = params;

  const data = queryData;
  const displayMonthValue = data?.month ?? requestedMonthValue;
  const selectedMonth =
    fromMonthInputValue(displayMonthValue) ??
    fromMonthInputValue(currentMonthValue);

  return {
    data: data as ActualPayrollEditorResult,
    selectedMonthLabel: selectedMonth
      ? formatMonthLabel(selectedMonth)
      : displayMonthValue,
    displayMonthValue,
    isInitialLoading: isValidRequestedMonth && isLoading && data === null,
    isRefreshing: isValidRequestedMonth && isFetching && data !== null,
    isStaleView:
      isValidRequestedMonth && displayMonthValue !== requestedMonthValue,
    errorMessage: !isValidRequestedMonth
      ? "月は YYYY-MM 形式で指定してください。"
      : queryError
        ? toErrorMessage(queryError, "実給与データの取得に失敗しました。")
        : null,
  };
}

function ActualPayrollHeader({
  selectedMonthLabel,
  actions,
}: ActualPayrollHeaderProps) {
  return (
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

      {actions ? renderActualPayrollHeaderActions(actions) : null}
    </header>
  );
}

function ActualPayrollTableRow({
  row,
  isDisabled,
  onTaxableChange,
  onNonTaxableChange,
  onNoteChange,
  onClear,
}: ActualPayrollTableRowProps) {
  return (
    <TableRow>
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
          disabled={isDisabled}
          onChange={(event) => {
            onTaxableChange(event.currentTarget.value);
          }}
        />
      </TableCell>
      <TableCell className="min-w-32">
        <Input
          inputMode="numeric"
          value={row.nonTaxableAmount}
          disabled={isDisabled}
          onChange={(event) => {
            onNonTaxableChange(event.currentTarget.value);
          }}
        />
      </TableCell>
      <TableCell className="text-right font-semibold text-primary">
        {row.totalActualAmount === null
          ? "未登録"
          : formatCurrency(row.totalActualAmount)}
      </TableCell>
      <TableCell className={getDifferenceAmountClassName(row.differenceAmount)}>
        {row.totalActualAmount === null
          ? "-"
          : formatCurrency(row.differenceAmount)}
      </TableCell>
      <TableCell className="min-w-48">
        <Input
          value={row.note}
          disabled={isDisabled}
          onChange={(event) => {
            onNoteChange(event.currentTarget.value);
          }}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isDisabled}
          onClick={onClear}
        >
          クリア
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ActualPayrollTableCard({
  rows,
  isDisabled,
  onTaxableChange,
  onNonTaxableChange,
  onNoteChange,
  onClear,
}: ActualPayrollTableCardProps) {
  return (
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
                  <ActualPayrollTableRow
                    key={row.workplaceId}
                    row={row}
                    isDisabled={isDisabled}
                    onTaxableChange={(value) => {
                      onTaxableChange(row.workplaceId, value);
                    }}
                    onNonTaxableChange={(value) => {
                      onNonTaxableChange(row.workplaceId, value);
                    }}
                    onNoteChange={(value) => {
                      onNoteChange(row.workplaceId, value);
                    }}
                    onClear={() => {
                      onClear(row.workplaceId);
                    }}
                  />
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
  );
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
  displayMonthValue,
  isInitialLoading,
  isRefreshing,
  isStaleView,
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
  const isDisabled = isInitialLoading || isRefreshing || state.isSaving;

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
      <ActualPayrollHeader
        selectedMonthLabel={selectedMonthLabel}
        actions={
          isInitialLoading
            ? null
            : {
                draftMonthValue,
                backToCurrentMonthDisabled:
                  requestedMonthValue === currentMonthValue || isDisabled,
                monthInputDisabled: isDisabled,
                applyDisabled: !canApplyMonth || isDisabled,
                saveDisabled: isDisabled,
                isRefreshing,
                isSaving: state.isSaving,
                onDraftMonthValueChange,
                onApplyMonth,
                onBackToCurrentMonth,
                onSave: handleSave,
              }
        }
      />

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
        <>
          {isRefreshing ? (
            <AsyncStateNotice
              variant={isStaleView ? "stale" : "refresh"}
              title={
                isStaleView
                  ? `${requestedMonthValue} の実給与を読み込み中です。`
                  : "実給与の最新データを確認中です。"
              }
              description={
                isStaleView
                  ? `現在の表示は ${displayMonthValue} のままです。新しい月の実給与へ切り替わるまでこの内容を維持します。`
                  : "表示中の実給与データはまもなく最新化されます。"
              }
            />
          ) : null}

          {state.isSaving ? (
            <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
              実給与を保存中です。反映が完了するまでお待ちください。
            </p>
          ) : null}

          <LoadingOverlay
            isLoading={isRefreshing || state.isSaving}
            label={
              state.isSaving
                ? "実給与を保存中です..."
                : "最新データを確認中です。表示中の内容は前回取得分です。"
            }
            className="rounded-xl"
          >
            <ActualPayrollTableCard
              rows={state.rows}
              isDisabled={isRefreshing || state.isSaving}
              onTaxableChange={(workplaceId, value) => {
                dispatch({
                  type: "updateAmount",
                  workplaceId,
                  field: "taxableAmount",
                  value,
                });
              }}
              onNonTaxableChange={(workplaceId, value) => {
                dispatch({
                  type: "updateAmount",
                  workplaceId,
                  field: "nonTaxableAmount",
                  value,
                });
              }}
              onNoteChange={(workplaceId, value) => {
                dispatch({
                  type: "updateNote",
                  workplaceId,
                  value,
                });
              }}
              onClear={(workplaceId) => {
                dispatch({
                  type: "clearRow",
                  workplaceId,
                });
              }}
            />
          </LoadingOverlay>
        </>
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

  const screenState = buildActualPayrollScreenState({
    currentMonthValue,
    requestedMonthValue: filterState.requestedMonthValue,
    queryData: actualPayrollQuery.data ?? initialData,
    queryError: actualPayrollQuery.error,
    isValidRequestedMonth,
    isLoading: actualPayrollQuery.isLoading,
    isFetching: actualPayrollQuery.isFetching,
  });

  return (
    <ActualPayrollEditorScreen
      key={screenState.data.month}
      currentUserId={currentUserId}
      currentMonthValue={currentMonthValue}
      requestedMonthValue={filterState.requestedMonthValue}
      draftMonthValue={filterState.draftMonthValue}
      canApplyMonth={canApplyMonth}
      selectedMonthLabel={screenState.selectedMonthLabel}
      displayMonthValue={screenState.displayMonthValue}
      isInitialLoading={screenState.isInitialLoading}
      isRefreshing={screenState.isRefreshing}
      isStaleView={screenState.isStaleView}
      errorMessage={screenState.errorMessage}
      data={screenState.data}
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

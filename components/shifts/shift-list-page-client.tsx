"use client";

import { useMemo, useReducer } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addMonths,
  dateFromDateKey,
  dateKeyFromApiDate,
  formatMonthLabel,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { parseGoogleSyncStateFromPayload } from "@/lib/google-calendar/clientSync";
import { messages, toErrorMessage } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { removeShiftsFromMonthCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { formatShiftTimeRange } from "@/lib/shifts/time";
import { formatShiftWorkplaceLabel } from "@/lib/shifts/format";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";
import { type MonthShift, useMonthShifts } from "@/hooks/use-month-shifts";

type SortColumn =
  | "date"
  | "time"
  | "workplace"
  | "breakMinutes"
  | "estimatedPay";
type SortDirection = "asc" | "desc";

type SortState = {
  column: SortColumn;
  direction: SortDirection;
} | null;

type ShiftListState = {
  month: Date;
  sortState: SortState;
  selectedShiftIds: string[];
  deleteDialogOpen: boolean;
  isDeleting: boolean;
  deleteErrorMessage: string | null;
};

type ShiftListAction =
  | { type: "setMonth"; month: Date }
  | { type: "toggleSort"; column: SortColumn }
  | { type: "resetSort" }
  | { type: "setSelectedShiftIds"; selectedShiftIds: string[] }
  | { type: "openDeleteDialog" }
  | { type: "closeDeleteDialog" }
  | { type: "startDelete" }
  | { type: "finishDeleteSuccess" }
  | {
      type: "finishDeleteFailure";
      selectedShiftIds: string[];
      message: string;
    };

const shiftDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  timeZone: "UTC",
});
const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatDate(value: string): string {
  return shiftDateFormatter.format(new Date(value));
}

function formatTime(value: string): string {
  const date = new Date(value);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatTimeRange(shift: MonthShift): string {
  return formatShiftTimeRange(
    formatTime(shift.startTime),
    formatTime(shift.endTime),
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return currencyFormatter.format(value);
}

function compareByDefault(left: MonthShift, right: MonthShift): number {
  const dateCompare = dateKeyFromApiDate(left.date).localeCompare(
    dateKeyFromApiDate(right.date),
  );
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const timeCompare = left.startTime.localeCompare(right.startTime);
  if (timeCompare !== 0) {
    return timeCompare;
  }

  return left.id.localeCompare(right.id);
}

function compareNullableEstimatedPay(
  left: number | null,
  right: number | null,
  direction: SortDirection,
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function isSameMonth(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function compareShifts(
  left: MonthShift,
  right: MonthShift,
  sortState: SortState,
): number {
  if (!sortState) {
    return compareByDefault(left, right);
  }

  if (sortState.column === "estimatedPay") {
    const payCompare = compareNullableEstimatedPay(
      left.estimatedPay,
      right.estimatedPay,
      sortState.direction,
    );

    if (payCompare !== 0) {
      return payCompare;
    }

    return compareByDefault(left, right);
  }

  let baseCompare = 0;

  if (sortState.column === "date") {
    baseCompare = dateKeyFromApiDate(left.date).localeCompare(
      dateKeyFromApiDate(right.date),
    );
    if (baseCompare === 0) {
      baseCompare = left.startTime.localeCompare(right.startTime);
    }
  }

  if (sortState.column === "time") {
    baseCompare = left.startTime.localeCompare(right.startTime);
    if (baseCompare === 0) {
      baseCompare = dateKeyFromApiDate(left.date).localeCompare(
        dateKeyFromApiDate(right.date),
      );
    }
  }

  if (sortState.column === "workplace") {
    const leftWorkplace = formatShiftWorkplaceLabel({
      workplaceName: left.workplace.name,
      workplaceType: left.workplace.type,
      shiftType: left.shiftType,
      comment: left.comment,
    });
    const rightWorkplace = formatShiftWorkplaceLabel({
      workplaceName: right.workplace.name,
      workplaceType: right.workplace.type,
      shiftType: right.shiftType,
      comment: right.comment,
    });

    baseCompare = leftWorkplace.localeCompare(rightWorkplace, "ja");
  }

  if (sortState.column === "breakMinutes") {
    baseCompare = left.breakMinutes - right.breakMinutes;
  }

  if (baseCompare === 0) {
    baseCompare = compareByDefault(left, right);
  }

  return sortState.direction === "asc" ? baseCompare : -baseCompare;
}

function createInitialShiftListState(initialMonth: string): ShiftListState {
  const parsedMonth = fromMonthInputValue(initialMonth);

  return {
    month: startOfMonth(parsedMonth ?? new Date()),
    sortState: null,
    selectedShiftIds: [],
    deleteDialogOpen: false,
    isDeleting: false,
    deleteErrorMessage: null,
  };
}

function shiftListReducer(
  state: ShiftListState,
  action: ShiftListAction,
): ShiftListState {
  switch (action.type) {
    case "setMonth":
      return {
        ...state,
        month: action.month,
      };
    case "toggleSort":
      if (!state.sortState || state.sortState.column !== action.column) {
        return {
          ...state,
          sortState: {
            column: action.column,
            direction: "asc",
          },
        };
      }

      return {
        ...state,
        sortState: {
          column: action.column,
          direction: state.sortState.direction === "asc" ? "desc" : "asc",
        },
      };
    case "resetSort":
      return {
        ...state,
        sortState: null,
      };
    case "setSelectedShiftIds":
      return {
        ...state,
        selectedShiftIds: action.selectedShiftIds,
      };
    case "openDeleteDialog":
      return {
        ...state,
        deleteDialogOpen: true,
        deleteErrorMessage: null,
      };
    case "closeDeleteDialog":
      return {
        ...state,
        deleteDialogOpen: false,
        deleteErrorMessage: null,
      };
    case "startDelete":
      return {
        ...state,
        isDeleting: true,
        deleteErrorMessage: null,
        selectedShiftIds: [],
      };
    case "finishDeleteSuccess":
      return {
        ...state,
        deleteDialogOpen: false,
        isDeleting: false,
        deleteErrorMessage: null,
      };
    case "finishDeleteFailure":
      return {
        ...state,
        isDeleting: false,
        deleteErrorMessage: action.message,
        selectedShiftIds: action.selectedShiftIds,
      };
  }
}

type SortToggleButtonProps = {
  column: SortColumn;
  sortState: SortState;
  align?: "left" | "right";
  label: string;
  onToggle: (column: SortColumn) => void;
};

function SortToggleButton({
  column,
  sortState,
  align = "left",
  label,
  onToggle,
}: SortToggleButtonProps) {
  const icon =
    !sortState || sortState.column !== column ? (
      <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />
    ) : sortState.direction === "asc" ? (
      <ArrowUpIcon className="size-3.5" />
    ) : (
      <ArrowDownIcon className="size-3.5" />
    );

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={align === "right" ? "ml-auto h-8 px-2" : "-ml-2 h-8 px-2"}
      onClick={() => onToggle(column)}
      aria-label={`${label}で並び替え`}
    >
      {label}
      {icon}
    </Button>
  );
}

type ShiftListPageClientProps = {
  currentUserId: string;
  initialMonth: string;
  initialMonthShifts: MonthShift[];
  initialMonthStartDate: string;
  initialMonthEndDate: string;
  todayDate: string;
};

export function ShiftListPageClient({
  currentUserId,
  initialMonth,
  initialMonthShifts,
  initialMonthStartDate,
  initialMonthEndDate,
  todayDate,
}: ShiftListPageClientProps) {
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const [state, dispatch] = useReducer(
    shiftListReducer,
    initialMonth,
    createInitialShiftListState,
  );

  const { shifts, displayMonth, isInitialLoading, isRefreshing, errorMessage } =
    useMonthShifts(state.month, {
      cacheUserKey: currentUserId,
      initialShifts: initialMonthShifts,
      initialStartDate: initialMonthStartDate,
      initialEndDate: initialMonthEndDate,
    });

  const sortedShifts = useMemo(() => {
    return shifts.toSorted((left, right) =>
      compareShifts(left, right, state.sortState),
    );
  }, [shifts, state.sortState]);

  const currentMonth = useMemo(
    () => startOfMonth(dateFromDateKey(todayDate) ?? new Date()),
    [todayDate],
  );
  const visibleShiftIdSet = useMemo(
    () => new Set(shifts.map((shift) => shift.id)),
    [shifts],
  );
  const selectedShiftIds = useMemo(
    () =>
      state.selectedShiftIds.filter((shiftId) =>
        visibleShiftIdSet.has(shiftId),
      ),
    [state.selectedShiftIds, visibleShiftIdSet],
  );
  const selectedShiftIdSet = useMemo(
    () => new Set(selectedShiftIds),
    [selectedShiftIds],
  );
  const isCurrentMonth = isSameMonth(displayMonth, currentMonth);
  const selectedCount = selectedShiftIds.length;
  const monthValue = toMonthInputValue(displayMonth);

  const isAllSelected =
    sortedShifts.length > 0 &&
    sortedShifts.every((shift) => selectedShiftIdSet.has(shift.id));
  const isSomeSelected =
    sortedShifts.some((shift) => selectedShiftIdSet.has(shift.id)) &&
    !isAllSelected;

  function handleToggleSort(column: SortColumn) {
    dispatch({
      type: "toggleSort",
      column,
    });
  }

  function handleToggleShiftSelection(shiftId: string, checked: boolean) {
    const next = new Set(
      state.selectedShiftIds.filter((currentShiftId) =>
        visibleShiftIdSet.has(currentShiftId),
      ),
    );

    if (checked) {
      next.add(shiftId);
    } else {
      next.delete(shiftId);
    }

    dispatch({
      type: "setSelectedShiftIds",
      selectedShiftIds: Array.from(next),
    });
  }

  function handleSelectAll(checked: boolean) {
    if (!checked) {
      dispatch({
        type: "setSelectedShiftIds",
        selectedShiftIds: [],
      });
      return;
    }

    dispatch({
      type: "setSelectedShiftIds",
      selectedShiftIds: sortedShifts.map((shift) => shift.id),
    });
  }

  function handleEditShift(shiftId: string) {
    const params = new URLSearchParams({
      month: monthValue,
      returnTo: "list",
    });
    router.push(`/my/shifts/${shiftId}/edit?${params.toString()}`);
  }

  async function handleBulkDelete() {
    if (selectedShiftIds.length === 0 || state.isDeleting) {
      return;
    }

    const shiftIds = selectedShiftIds;
    const rollback = removeShiftsFromMonthCachesOptimistically(
      queryClient,
      shiftIds,
    );

    dispatch({ type: "startDelete" });

    try {
      const response = await fetch("/api/shifts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftIds }),
      });

      if (response.ok === false) {
        const resolved = await resolveUserFacingErrorFromResponse(
          response,
          messages.error.shiftDeleteFailed,
        );
        throw new Error(resolved.message);
      }

      const payload = (await response.json().catch(() => null)) as {
        deletedCount?: number;
      } | null;

      const deletedCount = payload?.deletedCount ?? shiftIds.length;
      const syncState = parseGoogleSyncStateFromPayload(
        payload,
        messages.error.calendarSyncFailed,
      );

      dispatch({ type: "finishDeleteSuccess" });
      void invalidateAfterShiftMutation(queryClient, {
        mode: "background",
      });

      toast.success(messages.success.shiftDeleted, {
        description: buildMutationSuccessDescription({
          baseDescription: `${deletedCount}件のシフトを削除しました。`,
          syncPending: syncState.pending,
        }),
      });
    } catch (error) {
      rollback();

      console.error("failed to bulk delete shifts", error);
      const message = toErrorMessage(error, messages.error.shiftDeleteFailed);
      dispatch({
        type: "finishDeleteFailure",
        selectedShiftIds: shiftIds,
        message,
      });
      toast.error(messages.error.shiftDeleteFailed, {
        description: message,
        duration: 6000,
      });
    }
  }

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Shift List
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">シフト一覧</h2>
          <p className="text-sm text-muted-foreground">
            月ごとのシフトを確認し、並び替え・一括削除できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              dispatch({
                type: "setMonth",
                month: addMonths(displayMonth, -1),
              })
            }
            disabled={isRefreshing}
          >
            <ChevronLeftIcon className="size-4" />
            前月
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              dispatch({
                type: "setMonth",
                month: addMonths(displayMonth, 1),
              })
            }
            disabled={isRefreshing}
          >
            次月
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              dispatch({
                type: "setMonth",
                month: currentMonth,
              })
            }
            disabled={isCurrentMonth || isRefreshing}
          >
            今月に戻る
          </Button>
        </div>
      </header>

      <LoadingOverlay isLoading={isRefreshing} className="rounded-xl">
        <Card className="border-border/80 bg-card/95 shadow-sm">
          <CardHeader className="flex flex-col gap-3 border-b border-border/70 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-lg font-semibold">
              {formatMonthLabel(displayMonth)}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => dispatch({ type: "resetSort" })}
                disabled={state.sortState === null}
              >
                デフォルト表示に戻す
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => dispatch({ type: "openDeleteDialog" })}
                disabled={selectedCount === 0 || state.isDeleting}
              >
                <Trash2Icon className="size-4" />
                選択したシフトを削除
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-muted-foreground">
              {sortedShifts.length}件表示 / {selectedCount}件選択中
            </p>

            {errorMessage ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            {isInitialLoading ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                シフトを読み込み中です...
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/35">
                    <TableRow>
                      <TableHead className="w-10">
                        <div
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={isAllSelected}
                            indeterminate={isSomeSelected}
                            onCheckedChange={(checked) =>
                              handleSelectAll(Boolean(checked))
                            }
                            aria-label="表示中のシフトを全選択"
                          />
                        </div>
                      </TableHead>
                      <TableHead>
                        <SortToggleButton
                          column="date"
                          sortState={state.sortState}
                          label="日付"
                          onToggle={handleToggleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortToggleButton
                          column="time"
                          sortState={state.sortState}
                          label="時間"
                          onToggle={handleToggleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortToggleButton
                          column="workplace"
                          sortState={state.sortState}
                          label="勤務先"
                          onToggle={handleToggleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortToggleButton
                          column="breakMinutes"
                          sortState={state.sortState}
                          label="休憩時間"
                          onToggle={handleToggleSort}
                        />
                      </TableHead>
                      <TableHead className="text-right">
                        <SortToggleButton
                          column="estimatedPay"
                          sortState={state.sortState}
                          align="right"
                          label="給与"
                          onToggle={handleToggleSort}
                        />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody data-testid="shift-list-table-body">
                    {sortedShifts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-24 text-center text-muted-foreground"
                        >
                          表示対象のシフトがありません。
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedShifts.map((shift) => {
                        const workplaceLabel = formatShiftWorkplaceLabel({
                          workplaceName: shift.workplace.name,
                          workplaceType: shift.workplace.type,
                          shiftType: shift.shiftType,
                          comment: shift.comment,
                        });
                        const isSelected = selectedShiftIdSet.has(shift.id);

                        return (
                          <TableRow
                            key={shift.id}
                            data-state={isSelected ? "selected" : undefined}
                            className="transition-colors data-[state=selected]:bg-primary/10"
                          >
                            <TableCell className="w-10">
                              <div
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                }}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) =>
                                    handleToggleShiftSelection(
                                      shift.id,
                                      Boolean(checked),
                                    )
                                  }
                                  aria-label={`${formatDate(shift.date)}のシフトを選択`}
                                />
                              </div>
                            </TableCell>
                            <TableCell>{formatDate(shift.date)}</TableCell>
                            <TableCell>{formatTimeRange(shift)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  aria-hidden
                                  className="size-2.5 rounded-full"
                                  style={{
                                    backgroundColor: shift.workplace.color,
                                  }}
                                />
                                <button
                                  type="button"
                                  className="text-left hover:underline"
                                  onClick={() => handleEditShift(shift.id)}
                                >
                                  {workplaceLabel}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell>{shift.breakMinutes}分</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(shift.estimatedPay)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </LoadingOverlay>

      <Dialog
        open={state.deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          dispatch({
            type: nextOpen ? "openDeleteDialog" : "closeDeleteDialog",
          });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選択したシフトを削除しますか？</DialogTitle>
            <DialogDescription>
              {selectedCount}件のシフトを削除します。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>

          {state.deleteErrorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.deleteErrorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={state.isDeleting}
              onClick={() => dispatch({ type: "closeDeleteDialog" })}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={state.isDeleting || selectedCount === 0}
              onClick={() => {
                void handleBulkDelete();
              }}
            >
              {state.isDeleting ? "削除中..." : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

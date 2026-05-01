"use client";

import { useEffect, useMemo, useState } from "react";
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
  dateKeyFromApiDate,
  formatMonthLabel,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { clearShiftDerivedCaches } from "@/lib/client-cache/shift-derived-cache";
import { messages, toErrorMessage } from "@/lib/messages";
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  const date = new Date(value);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatTimeRange(shift: MonthShift): string {
  return `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)}`;
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
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

type ShiftListPageClientProps = {
  currentUserId: string;
  initialMonth: string;
  initialMonthShifts: MonthShift[];
  initialMonthStartDate: string;
  initialMonthEndDate: string;
};

export function ShiftListPageClient({
  currentUserId,
  initialMonth,
  initialMonthShifts,
  initialMonthStartDate,
  initialMonthEndDate,
}: ShiftListPageClientProps) {
  const router = useRouter();
  const [month, setMonth] = useState(() => {
    const parsedMonth = fromMonthInputValue(initialMonth);
    return startOfMonth(parsedMonth ?? new Date());
  });
  const [sortState, setSortState] = useState<SortState>(null);
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(
    null,
  );

  const { shifts, isLoading, errorMessage, reload } = useMonthShifts(month, {
    cacheUserKey: currentUserId,
    initialShifts: initialMonthShifts,
    initialStartDate: initialMonthStartDate,
    initialEndDate: initialMonthEndDate,
  });

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((left, right) =>
      compareShifts(left, right, sortState),
    );
  }, [shifts, sortState]);

  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() &&
    month.getMonth() === now.getMonth();
  const selectedCount = selectedShiftIds.size;
  const monthValue = toMonthInputValue(month);

  const isAllSelected =
    sortedShifts.length > 0 &&
    sortedShifts.every((shift) => selectedShiftIds.has(shift.id));
  const isSomeSelected =
    sortedShifts.some((shift) => selectedShiftIds.has(shift.id)) &&
    !isAllSelected;

  useEffect(() => {
    const nextMonth = startOfMonth(
      fromMonthInputValue(initialMonth) ?? new Date(),
    );

    setMonth((current) => {
      const isSameMonth =
        current.getFullYear() === nextMonth.getFullYear() &&
        current.getMonth() === nextMonth.getMonth();

      return isSameMonth ? current : nextMonth;
    });
  }, [initialMonth]);

  useEffect(() => {
    const validIds = new Set(shifts.map((shift) => shift.id));

    setSelectedShiftIds((current) => {
      const next = new Set(
        Array.from(current).filter((shiftId) => validIds.has(shiftId)),
      );

      if (next.size === current.size) {
        return current;
      }

      return next;
    });
  }, [shifts]);

  function handleToggleSort(column: SortColumn) {
    setSortState((current) => {
      if (!current || current.column !== column) {
        return {
          column,
          direction: "asc",
        };
      }

      return {
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  function renderSortIcon(column: SortColumn) {
    if (!sortState || sortState.column !== column) {
      return <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />;
    }

    if (sortState.direction === "asc") {
      return <ArrowUpIcon className="size-3.5" />;
    }

    return <ArrowDownIcon className="size-3.5" />;
  }

  function handleToggleShiftSelection(shiftId: string, checked: boolean) {
    setSelectedShiftIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(shiftId);
      } else {
        next.delete(shiftId);
      }

      return next;
    });
  }

  function handleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedShiftIds(new Set());
      return;
    }

    setSelectedShiftIds(new Set(sortedShifts.map((shift) => shift.id)));
  }

  function handleEditShift(shiftId: string) {
    const params = new URLSearchParams({
      month: monthValue,
      returnTo: "list",
    });
    router.push(`/my/shifts/${shiftId}/edit?${params.toString()}`);
  }

  async function handleBulkDelete() {
    if (selectedShiftIds.size === 0 || isDeleting) {
      return;
    }

    const shiftIds = Array.from(selectedShiftIds);
    setIsDeleting(true);
    setDeleteErrorMessage(null);

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

      setSelectedShiftIds(new Set());
      setDeleteDialogOpen(false);
      clearShiftDerivedCaches();
      await reload();

      toast.success(messages.success.shiftDeleted, {
        description: `${deletedCount}件のシフトを削除しました。`,
      });
    } catch (error) {
      console.error("failed to bulk delete shifts", error);
      const message = toErrorMessage(error, messages.error.shiftDeleteFailed);
      setDeleteErrorMessage(message);
      toast.error(messages.error.shiftDeleteFailed, {
        description: message,
        duration: 6000,
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">シフト一覧</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            月ごとのシフトを確認し、並び替え・一括削除できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth((current) => addMonths(current, -1))}
          >
            <ChevronLeftIcon className="size-4" />
            前月
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth((current) => addMonths(current, 1))}
          >
            次月
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth(startOfMonth(new Date()))}
            disabled={isCurrentMonth}
          >
            今月に戻る
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base font-semibold">
            {formatMonthLabel(month)}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSortState(null)}
              disabled={sortState === null}
            >
              デフォルト表示に戻す
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeleteErrorMessage(null);
                setDeleteDialogOpen(true);
              }}
              disabled={selectedCount === 0 || isDeleting}
            >
              <Trash2Icon className="size-4" />
              選択したシフトを削除
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {sortedShifts.length}件表示 / {selectedCount}件選択中
          </p>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              シフトを読み込み中です...
            </p>
          ) : (
            <Table>
              <TableHeader>
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 px-2"
                      onClick={() => handleToggleSort("date")}
                      aria-label="日付で並び替え"
                    >
                      日付
                      {renderSortIcon("date")}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 px-2"
                      onClick={() => handleToggleSort("time")}
                      aria-label="時間で並び替え"
                    >
                      時間
                      {renderSortIcon("time")}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 px-2"
                      onClick={() => handleToggleSort("workplace")}
                      aria-label="勤務先で並び替え"
                    >
                      勤務先
                      {renderSortIcon("workplace")}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 px-2"
                      onClick={() => handleToggleSort("breakMinutes")}
                      aria-label="休憩時間で並び替え"
                    >
                      休憩時間
                      {renderSortIcon("breakMinutes")}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 px-2"
                      onClick={() => handleToggleSort("estimatedPay")}
                      aria-label="給与で並び替え"
                    >
                      給与
                      {renderSortIcon("estimatedPay")}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="shift-list-table-body">
                {sortedShifts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-20 text-center text-muted-foreground"
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
                    const isSelected = selectedShiftIds.has(shift.id);

                    return (
                      <TableRow
                        key={shift.id}
                        role="button"
                        tabIndex={0}
                        data-state={isSelected ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => handleEditShift(shift.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleEditShift(shift.id);
                          }
                        }}
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
                              style={{ backgroundColor: shift.workplace.color }}
                            />
                            <span>{workplaceLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell>{shift.breakMinutes}分</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(shift.estimatedPay)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteErrorMessage(null);
          }
          setDeleteDialogOpen(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選択したシフトを削除しますか？</DialogTitle>
            <DialogDescription>
              {selectedCount}件のシフトを削除します。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>

          {deleteErrorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {deleteErrorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting || selectedCount === 0}
              onClick={() => {
                void handleBulkDelete();
              }}
            >
              {isDeleting ? "削除中..." : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

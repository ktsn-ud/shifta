"use client";

import { useMemo, useState } from "react";
import { EditIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/shifts/DeleteConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { messages } from "@/lib/messages";

type ShiftListModalShift = {
  id: string;
  startTime: string;
  endTime: string;
  shiftType: "NORMAL" | "LESSON" | "OTHER";
  googleSyncStatus: "PENDING" | "SUCCESS" | "FAILED";
  googleSyncError: string | null;
  estimatedPay: number | null;
  workplace: {
    id: string;
    name: string;
    color: string;
  };
};

type ShiftListModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDate: Date;
  shifts: ShiftListModalShift[];
  onCreateShift: (date: Date) => void;
  onEditShift: (shiftId: string) => void;
  onDeleteShift: (shiftId: string) => Promise<void> | void;
  onRetrySync: (shiftId: string) => Promise<void> | void;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatShiftType(value: ShiftListModalShift["shiftType"]): string {
  if (value === "NORMAL") {
    return "通常";
  }
  if (value === "LESSON") {
    return "授業";
  }
  return "その他";
}

function formatEstimatedPay(value: number | null): string {
  if (value === null) {
    return "--";
  }
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShiftLabel(shift: ShiftListModalShift): string {
  return `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)} ${shift.workplace.name}`;
}

function formatSyncStatus(status: ShiftListModalShift["googleSyncStatus"]): {
  label: string;
  variant: "secondary" | "destructive";
} {
  if (status === "FAILED") {
    return { label: "失敗", variant: "destructive" };
  }
  if (status === "SUCCESS") {
    return { label: "成功", variant: "secondary" };
  }
  return { label: "同期中", variant: "secondary" };
}

export function ShiftListModal({
  open,
  onOpenChange,
  targetDate,
  shifts,
  onCreateShift,
  onEditShift,
  onDeleteShift,
  onRetrySync,
}: ShiftListModalProps) {
  const [deleteTarget, setDeleteTarget] = useState<ShiftListModalShift | null>(
    null,
  );
  const [retryingShiftId, setRetryingShiftId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const sortedShifts = useMemo(() => {
    return [...shifts].sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );
  }, [shifts]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-[min(80vw,960px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formatDate(targetDate)} のシフト</DialogTitle>
            <DialogDescription>
              行クリックで編集画面へ遷移します。削除は各行の削除ボタンから実行します。
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button type="button" onClick={() => onCreateShift(targetDate)}>
              <PlusIcon className="size-4" />
              新規追加
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時刻</TableHead>
                <TableHead>勤務先</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>給与予想</TableHead>
                <TableHead>同期</TableHead>
                <TableHead className="w-32 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedShifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center">
                    この日のシフトは未登録です。
                  </TableCell>
                </TableRow>
              ) : (
                sortedShifts.map((shift) => (
                  <TableRow
                    key={shift.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onEditShift(shift.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEditShift(shift.id);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      {formatTime(shift.startTime)} -{" "}
                      {formatTime(shift.endTime)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 rounded-full"
                          style={{ backgroundColor: shift.workplace.color }}
                        />
                        <span>{shift.workplace.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatShiftType(shift.shiftType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatEstimatedPay(shift.estimatedPay)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          variant={
                            formatSyncStatus(shift.googleSyncStatus).variant
                          }
                        >
                          {formatSyncStatus(shift.googleSyncStatus).label}
                        </Badge>
                        {shift.googleSyncStatus === "FAILED" ? (
                          <p className="text-xs text-destructive">
                            {messages.error.calendarSyncFailed}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {shift.googleSyncStatus === "FAILED" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async (event) => {
                              event.stopPropagation();
                              setRetryError(null);
                              setRetryingShiftId(shift.id);
                              try {
                                await onRetrySync(shift.id);
                              } catch (error) {
                                const message =
                                  error instanceof Error
                                    ? error.message
                                    : messages.error.calendarSyncFailed;
                                setRetryError(message);
                                toast.error(messages.error.calendarSyncFailed, {
                                  description: message,
                                  duration: 6000,
                                });
                              } finally {
                                setRetryingShiftId(null);
                              }
                            }}
                            disabled={retryingShiftId === shift.id}
                          >
                            {retryingShiftId === shift.id
                              ? "再試行中..."
                              : "再試行"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditShift(shift.id);
                          }}
                        >
                          <EditIcon className="size-4" />
                          編集
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(shift);
                          }}
                        >
                          <Trash2Icon className="size-4" />
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {retryError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {retryError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
          }
        }}
        shiftLabel={deleteTarget ? formatShiftLabel(deleteTarget) : undefined}
        onDelete={async () => {
          if (!deleteTarget) {
            return;
          }

          await onDeleteShift(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

export type { ShiftListModalProps, ShiftListModalShift };

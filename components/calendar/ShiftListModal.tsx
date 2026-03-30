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
    type?: "GENERAL" | "CRAM_SCHOOL";
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
  return `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)} ${formatWorkplaceLabel(shift)}`;
}

function formatWorkplaceLabel(shift: ShiftListModalShift): string {
  if (shift.workplace.type === "CRAM_SCHOOL" && shift.shiftType === "NORMAL") {
    return `${shift.workplace.name}（事務）`;
  }

  return shift.workplace.name;
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
        <DialogContent className="max-h-[85vh] max-w-[min(96vw,1100px)] overflow-y-auto">
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

          {sortedShifts.length === 0 ? (
            <div className="rounded-md border py-6 text-center text-sm text-muted-foreground">
              この日のシフトは未登録です。
            </div>
          ) : (
            <div className="space-y-3">
              <div className="hidden border-b px-4 pb-2 text-xs text-muted-foreground md:grid md:grid-cols-[1.1fr_1.1fr_0.9fr_0.9fr_1.4fr] md:gap-4">
                <span>時刻</span>
                <span>勤務先</span>
                <span>給与予想</span>
                <span>同期</span>
                <span className="text-right">操作</span>
              </div>
              {sortedShifts.map((shift) => (
                <div
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
                  className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40 md:grid md:grid-cols-[1.1fr_1.1fr_0.9fr_0.9fr_1.4fr] md:items-center md:gap-4 md:p-3"
                >
                  <div className="space-y-1 md:space-y-0">
                    <p className="text-xs text-muted-foreground md:hidden">
                      時刻
                    </p>
                    <p className="font-medium">
                      {formatTime(shift.startTime)} -{" "}
                      {formatTime(shift.endTime)}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-2 md:mt-0">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: shift.workplace.color }}
                    />
                    <span className="text-sm">
                      {formatWorkplaceLabel(shift)}
                    </span>
                  </div>

                  <div className="mt-3 md:mt-0">
                    <p className="text-xs text-muted-foreground md:hidden">
                      給与予想
                    </p>
                    <p className="text-sm">
                      {formatEstimatedPay(shift.estimatedPay)}
                    </p>
                  </div>

                  <div className="mt-3 space-y-1 md:mt-0">
                    <p className="text-xs text-muted-foreground md:hidden">
                      同期
                    </p>
                    <Badge
                      variant={formatSyncStatus(shift.googleSyncStatus).variant}
                    >
                      {formatSyncStatus(shift.googleSyncStatus).label}
                    </Badge>
                    {shift.googleSyncStatus === "FAILED" ? (
                      <p className="text-xs text-destructive">
                        {messages.error.calendarSyncFailed}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2 md:mt-0">
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
                </div>
              ))}
            </div>
          )}

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

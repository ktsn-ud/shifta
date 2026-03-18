"use client";

import { useMemo, useState } from "react";
import { EditIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
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

type ShiftListModalShift = {
  id: string;
  startTime: string;
  endTime: string;
  shiftType: "NORMAL" | "LESSON" | "OTHER";
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

export function ShiftListModal({
  open,
  onOpenChange,
  targetDate,
  shifts,
  onCreateShift,
  onEditShift,
  onDeleteShift,
}: ShiftListModalProps) {
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
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
                <TableHead className="w-32 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedShifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center">
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
                      <div className="flex justify-end gap-2">
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
                            setDeleteTargetId(shift.id);
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
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTargetId(null);
          }
        }}
        title="このシフトを削除しますか？"
        description="削除後は元に戻せません。"
        onConfirm={async () => {
          if (!deleteTargetId) {
            return;
          }
          await onDeleteShift(deleteTargetId);
          setDeleteTargetId(null);
        }}
      />
    </>
  );
}

export type { ShiftListModalProps, ShiftListModalShift };

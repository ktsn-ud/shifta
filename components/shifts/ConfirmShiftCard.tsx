"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";

type ConfirmShiftCardProps = {
  shift: UnconfirmedShiftItem;
  onChange?: (
    shiftId: string,
    patch: Pick<UnconfirmedShiftItem, "startTime" | "endTime" | "breakMinutes">,
  ) => void;
  onConfirm?: (shiftId: string) => void;
  onDelete?: (shiftId: string) => void;
  confirmDisabled?: boolean;
  deleteDisabled?: boolean;
};

export function ConfirmShiftCard({
  shift,
  onChange,
  onConfirm,
  onDelete,
  confirmDisabled = false,
  deleteDisabled = false,
}: ConfirmShiftCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{shift.date}</CardTitle>
        <p className="text-sm text-muted-foreground">{shift.workplaceName}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            開始時刻
            <Input
              type="time"
              value={shift.startTime}
              onChange={(event) => {
                onChange?.(shift.id, {
                  startTime: event.currentTarget.value,
                  endTime: shift.endTime,
                  breakMinutes: shift.breakMinutes,
                });
              }}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            終了時刻
            <Input
              type="time"
              value={shift.endTime}
              onChange={(event) => {
                onChange?.(shift.id, {
                  startTime: shift.startTime,
                  endTime: event.currentTarget.value,
                  breakMinutes: shift.breakMinutes,
                });
              }}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            休憩時間（分）
            <Input
              type="number"
              min={0}
              value={String(shift.breakMinutes)}
              onChange={(event) => {
                const nextBreakMinutes = Number(event.currentTarget.value);
                onChange?.(shift.id, {
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                  breakMinutes: Number.isFinite(nextBreakMinutes)
                    ? nextBreakMinutes
                    : 0,
                });
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={deleteDisabled}
            onClick={() => onDelete?.(shift.id)}
          >
            削除
          </Button>
          <Button
            type="button"
            disabled={confirmDisabled}
            onClick={() => onConfirm?.(shift.id)}
          >
            確定
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

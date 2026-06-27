"use client";

import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShiftTimeRange } from "@/lib/shifts/time";
import { formatSelectedDate } from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftOvernightDialog(
  props: Pick<
    BulkShiftFormController,
    | "isOvernightConfirmOpen"
    | "overnightSummaries"
    | "isSubmitting"
    | "handleOvernightDialogOpenChange"
    | "handleOvernightConfirm"
  >,
) {
  const {
    isOvernightConfirmOpen,
    overnightSummaries,
    isSubmitting,
    handleOvernightDialogOpenChange,
    handleOvernightConfirm,
  } = props;

  return (
    <Dialog
      open={isOvernightConfirmOpen}
      onOpenChange={handleOvernightDialogOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>翌日終了として登録されるシフトがあります</DialogTitle>
          <DialogDescription>
            終了時刻が開始時刻より早いシフトは翌日終了として登録されます。内容を確認してください。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          <ul className="divide-y">
            {overnightSummaries.map((item) => (
              <li key={item.date} className="space-y-1 px-3 py-2 text-sm">
                <p className="font-medium">{formatSelectedDate(item.date)}</p>
                <p className="text-muted-foreground">
                  入力: {formatShiftTimeRange(item.startTime, item.endTime)}
                </p>
                <p className="text-muted-foreground">
                  解釈: {item.startDateLabel} {item.startTime} 〜{" "}
                  {item.endDateLabel} {item.endTime}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOvernightDialogOpenChange(false)}
            disabled={isSubmitting}
          >
            戻って修正
          </Button>
          <Button
            type="button"
            onClick={() => void handleOvernightConfirm()}
            disabled={isSubmitting}
          >
            まとめて翌日終了として登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

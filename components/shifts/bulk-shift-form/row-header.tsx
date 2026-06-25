"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSelectedDate } from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftRowHeader(props: {
  dateKey: string;
  onRemove: (dateKey: string) => void;
}) {
  const { dateKey, onRemove } = props;

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">{formatSelectedDate(dateKey)}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(dateKey)}
        aria-label={`${dateKey}の入力行を削除`}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

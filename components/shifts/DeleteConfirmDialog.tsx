"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftLabel?: string;
  onDelete: () => Promise<void>;
};

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  shiftLabel,
  onDelete,
}: DeleteConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setErrorMessage(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>このシフトを削除しますか？</DialogTitle>
          <DialogDescription>
            {shiftLabel
              ? `${shiftLabel} を削除します。この操作は取り消せません。`
              : "この操作は取り消せません。"}
          </DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setErrorMessage(null);

              try {
                await onDelete();
                onOpenChange(false);
              } catch (error) {
                console.error("failed to delete shift", error);
                setErrorMessage(
                  "シフトの削除に失敗しました。もう一度お試しください。",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "削除中..." : "削除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { DeleteConfirmDialogProps };

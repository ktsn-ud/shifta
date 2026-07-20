"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const UNDO_DURATION_MS = 4000;

type UndoableAction = {
  id: string;
  message: string;
  onCommit: () => Promise<void> | void;
  onUndo: () => void;
};

type PendingAction = {
  timeoutId: ReturnType<typeof setTimeout>;
  toastId: string | number;
  onCommit: () => Promise<void> | void;
  onUndo: () => void;
};

/**
 * Defers an irreversible request until the toast's Undo window has elapsed.
 * Pending work is cancelled when the owning screen unmounts.
 */
export function useUndoableAction() {
  const pendingActionsRef = useRef(new Map<string, PendingAction>());

  const cancel = useCallback((id: string) => {
    const pendingAction = pendingActionsRef.current.get(id);
    if (!pendingAction) {
      return;
    }

    clearTimeout(pendingAction.timeoutId);
    pendingActionsRef.current.delete(id);
    toast.dismiss(pendingAction.toastId);
    pendingAction.onUndo();
  }, []);

  const schedule = useCallback(
    ({ id, message, onCommit, onUndo }: UndoableAction): boolean => {
      if (pendingActionsRef.current.has(id)) {
        return false;
      }

      const timeoutId = setTimeout(() => {
        const pendingAction = pendingActionsRef.current.get(id);
        if (!pendingAction) {
          return;
        }

        pendingActionsRef.current.delete(id);
        void Promise.resolve(pendingAction.onCommit());
      }, UNDO_DURATION_MS);

      const toastId = toast(message, {
        duration: UNDO_DURATION_MS,
        action: {
          label: "元に戻す",
          onClick: () => cancel(id),
        },
      });

      pendingActionsRef.current.set(id, {
        timeoutId,
        toastId,
        onCommit,
        onUndo,
      });
      return true;
    },
    [cancel],
  );

  useEffect(() => {
    const pendingActions = pendingActionsRef.current;

    return () => {
      for (const [id, pendingAction] of pendingActions) {
        pendingActions.delete(id);
        clearTimeout(pendingAction.timeoutId);
        toast.dismiss(pendingAction.toastId);
        pendingAction.onUndo();
      }
    };
  }, []);

  return { schedule };
}

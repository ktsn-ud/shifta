"use client";

import { RefreshCwIcon } from "lucide-react";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { Button } from "@/components/ui/button";
import { SpinnerPanel } from "@/components/ui/spinner";
import { toErrorMessage } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { useUnconfirmedShiftsQuery } from "@/lib/query/queries/shift-confirmation";
import { queryKeys } from "@/lib/query/query-keys";

type ShiftConfirmPageClientProps = {
  currentUserId: string;
  initialUnconfirmedShifts: UnconfirmedShiftItem[];
};

export function ShiftConfirmPageClient({
  currentUserId,
  initialUnconfirmedShifts,
}: ShiftConfirmPageClientProps) {
  const queryClient = getBrowserQueryClient();
  const unconfirmedQuery = useUnconfirmedShiftsQuery({
    userId: currentUserId,
    initialData: initialUnconfirmedShifts,
  });
  const unconfirmedShifts = unconfirmedQuery.data ?? [];
  const isInitialLoading =
    unconfirmedQuery.isLoading && unconfirmedQuery.data === undefined;
  const isRefreshing =
    unconfirmedQuery.isFetching && unconfirmedQuery.data !== undefined;
  const errorMessage = unconfirmedQuery.error
    ? toErrorMessage(
        unconfirmedQuery.error,
        "シフト確定ページのデータ取得に失敗しました。",
      )
    : null;

  const handleActionCompleted = async (shiftId: string): Promise<void> => {
    const queryKey = queryKeys.shifts.unconfirmed({ userId: currentUserId });
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<UnconfirmedShiftItem[]>(queryKey, (previous) =>
      (previous ?? []).filter((shift) => shift.id !== shiftId),
    );
  };

  return (
    <section className="flex flex-col gap-6 p-4 md:h-[calc(100svh-var(--header-height))] md:min-h-0 md:overflow-hidden md:p-6">
      <header className="space-y-2 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Shift Confirm
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">シフト確定</h2>
        <p className="text-sm text-muted-foreground">
          未確定シフトの時刻調整と確定を行えます。
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isInitialLoading ? (
        <SpinnerPanel
          className="min-h-[360px] md:min-h-0 md:flex-1"
          label="シフト確定情報を読み込み中..."
        />
      ) : (
        <section className="space-y-3 md:flex md:min-h-0 md:flex-1 md:flex-col">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">未確定シフト</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRefreshing}
              onClick={() => {
                void unconfirmedQuery.refetch();
              }}
            >
              <RefreshCwIcon
                className={isRefreshing ? "animate-spin" : undefined}
              />
              {isRefreshing ? "更新中..." : "更新"}
            </Button>
          </div>
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-2">
            {unconfirmedShifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                未確定シフトはまだありません
              </p>
            ) : (
              <div className="p-1">
                <div className="flex flex-col gap-3">
                  {unconfirmedShifts.map((shift) => (
                    <ConfirmShiftCard
                      key={shift.id}
                      shift={shift}
                      onActionCompleted={handleActionCompleted}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

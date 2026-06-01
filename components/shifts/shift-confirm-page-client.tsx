"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ConfirmedShiftsList } from "@/components/shifts/ConfirmedShiftsList";
import {
  type ConfirmedShiftWorkplaceGroup,
  type UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpinnerPanel } from "@/components/ui/spinner";
import { toErrorMessage } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import {
  useConfirmedCurrentMonthShiftsQuery,
  useUnconfirmedShiftsQuery,
} from "@/lib/query/queries/shift-confirmation";
import { queryKeys } from "@/lib/query/query-keys";

type ShiftConfirmPageClientProps = {
  currentUserId: string;
  initialUnconfirmedShifts: UnconfirmedShiftItem[];
  initialConfirmedShiftGroups: ConfirmedShiftWorkplaceGroup[];
};

export function ShiftConfirmPageClient({
  currentUserId,
  initialUnconfirmedShifts,
  initialConfirmedShiftGroups,
}: ShiftConfirmPageClientProps) {
  const queryClient = getBrowserQueryClient();
  const unconfirmedQuery = useUnconfirmedShiftsQuery({
    userId: currentUserId,
    initialData: initialUnconfirmedShifts,
  });
  const confirmedQuery = useConfirmedCurrentMonthShiftsQuery({
    userId: currentUserId,
    initialData: initialConfirmedShiftGroups,
  });

  const unconfirmedShifts = unconfirmedQuery.data ?? [];
  const confirmedShiftGroups = confirmedQuery.data ?? [];
  const hasShiftConfirmationData =
    unconfirmedQuery.data !== undefined || confirmedQuery.data !== undefined;
  const isInitialLoading =
    (unconfirmedQuery.isLoading || confirmedQuery.isLoading) &&
    !hasShiftConfirmationData;
  const isRefreshing =
    hasShiftConfirmationData &&
    (unconfirmedQuery.isFetching || confirmedQuery.isFetching);
  const errorMessage = unconfirmedQuery.error
    ? toErrorMessage(
        unconfirmedQuery.error,
        "シフト確定ページのデータ取得に失敗しました。",
      )
    : confirmedQuery.error
      ? toErrorMessage(
          confirmedQuery.error,
          "シフト確定ページのデータ取得に失敗しました。",
        )
      : null;

  const loadShiftConfirmationData = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.shifts.unconfirmed({ userId: currentUserId }),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.shifts.confirmedCurrentMonth({
            userId: currentUserId,
          }),
        }),
      ]);
    } catch (error) {
      const message = toErrorMessage(
        error,
        "シフト確定ページのデータ取得に失敗しました。",
      );
      toast.error("シフト確定ページのデータ取得に失敗しました。", {
        description: message,
        duration: 6000,
      });
    }
  }, [currentUserId, queryClient]);

  const handleActionCompleted = useCallback(
    (input: { shiftId: string }) => {
      queryClient.setQueryData<UnconfirmedShiftItem[]>(
        queryKeys.shifts.unconfirmed({ userId: currentUserId }),
        (previous) =>
          (previous ?? []).filter((shift) => shift.id !== input.shiftId),
      );

      void loadShiftConfirmationData();
    },
    [currentUserId, loadShiftConfirmationData, queryClient],
  );

  return (
    <section className="flex flex-col gap-6 p-4 md:h-[calc(100svh-var(--header-height))] md:overflow-hidden md:p-6">
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
          className="min-h-[360px]"
          label="シフト確定情報を読み込み中..."
        />
      ) : (
        <LoadingOverlay isLoading={isRefreshing} className="rounded-xl">
          <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:grid md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-6">
            <section className="space-y-3 md:flex md:min-h-0 md:flex-col">
              <h3 className="text-lg font-semibold">未確定シフト</h3>
              <div className="md:min-h-0 md:overflow-y-auto md:pr-2">
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

            <div
              aria-hidden="true"
              className="hidden w-px self-stretch bg-border md:mb-[15px] md:block"
            />

            <section className="space-y-3 md:flex md:min-h-0 md:flex-col">
              <h3 className="text-lg font-semibold">今月の確定済みシフト</h3>
              <div className="md:min-h-0 md:overflow-y-auto md:pr-2">
                {confirmedShiftGroups.length > 0 ? (
                  <ConfirmedShiftsList groups={confirmedShiftGroups} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    今月の確定済みシフトはまだありません
                  </p>
                )}
              </div>
            </section>
          </div>
        </LoadingOverlay>
      )}
    </section>
  );
}

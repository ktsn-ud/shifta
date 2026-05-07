"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ConfirmedShiftsList } from "@/components/shifts/ConfirmedShiftsList";
import {
  type ConfirmedShiftWorkplaceGroup,
  type UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
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
  const isLoading = unconfirmedQuery.isLoading || confirmedQuery.isLoading;
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

  return (
    <section className="flex flex-col gap-6 p-4 md:h-[calc(100svh-var(--header-height))] md:overflow-hidden md:p-6">
      <header>
        <h2 className="text-xl font-semibold">シフト確定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          未確定シフトの時刻調整と確定を行えます。
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="シフト確定情報を読み込み中..."
        />
      ) : (
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
                        onActionCompleted={loadShiftConfirmationData}
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
      )}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { ShiftListModal } from "@/components/calendar/ShiftListModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpinnerPanel } from "@/components/ui/spinner";
import {
  addMonths,
  dateFromDateKey,
  dateKeyFromApiDate,
  startOfMonth,
  toMonthInputValue,
  toDateKey,
} from "@/lib/calendar/date";
import {
  parseGoogleSyncStateFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { removeShiftsFromMonthCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { usePayrollSummaryQuery } from "@/lib/query/queries/payroll";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import {
  type MonthShift,
  summarizeShifts,
  useMonthShifts,
} from "@/hooks/use-month-shifts";

type DashboardPageClientProps = {
  currentUserId: string;
  initialMonthShifts: MonthShift[];
  initialMonthStartDate: string;
  initialMonthEndDate: string;
  initialUnconfirmedShiftCount: number;
  nextMonthPaymentAmount: number | null;
  todayDate: string;
};

const GOOGLE_TOKEN_EXPIRED_DESCRIPTION =
  "3秒後にログアウトします。再度Googleアカウントでログインしてください。";
const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function isSameMonth(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function formatCalendarMonthLabel(month: Date, currentDate: Date): string {
  const isSameYear = month.getFullYear() === currentDate.getFullYear();
  const monthLabel = `${month.getMonth() + 1}月`;
  return isSameYear ? monthLabel : `${month.getFullYear()}年${monthLabel}`;
}

function formatSummaryPeriodLabel(month: Date, currentDate: Date): string {
  const isSameYear = month.getFullYear() === currentDate.getFullYear();
  const isCurrentMonth =
    isSameYear && month.getMonth() === currentDate.getMonth();

  if (isCurrentMonth) {
    return "今月";
  }

  const monthLabel = `${month.getMonth() + 1}月`;
  return isSameYear ? monthLabel : `${month.getFullYear()}年${monthLabel}`;
}

export function DashboardPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm md:p-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Home
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            ダッシュボード
          </h2>
          <p className="text-sm text-muted-foreground">
            当月のシフト状況と概算値を確認できます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled>
            今月に戻る
          </Button>
          <Button type="button" variant="outline" disabled>
            新規シフト登録
          </Button>
          <Button type="button" disabled>
            一括登録
          </Button>
        </div>
      </header>
      <SpinnerPanel
        className="min-h-[360px]"
        label="ダッシュボードを読み込み中..."
      />
    </section>
  );
}

export function DashboardPageClient({
  currentUserId,
  initialMonthShifts,
  initialMonthStartDate,
  initialMonthEndDate,
  initialUnconfirmedShiftCount,
  nextMonthPaymentAmount,
  todayDate,
}: DashboardPageClientProps) {
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const [month, setMonth] = useState(() => {
    const initialMonthDate = dateFromDateKey(initialMonthStartDate);
    return startOfMonth(initialMonthDate ?? new Date());
  });
  const [selectedDate, setSelectedDate] = useState(
    () => dateFromDateKey(todayDate) ?? new Date(),
  );
  const [modalOpen, setModalOpen] = useState(false);

  const {
    shifts,
    displayMonth,
    isInitialLoading,
    isRefreshing,
    errorMessage,
    reload,
  } = useMonthShifts(month, {
    cacheUserKey: currentUserId,
    initialShifts: initialMonthShifts,
    initialStartDate: initialMonthStartDate,
    initialEndDate: initialMonthEndDate,
    deferEstimate: true,
  });

  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      const key = dateKeyFromApiDate(shift.date);
      const existing = grouped.get(key) ?? [];
      existing.push(shift);
      grouped.set(key, existing);
    }
    return grouped;
  }, [shifts]);

  const summary = useMemo(() => summarizeShifts(shifts), [shifts]);
  const currentDate = useMemo(
    () => dateFromDateKey(todayDate) ?? new Date(),
    [todayDate],
  );
  const currentMonth = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const summaryPeriodLabel = useMemo(
    () => formatSummaryPeriodLabel(displayMonth, currentDate),
    [currentDate, displayMonth],
  );
  const nextPaymentMonthValue = useMemo(
    () => toMonthInputValue(addMonths(displayMonth, 1)),
    [displayMonth],
  );
  const nextPaymentMonthDate = useMemo(
    () => addMonths(displayMonth, 1),
    [displayMonth],
  );
  const initialDashboardMonth = useMemo(
    () => startOfMonth(dateFromDateKey(initialMonthStartDate) ?? new Date()),
    [initialMonthStartDate],
  );
  const isInitialDashboardMonth = useMemo(
    () => isSameMonth(displayMonth, initialDashboardMonth),
    [displayMonth, initialDashboardMonth],
  );
  const isCurrentMonth = isSameMonth(displayMonth, currentMonth);
  const selectedDateKey = toDateKey(selectedDate);
  const selectedDateShifts = shiftsByDate.get(selectedDateKey) ?? [];
  const failedShiftIds = useMemo(() => {
    return shifts
      .filter((shift) => shift.googleSyncStatus === "FAILED")
      .map((shift) => shift.id);
  }, [shifts]);
  const failedShiftCount = failedShiftIds.length;
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);
  const { isSignOutScheduled, scheduleSignOut } =
    useGoogleTokenExpiredSignOut();

  const nextPaymentSummaryQuery = usePayrollSummaryQuery({
    userId: currentUserId,
    month: nextPaymentMonthValue,
  });

  const nextPaymentAmount =
    nextPaymentSummaryQuery.data?.totalWage ??
    (isInitialDashboardMonth ? nextMonthPaymentAmount : null);
  const isNextPaymentLoading =
    nextPaymentSummaryQuery.isLoading && nextPaymentAmount === null;

  const handleCreateShift = (date: Date) => {
    const dateString = toDateKey(date);
    const params = new URLSearchParams({
      date: dateString,
      month: toMonthInputValue(displayMonth),
    });
    router.push(`/my/shifts/new?${params.toString()}`);
  };

  const handleBulkRetrySync = async () => {
    if (failedShiftIds.length === 0 || isBulkRetrying || isSignOutScheduled) {
      return;
    }

    setIsBulkRetrying(true);
    try {
      const results = await Promise.allSettled(
        failedShiftIds.map(async (shiftId) => {
          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok) {
            return {
              ok: true as const,
              requiresCalendarSetup: false,
              requiresSignOut: false,
            };
          }

          const apiError = await readGoogleSyncFailureFromErrorResponse(
            response,
            "Google Calendar への再同期に失敗しました",
          );

          return {
            ok: false as const,
            requiresCalendarSetup: apiError.requiresCalendarSetup,
            requiresSignOut: apiError.requiresSignOut,
          };
        }),
      );

      const summary = results.reduce(
        (acc, result) => {
          if (result.status === "fulfilled" && result.value.ok) {
            return {
              ...acc,
              successCount: acc.successCount + 1,
            };
          }

          const requiresSetup =
            result.status === "fulfilled"
              ? result.value.requiresCalendarSetup
              : false;
          const requiresSignOut =
            result.status === "fulfilled"
              ? result.value.requiresSignOut
              : false;

          return {
            ...acc,
            failureCount: acc.failureCount + 1,
            requiresCalendarSetup: acc.requiresCalendarSetup || requiresSetup,
            requiresSignOut: acc.requiresSignOut || requiresSignOut,
          };
        },
        {
          successCount: 0,
          failureCount: 0,
          requiresCalendarSetup: false,
          requiresSignOut: false,
        },
      );

      await invalidateAfterShiftMutation(queryClient);

      if (summary.failureCount === 0) {
        toast.success("Google Calendar の一括再同期が完了しました", {
          description: `${summary.successCount}件成功`,
        });
        return;
      }

      toast.error("Google Calendar の一括再同期で一部失敗しました", {
        description: `${summary.successCount}件成功 / ${summary.failureCount}件失敗`,
        duration: 6000,
      });

      if (summary.requiresSignOut) {
        toast.error("Google 連携の有効期限が切れました", {
          description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
          duration: 6000,
        });
        scheduleSignOut();
        return;
      }

      if (summary.requiresCalendarSetup) {
        router.push(CALENDAR_SETUP_PATH);
      }
    } finally {
      setIsBulkRetrying(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm md:p-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Home
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            ダッシュボード
          </h2>
          <p className="text-sm text-muted-foreground">
            当月のシフト状況と概算値を確認できます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth(currentMonth)}
            disabled={isCurrentMonth}
          >
            今月に戻る
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleCreateShift(currentDate)}
          >
            新規シフト登録
          </Button>
          <Button type="button" onClick={() => router.push("/my/shifts/bulk")}>
            一括登録
          </Button>
        </div>
      </header>

      {isInitialLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="ダッシュボードを読み込み中..."
        />
      ) : null}

      {!isInitialLoading && initialUnconfirmedShiftCount > 0 ? (
        <Card className="border-amber-300/70 bg-amber-50/70 shadow-sm">
          <CardHeader className="gap-3 md:flex sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>シフト確定待ちがあります</CardTitle>
              <CardDescription>
                本日以前の未確定シフトが {initialUnconfirmedShiftCount}{" "}
                件あります。 シフト確定ページで確認してください。
              </CardDescription>
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => router.push("/my/shifts/confirm")}
            >
              シフト確定ページへ
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      {!isInitialLoading ? (
        <Card
          className={
            failedShiftCount > 0
              ? "border-amber-300/70 bg-amber-50/70 shadow-sm"
              : "border-emerald-300/70 bg-emerald-50/70 shadow-sm"
          }
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              {failedShiftCount > 0 ? (
                <AlertTriangleIcon className="size-4 text-amber-700" />
              ) : (
                <CheckCircle2Icon className="size-4 text-emerald-700" />
              )}
              <p>
                {failedShiftCount > 0
                  ? `${failedShiftCount}件のシフトが Google Calendar に同期できていません`
                  : "すべてのシフトが Google Calendar に正常に同期されています"}
              </p>
            </div>
            {failedShiftCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void handleBulkRetrySync();
                }}
                disabled={isBulkRetrying || isSignOutScheduled}
              >
                <RefreshCwIcon
                  data-icon="inline-start"
                  className={isBulkRetrying ? "animate-spin" : undefined}
                />
                {isBulkRetrying ? "再同期中..." : "一括して再同期"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isInitialLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            size="sm"
            className="border-primary/30 bg-primary/5 shadow-sm sm:col-span-2 lg:col-span-1"
          >
            <CardHeader className="gap-2">
              <CardTitle className="text-base">翌月支給額</CardTitle>
              <CardDescription>
                {formatCalendarMonthLabel(nextPaymentMonthDate, currentDate)}
                に受け取る見込み額
              </CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tracking-tight">
              {isNextPaymentLoading || nextPaymentAmount === null
                ? "読み込み中..."
                : formatCurrency(nextPaymentAmount)}
            </CardContent>
          </Card>

          <Card size="sm" className="border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="gap-2">
              <CardTitle className="text-base">
                {summaryPeriodLabel}の勤務時間
              </CardTitle>
              <CardDescription>休憩控除後の合計時間</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tracking-tight">
              {(summary.totalWorkedMinutes / 60).toFixed(1)} 時間
            </CardContent>
          </Card>

          <Card size="sm" className="border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="gap-2">
              <CardTitle className="text-base">
                {summaryPeriodLabel}のシフト件数
              </CardTitle>
              <CardDescription>登録済み件数</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tracking-tight">
              {summary.shiftCount} 件
            </CardContent>
          </Card>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isInitialLoading ? (
        <LoadingOverlay isLoading={isRefreshing} className="rounded-xl">
          <MonthCalendar
            month={displayMonth}
            shifts={shifts}
            todayKey={todayDate}
            onNavigatePrev={() => setMonth((current) => addMonths(current, -1))}
            onNavigateNext={() => setMonth((current) => addMonths(current, 1))}
            onDateClick={(date) => {
              setSelectedDate(date);
              const dayShifts = shiftsByDate.get(toDateKey(date)) ?? [];
              if (dayShifts.length === 0) {
                handleCreateShift(date);
                return;
              }
              setModalOpen(true);
            }}
          />
        </LoadingOverlay>
      ) : null}

      <ShiftListModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        targetDate={selectedDate}
        shifts={selectedDateShifts}
        onCreateShift={handleCreateShift}
        onEditShift={(shiftId) => {
          const params = new URLSearchParams({
            month: toMonthInputValue(displayMonth),
          });
          router.push(`/my/shifts/${shiftId}/edit?${params.toString()}`);
        }}
        onDeleteShift={async (shiftId) => {
          if (isSignOutScheduled) {
            return;
          }

          const rollback = removeShiftsFromMonthCachesOptimistically(
            queryClient,
            [shiftId],
          );
          let deletionCompleted = false;

          try {
            const response = await fetch(`/api/shifts/${shiftId}`, {
              method: "DELETE",
            });

            if (response.ok === false) {
              const apiError = await readGoogleSyncFailureFromErrorResponse(
                response,
                "シフトの削除に失敗しました",
              );

              if (apiError.requiresSignOut) {
                rollback();
                toast.error("Google 連携の有効期限が切れました", {
                  description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
                  duration: 6000,
                });
                scheduleSignOut();
                return;
              }
              throw new Error(apiError.message);
            }

            deletionCompleted = true;
            const payload = (await response
              .json()
              .catch(() => null)) as unknown;
            const syncState = parseGoogleSyncStateFromPayload(
              payload,
              messages.error.calendarSyncFailed,
            );
            const syncFailure = syncState.failure;

            void invalidateAfterShiftMutation(queryClient, {
              mode: "background",
            });

            if (syncFailure) {
              if (syncFailure.requiresSignOut) {
                toast.error("Google 連携の有効期限が切れました", {
                  description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
                  duration: 6000,
                });
                scheduleSignOut();
                return;
              }

              toast.error(messages.error.calendarSyncFailed, {
                description: syncFailure.requiresCalendarSetup
                  ? syncFailure.message
                  : `${syncFailure.message} シフトは削除済みです。`,
                duration: 6000,
              });

              if (syncFailure.requiresCalendarSetup) {
                queueMicrotask(() => {
                  router.push(CALENDAR_SETUP_PATH);
                });
              }
              return;
            }

            toast.success(messages.success.shiftDeleted, {
              description: buildMutationSuccessDescription({
                syncPending: syncState.pending,
              }),
            });
          } catch (error) {
            if (!deletionCompleted) {
              rollback();
            }
            throw error;
          }
        }}
        onRetrySync={async (shiftId) => {
          if (isSignOutScheduled) {
            return;
          }

          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok === false) {
            const apiError = await readGoogleSyncFailureFromErrorResponse(
              response,
              "Google Calendar への再同期に失敗しました",
            );

            if (apiError.requiresSignOut) {
              toast.error("Google 連携の有効期限が切れました", {
                description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
                duration: 6000,
              });
              scheduleSignOut();
              return;
            }

            if (apiError.requiresCalendarSetup) {
              router.push(CALENDAR_SETUP_PATH);
            }

            throw new Error(apiError.message);
          }

          await Promise.all([
            invalidateAfterShiftMutation(queryClient),
            reload(),
          ]);
          toast.success(messages.success.calendarSyncRetried);
        }}
      />
    </section>
  );
}

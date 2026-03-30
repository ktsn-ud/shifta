"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  CalendarLoadingSkeleton,
  StatCardsLoadingSkeleton,
} from "@/components/ui/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addMonths,
  dateFromDateKey,
  dateKeyFromApiDate,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
  toDateKey,
} from "@/lib/calendar/date";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages } from "@/lib/messages";
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
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSummaryPeriodLabel(month: Date): string {
  const now = new Date();
  const isSameYear = month.getFullYear() === now.getFullYear();
  const isCurrentMonth = isSameYear && month.getMonth() === now.getMonth();

  if (isCurrentMonth) {
    return "今月";
  }

  const monthLabel = `${month.getMonth() + 1}月`;
  return isSameYear ? monthLabel : `${month.getFullYear()}年${monthLabel}`;
}

export function DashboardPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </header>
      <StatCardsLoadingSkeleton />
      <CalendarLoadingSkeleton />
    </section>
  );
}

export function DashboardPageClient({
  currentUserId,
  initialMonthShifts,
  initialMonthStartDate,
  initialMonthEndDate,
  initialUnconfirmedShiftCount,
}: DashboardPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => {
    const initialMonthDate = dateFromDateKey(initialMonthStartDate);
    return startOfMonth(initialMonthDate ?? new Date());
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() &&
    month.getMonth() === now.getMonth();

  const { shifts, isLoading, errorMessage, reload } = useMonthShifts(month, {
    cacheUserKey: currentUserId,
    initialShifts: initialMonthShifts,
    initialStartDate: initialMonthStartDate,
    initialEndDate: initialMonthEndDate,
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
  const summaryPeriodLabel = useMemo(
    () => formatSummaryPeriodLabel(month),
    [month],
  );
  const selectedDateKey = toDateKey(selectedDate);
  const selectedDateShifts = shiftsByDate.get(selectedDateKey) ?? [];
  const failedShiftIds = useMemo(() => {
    return shifts
      .filter((shift) => shift.googleSyncStatus === "FAILED")
      .map((shift) => shift.id);
  }, [shifts]);
  const failedShiftCount = failedShiftIds.length;
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);
  const monthFromQuery = useMemo(() => {
    const rawMonth = searchParams.get("month");
    if (!rawMonth) {
      return null;
    }

    const parsed = fromMonthInputValue(rawMonth);
    return parsed ? startOfMonth(parsed) : null;
  }, [searchParams]);

  useEffect(() => {
    const nextMonth = startOfMonth(
      dateFromDateKey(initialMonthStartDate) ?? new Date(),
    );

    setMonth((current) => {
      const isSameMonth =
        current.getFullYear() === nextMonth.getFullYear() &&
        current.getMonth() === nextMonth.getMonth();

      return isSameMonth ? current : nextMonth;
    });
  }, [initialMonthStartDate]);

  useEffect(() => {
    if (!monthFromQuery) {
      return;
    }

    setMonth((current) => {
      const isSameMonth =
        current.getFullYear() === monthFromQuery.getFullYear() &&
        current.getMonth() === monthFromQuery.getMonth();

      return isSameMonth ? current : monthFromQuery;
    });
  }, [monthFromQuery]);

  const handleCreateShift = (date: Date) => {
    const dateString = toDateKey(date);
    const params = new URLSearchParams({
      date: dateString,
      month: toMonthInputValue(month),
    });
    router.push(`/my/shifts/new?${params.toString()}`);
  };

  const handleBulkRetrySync = async () => {
    if (failedShiftIds.length === 0 || isBulkRetrying) {
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
            };
          }

          const apiError = await readGoogleSyncFailureFromErrorResponse(
            response,
            "Google Calendar への再同期に失敗しました",
          );

          return {
            ok: false as const,
            requiresCalendarSetup: apiError.requiresCalendarSetup,
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

          return {
            ...acc,
            failureCount: acc.failureCount + 1,
            requiresCalendarSetup: acc.requiresCalendarSetup || requiresSetup,
          };
        },
        {
          successCount: 0,
          failureCount: 0,
          requiresCalendarSetup: false,
        },
      );

      await reload();

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

      if (summary.requiresCalendarSetup) {
        router.push(CALENDAR_SETUP_PATH);
      }
    } finally {
      setIsBulkRetrying(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">ダッシュボード</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            当月のシフト状況と概算値を確認できます。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth(startOfMonth(new Date()))}
            disabled={isCurrentMonth}
          >
            今月に戻る
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleCreateShift(new Date())}
          >
            新規シフト登録
          </Button>
          <Button type="button" onClick={() => router.push("/my/shifts/bulk")}>
            一括登録
          </Button>
        </div>
      </header>

      {initialUnconfirmedShiftCount > 0 ? (
        <Card className="border-amber-300/70 bg-amber-50/70">
          <CardHeader className="gap-3 md:flex sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
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

      <Card
        className={
          failedShiftCount > 0
            ? "border-amber-300/70 bg-amber-50/70"
            : "border-emerald-300/70 bg-emerald-50/70"
        }
      >
        <CardContent className="flex items-center justify-between gap-3 py-1">
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
              disabled={isBulkRetrying}
            >
              <RefreshCwIcon
                className={`size-4 ${isBulkRetrying ? "animate-spin" : ""}`}
              />
              {isBulkRetrying ? "再同期中..." : "一括して再同期"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <StatCardsLoadingSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{summaryPeriodLabel}の概算給与</CardTitle>
              <CardDescription>シフト一覧から算出した暫定値</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatCurrency(summary.totalEstimatedPay)}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{summaryPeriodLabel}の勤務時間</CardTitle>
              <CardDescription>休憩控除後の合計時間</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {(summary.totalWorkedMinutes / 60).toFixed(1)} 時間
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{summaryPeriodLabel}のシフト件数</CardTitle>
              <CardDescription>登録済み件数</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {summary.shiftCount} 件
            </CardContent>
          </Card>
        </div>
      )}

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <CalendarLoadingSkeleton />
      ) : (
        <MonthCalendar
          month={month}
          shifts={shifts}
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
      )}

      <ShiftListModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        targetDate={selectedDate}
        shifts={selectedDateShifts}
        onCreateShift={handleCreateShift}
        onEditShift={(shiftId) => {
          const params = new URLSearchParams({
            month: toMonthInputValue(month),
          });
          router.push(`/my/shifts/${shiftId}/edit?${params.toString()}`);
        }}
        onDeleteShift={async (shiftId) => {
          const response = await fetch(`/api/shifts/${shiftId}`, {
            method: "DELETE",
          });

          if (response.ok === false) {
            const apiError = await readGoogleSyncFailureFromErrorResponse(
              response,
              "シフトの削除に失敗しました",
            );
            throw new Error(apiError.message);
          }

          const payload = (await response.json()) as unknown;
          const syncFailure = parseGoogleSyncFailureFromPayload(
            payload,
            messages.error.calendarSyncFailed,
          );

          await reload();

          if (syncFailure) {
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

          toast.success(messages.success.shiftDeleted);
        }}
        onRetrySync={async (shiftId) => {
          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok === false) {
            const apiError = await readGoogleSyncFailureFromErrorResponse(
              response,
              "Google Calendar への再同期に失敗しました",
            );

            if (apiError.requiresCalendarSetup) {
              router.push(CALENDAR_SETUP_PATH);
            }

            throw new Error(apiError.message);
          }

          await reload();
          toast.success(messages.success.calendarSyncRetried);
        }}
      />
    </section>
  );
}

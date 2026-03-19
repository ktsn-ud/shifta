"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  addMonths,
  dateKeyFromApiDate,
  startOfMonth,
  toDateKey,
} from "@/lib/calendar/date";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { summarizeShifts, useMonthShifts } from "@/hooks/use-month-shifts";
import { messages } from "@/lib/messages";

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

export default function Page() {
  const router = useRouter();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);

  const { shifts, isLoading, errorMessage, reload } = useMonthShifts(month);

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

  const handleCreateShift = (date: Date) => {
    const dateString = toDateKey(date);
    router.push(`/my/shifts/new?date=${dateString}`);
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
            onClick={() => handleCreateShift(new Date())}
          >
            新規シフト登録
          </Button>
          <Button type="button" onClick={() => router.push("/my/shifts/bulk")}>
            一括登録
          </Button>
        </div>
      </header>

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
          router.push(`/my/shifts/${shiftId}/edit`);
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

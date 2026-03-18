"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  addMonths,
  dateKeyFromApiDate,
  startOfMonth,
  toDateKey,
} from "@/lib/calendar/date";
import { summarizeShifts, useMonthShifts } from "@/hooks/use-month-shifts";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
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
          <h2 className="text-xl font-semibold">Dashboard</h2>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>今月の概算給与</CardTitle>
            <CardDescription>シフト一覧から算出した暫定値</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(summary.totalEstimatedPay)}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>今月の勤務時間</CardTitle>
            <CardDescription>休憩控除後の合計時間</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(summary.totalWorkedMinutes / 60).toFixed(1)} 時間
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>今月のシフト件数</CardTitle>
            <CardDescription>登録済み件数</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {summary.shiftCount} 件
          </CardContent>
        </Card>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          シフトを読み込み中です...
        </p>
      ) : null}

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
            throw new Error("SHIFT_DELETE_FAILED");
          }

          await reload();
        }}
        onRetrySync={async (shiftId) => {
          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok === false) {
            const payload = (await response.json()) as {
              error?: string;
              details?: { detail?: string };
            };

            throw new Error(
              payload.details?.detail ??
                payload.error ??
                "Google Calendar への再同期に失敗しました",
            );
          }

          await reload();
        }}
      />
    </section>
  );
}

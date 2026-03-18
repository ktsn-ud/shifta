"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { ShiftListModal } from "@/components/calendar/ShiftListModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarLoadingSkeleton } from "@/components/ui/loading-skeletons";
import {
  addMonths,
  dateKeyFromApiDate,
  fromMonthInputValue,
  startOfMonth,
  toDateKey,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { useMonthShifts } from "@/hooks/use-month-shifts";
import { messages } from "@/lib/messages";

export default function CalendarPage() {
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

  const selectedDateShifts = shiftsByDate.get(toDateKey(selectedDate)) ?? [];

  const handleCreateShift = (date: Date) => {
    const dateString = toDateKey(date);
    router.push(`/my/shifts/new?date=${dateString}`);
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">カレンダー</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            月を切り替えてシフト一覧を確認できます。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={toMonthInputValue(month)}
            onChange={(event) => {
              const nextMonth = fromMonthInputValue(event.currentTarget.value);
              if (nextMonth) {
                setMonth(nextMonth);
              }
            }}
            className="w-44"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            今月
          </Button>
        </div>
      </header>

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
            throw new Error("SHIFT_DELETE_FAILED");
          }

          await reload();
          toast.success(messages.success.shiftDeleted);
        }}
        onRetrySync={async (shiftId) => {
          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok === false) {
            const payload = (await response.json()) as {
              error?: string;
            };
            throw new Error(
              payload.error ?? "Google Calendar への再同期に失敗しました",
            );
          }

          await reload();
          toast.success(messages.success.calendarSyncRetried);
        }}
      />
    </section>
  );
}

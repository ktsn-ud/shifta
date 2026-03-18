"use client";

import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  dateKeyFromApiDate,
  formatMonthLabel,
  toDateKey,
} from "@/lib/calendar/date";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DAY_CELL_COUNT = 42;
const SHIFT_DOT_LIMIT = 5;
const SHIFT_DOT_VISIBLE_WHEN_OVERFLOW = 3;

type MonthCalendarShift = {
  id: string;
  date: string;
  workplace: {
    id: string;
    name: string;
    color: string;
  };
};

type MonthCalendarProps = {
  month: Date;
  shifts: MonthCalendarShift[];
  onDateClick: (date: Date) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
};

type CalendarCell = {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
  shifts: MonthCalendarShift[];
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toMonthGrid(month: Date): CalendarCell[] {
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(firstDayOfMonth, -firstDayOfMonth.getDay());

  return Array.from({ length: DAY_CELL_COUNT }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      key: toDateKey(date),
      isCurrentMonth: date.getMonth() === month.getMonth(),
      shifts: [],
    };
  });
}

function getVisibleShifts(dayShifts: MonthCalendarShift[]): {
  visible: MonthCalendarShift[];
  hiddenCount: number;
} {
  if (dayShifts.length <= SHIFT_DOT_LIMIT) {
    return { visible: dayShifts, hiddenCount: 0 };
  }

  return {
    visible: dayShifts.slice(0, SHIFT_DOT_VISIBLE_WHEN_OVERFLOW),
    hiddenCount: dayShifts.length - SHIFT_DOT_VISIBLE_WHEN_OVERFLOW,
  };
}

export function MonthCalendar({
  month,
  shifts,
  onDateClick,
  onNavigatePrev,
  onNavigateNext,
}: MonthCalendarProps) {
  const todayKey = toDateKey(new Date());

  const shiftMap = useMemo(() => {
    const grouped = new Map<string, MonthCalendarShift[]>();
    for (const shift of shifts) {
      const key = dateKeyFromApiDate(shift.date);
      const list = grouped.get(key) ?? [];
      list.push(shift);
      grouped.set(key, list);
    }
    return grouped;
  }, [shifts]);

  const cells = useMemo(() => {
    return toMonthGrid(month).map((cell) => ({
      ...cell,
      shifts: shiftMap.get(cell.key) ?? [],
    }));
  }, [month, shiftMap]);

  return (
    <section className="rounded-xl border">
      <header className="flex items-center justify-between border-b px-3 py-2 md:px-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNavigatePrev}
        >
          <ChevronLeftIcon className="size-4" />
          前月
        </Button>
        <h2 className="text-base font-semibold">{formatMonthLabel(month)}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNavigateNext}
        >
          次月
          <ChevronRightIcon className="size-4" />
        </Button>
      </header>

      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <TooltipProvider delay={2000}>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const { visible, hiddenCount } = getVisibleShifts(cell.shifts);
            const isToday = cell.key === todayKey;

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  if (!cell.isCurrentMonth) {
                    return;
                  }
                  onDateClick(new Date(cell.date));
                }}
                disabled={!cell.isCurrentMonth}
                className={cn(
                  "group relative flex min-h-24 flex-col items-center border-b border-r px-1 py-2 text-left transition-colors last:border-r-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden md:min-h-28",
                  cell.isCurrentMonth && "cursor-pointer",
                  !cell.isCurrentMonth &&
                    "cursor-not-allowed bg-muted/20 text-muted-foreground/70 hover:bg-muted/20",
                )}
              >
                {isToday ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1.5 left-1/2 size-8 -translate-x-1/2 rounded-full bg-primary/20"
                  />
                ) : null}

                <span
                  className={cn(
                    "relative z-10 text-sm font-medium",
                    !cell.isCurrentMonth && "text-muted-foreground",
                  )}
                >
                  {cell.date.getDate()}
                </span>

                <div className="mt-2 flex min-h-6 flex-wrap items-center justify-center gap-1">
                  {visible.map((shift) => (
                    <Tooltip key={shift.id}>
                      <TooltipTrigger
                        render={
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: shift.workplace.color }}
                          />
                        }
                      />
                      <TooltipContent>{shift.workplace.name}</TooltipContent>
                    </Tooltip>
                  ))}
                  {hiddenCount > 0 ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      +{hiddenCount}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </TooltipProvider>
    </section>
  );
}

export type { MonthCalendarProps, MonthCalendarShift };

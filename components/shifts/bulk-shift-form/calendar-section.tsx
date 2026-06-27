"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import holidayJp from "@holiday-jp/holiday_jp";
import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpinnerPanel } from "@/components/ui/spinner";
import { formatMonthLabel } from "@/lib/calendar/date";
import { cn } from "@/lib/utils";
import {
  formatGoogleEventLabel,
  getGoogleEventBadgeColor,
  getVisibleGoogleEvents,
  WEEKDAY_LABELS,
} from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftCalendarSection(
  props: Pick<
    BulkShiftFormController,
    | "calendarOptions"
    | "selectedCalendarIds"
    | "googleEventsByDate"
    | "calendarCells"
    | "displayMonth"
    | "todayKey"
    | "selectedDateKeys"
    | "errors"
    | "googleEventsError"
    | "googleEventsWarning"
    | "isInitialGoogleCalendarLoading"
    | "isRefreshingGoogleEvents"
    | "handleRequestedMonthChange"
    | "handleResetCalendarSelectionToDefault"
    | "handleToggleCalendarSelection"
    | "handleToggleDateSelection"
    | "handleClearSelectedDates"
  >,
) {
  const {
    calendarOptions,
    selectedCalendarIds,
    googleEventsByDate,
    calendarCells,
    displayMonth,
    todayKey,
    selectedDateKeys,
    errors,
    googleEventsError,
    googleEventsWarning,
    isInitialGoogleCalendarLoading,
    isRefreshingGoogleEvents,
    handleRequestedMonthChange,
    handleResetCalendarSelectionToDefault,
    handleToggleCalendarSelection,
    handleToggleDateSelection,
    handleClearSelectedDates,
  } = props;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">2. 日付選択</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            選択中: {selectedDateKeys.length}日
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearSelectedDates}
            disabled={selectedDateKeys.length === 0}
          >
            選択をリセット
          </Button>
        </div>
      </div>

      {isInitialGoogleCalendarLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="Google予定を読み込み中..."
        />
      ) : (
        <LoadingOverlay
          isLoading={isRefreshingGoogleEvents}
          className="rounded-lg"
        >
          <>
            {calendarOptions.length > 0 ? (
              <div className="space-y-2 rounded-md border border-dashed px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Google予定の表示対象カレンダー（{selectedCalendarIds.length}
                    /{calendarOptions.length}）
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetCalendarSelectionToDefault}
                  >
                    デフォルトに戻す
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {calendarOptions.map((calendar) => (
                    <label
                      key={calendar.id}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <Checkbox
                        checked={selectedCalendarIds.includes(calendar.id)}
                        onCheckedChange={(checked) =>
                          handleToggleCalendarSelection(
                            calendar.id,
                            checked === true,
                          )
                        }
                      />
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getGoogleEventBadgeColor(
                            calendar.color,
                          ),
                        }}
                      />
                      <span className="truncate">{calendar.summary}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2 md:px-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRequestedMonthChange(-1)}
                >
                  <ChevronLeftIcon className="size-4" />
                  前月
                </Button>
                <p className="text-sm font-semibold">
                  {formatMonthLabel(displayMonth)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRequestedMonthChange(1)}
                >
                  次月
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>

              <div className="grid grid-cols-7 border-b bg-muted/30">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="py-2 text-center text-xs">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarCells.map((cell) => {
                  const isSelected = selectedDateKeys.includes(cell.key);
                  const isToday = cell.key === todayKey;
                  const dayOfWeek = cell.date.getDay();
                  const isHoliday = holidayJp.isHoliday(cell.key);
                  const isSaturday = dayOfWeek === 6;
                  const isRedDate = dayOfWeek === 0 || isHoliday;
                  const googleEventDay = googleEventsByDate[cell.key];
                  const { visible: visibleGoogleEvents, hiddenCount } =
                    getVisibleGoogleEvents(googleEventDay);

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => {
                        if (cell.isCurrentMonth) {
                          handleToggleDateSelection(cell.key);
                        }
                      }}
                      className={cn(
                        "relative flex min-h-24 flex-col border-r border-b px-1 py-2 text-left text-sm last:border-r-0 md:min-h-28",
                        cell.isCurrentMonth
                          ? "cursor-pointer hover:bg-muted/50"
                          : "cursor-not-allowed bg-muted/20 text-muted-foreground/60",
                        isSelected &&
                          "bg-zinc-200 font-semibold ring-2 ring-zinc-400 ring-inset hover:bg-zinc-200 dark:bg-zinc-800/50 dark:ring-zinc-600 dark:hover:bg-zinc-800/50",
                      )}
                      disabled={!cell.isCurrentMonth}
                      aria-label={String(cell.date.getDate())}
                    >
                      {isToday ? (
                        <span className="pointer-events-none absolute top-0.5 left-1/2 size-8 -translate-x-1/2 rounded-full bg-primary/20" />
                      ) : null}

                      <span
                        className={cn(
                          "relative z-10 self-center text-sm font-medium",
                          cell.isCurrentMonth && isRedDate && "text-red-600",
                          cell.isCurrentMonth &&
                            !isRedDate &&
                            isSaturday &&
                            "text-blue-600",
                          !cell.isCurrentMonth && "text-muted-foreground",
                        )}
                      >
                        {cell.date.getDate()}
                      </span>

                      <ul className="mt-2 w-full space-y-1 px-1">
                        {visibleGoogleEvents.map((item, index) => (
                          <li
                            key={`${cell.key}:${item.calendarId}:${item.title}:${index}`}
                            className="flex items-center gap-1 text-[10px] leading-none"
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: getGoogleEventBadgeColor(
                                  item.calendarColor,
                                ),
                              }}
                            />
                            <span className="truncate text-foreground">
                              {formatGoogleEventLabel(item)}
                            </span>
                          </li>
                        ))}
                        {hiddenCount > 0 ? (
                          <li className="text-[10px] font-medium text-muted-foreground">
                            +{hiddenCount}
                          </li>
                        ) : null}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        </LoadingOverlay>
      )}

      {googleEventsError ? (
        <p className="text-xs text-amber-600">{googleEventsError}</p>
      ) : null}
      {googleEventsWarning ? (
        <p className="text-xs text-muted-foreground">{googleEventsWarning}</p>
      ) : null}
      <FormErrorMessage message={errors.selectedDates} />
    </section>
  );
}

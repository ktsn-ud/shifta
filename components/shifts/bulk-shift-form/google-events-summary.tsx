"use client";

import type { GoogleCalendarDay } from "@/components/shifts/bulk-shift-form/google-events-parser";
import {
  formatGoogleEventLabel,
  getGoogleEventBadgeColor,
  getVisibleGoogleEvents,
} from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftGoogleEventsSummary(props: {
  dateKey: string;
  googleEventDay: GoogleCalendarDay | undefined;
}) {
  const { dateKey, googleEventDay } = props;
  const { visible: visibleGoogleEvents, hiddenCount: hiddenGoogleEventCount } =
    getVisibleGoogleEvents(googleEventDay);
  const eventKeyOccurrences = new Map<string, number>();

  if (visibleGoogleEvents.length === 0 && hiddenGoogleEventCount === 0) {
    return null;
  }

  return (
    <div className="mt-2 rounded-md bg-muted/40 px-2 py-2">
      <p className="text-xs text-muted-foreground">Google予定</p>
      <ul className="mt-1 space-y-1">
        {visibleGoogleEvents.map((item) => {
          const baseKey = `${dateKey}:${item.calendarId}:${item.start}:${item.end}:${item.title}:${item.calendarSummary}`;
          const occurrence = eventKeyOccurrences.get(baseKey) ?? 0;
          eventKeyOccurrences.set(baseKey, occurrence + 1);

          return (
            <li
              key={`${baseKey}:${occurrence}`}
              className="flex items-center gap-1 text-xs leading-tight"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: getGoogleEventBadgeColor(item.calendarColor),
                }}
              />
              <span className="truncate text-foreground">
                {formatGoogleEventLabel(item)}
              </span>
            </li>
          );
        })}
        {hiddenGoogleEventCount > 0 ? (
          <li className="text-xs font-medium text-muted-foreground">
            +{hiddenGoogleEventCount}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

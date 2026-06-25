"use client";

import { dateFromDateKey } from "@/lib/calendar/date";
import { formatShiftType } from "@/lib/enum-labels";
import type {
  GoogleCalendarDay,
  GoogleCalendarEventItem,
  ShiftType,
  Workplace,
} from "@/components/shifts/BulkShiftForm";

const selectedDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const GOOGLE_EVENT_LIST_LIMIT = 5;
const GOOGLE_EVENT_LIST_VISIBLE_WHEN_OVERFLOW = 3;

export const WEEKDAY_LABELS = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const;
export const MAX_BREAK_MINUTES = 240;

export function getVisibleGoogleEvents(day: GoogleCalendarDay | undefined): {
  visible: GoogleCalendarEventItem[];
  hiddenCount: number;
} {
  if (!day || day.count <= 0) {
    return {
      visible: [],
      hiddenCount: 0,
    };
  }

  const items = day.items;
  if (items.length <= GOOGLE_EVENT_LIST_LIMIT) {
    return {
      visible: items,
      hiddenCount: Math.max(day.count - items.length, 0),
    };
  }

  return {
    visible: items.slice(0, GOOGLE_EVENT_LIST_VISIBLE_WHEN_OVERFLOW),
    hiddenCount: Math.max(
      day.count - GOOGLE_EVENT_LIST_VISIBLE_WHEN_OVERFLOW,
      0,
    ),
  };
}

export function getGoogleEventBadgeColor(
  color: string | null | undefined,
): string {
  if (typeof color !== "string") {
    return "#0ea5e9";
  }

  const normalized = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized;
  }

  return "#0ea5e9";
}

export function formatGoogleEventLabel(event: GoogleCalendarEventItem): string {
  if (event.allDay) {
    return event.title;
  }

  return `${event.start}-${event.end} ${event.title}`;
}

export function formatSelectedDate(dateKey: string): string {
  const date = dateFromDateKey(dateKey);
  if (!date) {
    return dateKey;
  }

  return selectedDateFormatter.format(date);
}

export function formatShiftTypeForWorkplace(
  shiftType: ShiftType,
  workplaceType: Workplace["type"] | undefined,
): string {
  if (workplaceType === "CRAM_SCHOOL" && shiftType === "NORMAL") {
    return "事務";
  }

  return formatShiftType(shiftType);
}

export function formatEventNamePreview(
  workplaceName: string | undefined,
  comment: string,
): string {
  if (!workplaceName) {
    return "勤務先を選択するとイベント名を確認できます";
  }

  const trimmedComment = comment.trim();
  const eventName =
    trimmedComment.length > 0
      ? `${workplaceName} (${trimmedComment})`
      : workplaceName;

  return `イベント名プレビュー「${eventName}」`;
}

export function getLessonSelectionValues(
  timetableSetId: string,
  lessonPeriodsBySetId: Record<string, number[]>,
  firstTimetableSetId: string,
): {
  timetableSetId: string;
  startPeriod: string;
  endPeriod: string;
} {
  const nextTimetableSetId = timetableSetId || firstTimetableSetId;
  const periods = lessonPeriodsBySetId[nextTimetableSetId] ?? [];
  const fallbackPeriod = periods[0] ? String(periods[0]) : "";

  return {
    timetableSetId: nextTimetableSetId,
    startPeriod: fallbackPeriod,
    endPeriod: fallbackPeriod,
  };
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import holidayJp from "@holiday-jp/holiday_jp";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpinnerPanel } from "@/components/ui/spinner";
import {
  DATE_ONLY_REGEX,
  TIME_ONLY_REGEX,
  toMinutes,
} from "@/lib/api/date-time";
import {
  addMonths,
  dateFromDateKey,
  formatMonthLabel,
  toMonthInputValue,
  toDateKey,
} from "@/lib/calendar/date";
import { formatShiftType } from "@/lib/enum-labels";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { clearShiftDerivedCaches } from "@/lib/client-cache/shift-derived-cache";
import { messages, toErrorMessage } from "@/lib/messages";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const BULK_CALENDAR_SELECTION_STORAGE_KEY = "shifta:bulk-calendar-selection";
const BULK_CALENDAR_SELECTION_SCHEMA_VERSION = 1;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DAY_CELL_COUNT = 42;
const MAX_BREAK_MINUTES = 240;
const GOOGLE_EVENT_LIST_LIMIT = 5;
const GOOGLE_EVENT_LIST_VISIBLE_WHEN_OVERFLOW = 3;

type ShiftType = "NORMAL" | "LESSON";

type Workplace = {
  id: string;
  name: string;
  color: string;
  type: "GENERAL" | "CRAM_SCHOOL";
};

type TimetableSetItem = {
  id: string;
  timetableSetId: string;
  period: number;
  startTime: string;
  endTime: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
};

type TimetableSet = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: TimetableSetItem[];
};

type GoogleCalendarOption = {
  id: string;
  summary: string;
  color: string | null;
};

type GoogleCalendarEventItem = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string;
  calendarColor: string | null;
};

type GoogleCalendarDay = {
  date: string;
  count: number;
  items: GoogleCalendarEventItem[];
};

type PersistedBulkCalendarSelection = {
  version: number;
  hasUserSelection: boolean;
  selectedCalendarIds: string[];
};

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShiftWorkplaceType(value: unknown): value is Workplace["type"] {
  return value === "GENERAL" || value === "CRAM_SCHOOL";
}

function isWorkplace(value: unknown): value is Workplace {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    isShiftWorkplaceType(value.type)
  );
}

function isTimetableSetItem(value: unknown): value is TimetableSetItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.timetableSetId === "string" &&
    typeof value.period === "number" &&
    Number.isInteger(value.period) &&
    value.period > 0 &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string" &&
    (value.startTimeLabel === undefined ||
      typeof value.startTimeLabel === "string") &&
    (value.endTimeLabel === undefined || typeof value.endTimeLabel === "string")
  );
}

function isTimetableSet(value: unknown): value is TimetableSet {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.workplaceId === "string" &&
    typeof value.name === "string" &&
    typeof value.sortOrder === "number" &&
    Number.isInteger(value.sortOrder) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    value.items.every(isTimetableSetItem)
  );
}

function isGoogleCalendarOption(value: unknown): value is GoogleCalendarOption {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.summary === "string" &&
    (typeof value.color === "string" || value.color === null)
  );
}

function isGoogleCalendarEventItem(
  value: unknown,
): value is GoogleCalendarEventItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    typeof value.start === "string" &&
    typeof value.end === "string" &&
    typeof value.allDay === "boolean" &&
    typeof value.calendarId === "string" &&
    typeof value.calendarSummary === "string" &&
    (typeof value.calendarColor === "string" || value.calendarColor === null)
  );
}

function isGoogleCalendarDay(value: unknown): value is GoogleCalendarDay {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }

  return (
    typeof value.date === "string" &&
    DATE_ONLY_REGEX.test(value.date) &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 0 &&
    value.items.every(isGoogleCalendarEventItem)
  );
}

function parseWorkplaceListResponse(payload: unknown): Workplace[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  if (payload.data.every(isWorkplace) === false) {
    return null;
  }

  return payload.data;
}

function parseTimetableSetListResponse(
  payload: unknown,
): TimetableSet[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  if (payload.data.every(isTimetableSet) === false) {
    return null;
  }

  return payload.data;
}

function parseGoogleCalendarEventsResponse(payload: unknown): {
  month: string;
  calendars: GoogleCalendarOption[];
  selectedCalendarIds: string[];
  dates: GoogleCalendarDay[];
} | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (typeof data.month !== "string" || !MONTH_KEY_REGEX.test(data.month)) {
    return null;
  }

  if (
    !Array.isArray(data.calendars) ||
    !Array.isArray(data.selectedCalendarIds)
  ) {
    return null;
  }

  if (data.calendars.every(isGoogleCalendarOption) === false) {
    return null;
  }

  if (
    data.selectedCalendarIds.every((id) => typeof id === "string") === false
  ) {
    return null;
  }

  if (
    !Array.isArray(data.dates) ||
    data.dates.every(isGoogleCalendarDay) === false
  ) {
    return null;
  }

  return {
    month: data.month,
    calendars: data.calendars,
    selectedCalendarIds: data.selectedCalendarIds,
    dates: data.dates,
  };
}

function isPersistedBulkCalendarSelection(
  value: unknown,
): value is PersistedBulkCalendarSelection {
  if (!isRecord(value) || !Array.isArray(value.selectedCalendarIds)) {
    return false;
  }

  return (
    typeof value.version === "number" &&
    typeof value.hasUserSelection === "boolean" &&
    value.selectedCalendarIds.every((id) => typeof id === "string")
  );
}

function readPersistedBulkCalendarSelection(): PersistedBulkCalendarSelection | null {
  try {
    const raw = localStorage.getItem(BULK_CALENDAR_SELECTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedBulkCalendarSelection(parsed)) {
      return null;
    }

    if (parsed.version !== BULK_CALENDAR_SELECTION_SCHEMA_VERSION) {
      return null;
    }

    return {
      version: parsed.version,
      hasUserSelection: parsed.hasUserSelection,
      selectedCalendarIds: Array.from(
        new Set(
          parsed.selectedCalendarIds
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        ),
      ),
    };
  } catch {
    return null;
  }
}

type BulkShiftRow = {
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  timetableSetId: string;
  startPeriod: string;
  endPeriod: string;
};

type BulkDefaults = Omit<BulkShiftRow, "date">;

type RowErrorKey =
  | "shiftType"
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "timetableSetId"
  | "startPeriod"
  | "endPeriod";

type RowErrors = Partial<Record<RowErrorKey, string>>;

type FormErrors = {
  workplaceId?: string;
  selectedDates?: string;
  form?: string;
  rows?: Record<string, RowErrors>;
};

type CalendarCell = {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
};

type NormalShiftPayload = {
  date: string;
  shiftType: "NORMAL";
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

type LessonShiftPayload = {
  date: string;
  shiftType: "LESSON";
  breakMinutes: number;
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  };
};

type BulkShiftPayload = NormalShiftPayload | LessonShiftPayload;

const DEFAULT_BULK_VALUES: BulkDefaults = {
  shiftType: "NORMAL",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: "0",
  timetableSetId: "",
  startPeriod: "",
  endPeriod: "",
};

function createRow(date: string, defaults: BulkDefaults): BulkShiftRow {
  return {
    date,
    shiftType: defaults.shiftType,
    startTime: defaults.startTime,
    endTime: defaults.endTime,
    breakMinutes: defaults.breakMinutes,
    timetableSetId: defaults.timetableSetId,
    startPeriod: defaults.startPeriod,
    endPeriod: defaults.endPeriod,
  };
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
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
    };
  });
}

function sortDateKeys(dateKeys: string[]): string[] {
  return [...dateKeys].sort((left, right) => left.localeCompare(right));
}

function getVisibleGoogleEvents(day: GoogleCalendarDay | undefined): {
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

function getGoogleEventBadgeColor(color: string | null | undefined): string {
  if (typeof color !== "string") {
    return "#0ea5e9";
  }

  const normalized = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized;
  }

  return "#0ea5e9";
}

function formatGoogleEventLabel(event: GoogleCalendarEventItem): string {
  if (event.allDay) {
    return event.title;
  }

  return `${event.start}-${event.end} ${event.title}`;
}

function formatSelectedDate(dateKey: string): string {
  const date = dateFromDateKey(dateKey);
  if (!date) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatShiftTypeForWorkplace(
  shiftType: ShiftType,
  workplaceType: Workplace["type"] | undefined,
): string {
  if (workplaceType === "CRAM_SCHOOL" && shiftType === "NORMAL") {
    return "事務";
  }

  return formatShiftType(shiftType);
}

function hasRowErrors(errors: RowErrors): boolean {
  return Object.keys(errors).length > 0;
}

function normalizeDefaultsForWorkplace(
  defaults: BulkDefaults,
  workplaceType: Workplace["type"] | undefined,
): BulkDefaults {
  if (workplaceType !== "GENERAL") {
    return defaults;
  }

  if (defaults.shiftType !== "LESSON") {
    return defaults;
  }

  return {
    ...defaults,
    shiftType: "NORMAL",
  };
}

function normalizeRowForWorkplace(
  row: BulkShiftRow,
  workplaceType: Workplace["type"] | undefined,
): BulkShiftRow {
  if (workplaceType !== "GENERAL") {
    return row;
  }

  if (row.shiftType !== "LESSON") {
    return row;
  }

  return {
    ...row,
    shiftType: "NORMAL",
    startTime: row.startTime || DEFAULT_BULK_VALUES.startTime,
    endTime: row.endTime || DEFAULT_BULK_VALUES.endTime,
    startPeriod: "",
    endPeriod: "",
  };
}

export function BulkShiftForm() {
  const router = useRouter();

  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [selectedWorkplaceId, setSelectedWorkplaceId] = useState("");
  const [timetableSets, setTimetableSets] = useState<TimetableSet[]>([]);
  const [selectedDateKeys, setSelectedDateKeys] = useState<string[]>([]);
  const [rowsByDate, setRowsByDate] = useState<Record<string, BulkShiftRow>>(
    {},
  );
  const [googleEventsByDate, setGoogleEventsByDate] = useState<
    Record<string, GoogleCalendarDay>
  >({});
  const [calendarOptions, setCalendarOptions] = useState<
    GoogleCalendarOption[]
  >([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [hasUserCalendarSelection, setHasUserCalendarSelection] =
    useState(false);
  const [isCalendarSelectionReady, setIsCalendarSelectionReady] =
    useState(false);
  const [isGoogleEventsLoading, setIsGoogleEventsLoading] = useState(true);
  const [googleEventsError, setGoogleEventsError] = useState<string | null>(
    null,
  );
  const [defaults, setDefaults] = useState<BulkDefaults>(DEFAULT_BULK_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isWorkplaceLoading, setIsWorkplaceLoading] = useState(true);
  const [isTimetableLoading, setIsTimetableLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayKey = toDateKey(new Date());

  const selectedWorkplace = useMemo(() => {
    return workplaces.find((workplace) => workplace.id === selectedWorkplaceId);
  }, [selectedWorkplaceId, workplaces]);
  const firstTimetableSetId = timetableSets[0]?.id ?? "";

  const lessonPeriodsBySetId = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const set of timetableSets) {
      map[set.id] = set.items
        .map((item) => item.period)
        .sort((left, right) => left - right);
    }

    return map;
  }, [timetableSets]);

  const timetableSetOptions = useMemo(
    () =>
      timetableSets.map((set) => ({
        id: set.id,
        name: set.name,
      })),
    [timetableSets],
  );
  const timetableSetNameById = useMemo(
    () =>
      Object.fromEntries(
        timetableSets.map((set) => [set.id, set.name] as const),
      ),
    [timetableSets],
  );

  const calendarCells = useMemo(() => {
    return toMonthGrid(month);
  }, [month]);

  const selectedRows = useMemo(() => {
    return selectedDateKeys
      .map((dateKey) => rowsByDate[dateKey])
      .filter((row): row is BulkShiftRow => Boolean(row));
  }, [rowsByDate, selectedDateKeys]);

  const calendarFilterKey = useMemo(
    () =>
      hasUserCalendarSelection ? selectedCalendarIds.join(",") : "default",
    [hasUserCalendarSelection, selectedCalendarIds],
  );
  const isGoogleCalendarLoading =
    !isCalendarSelectionReady || isGoogleEventsLoading;

  useEffect(() => {
    const persistedSelection = readPersistedBulkCalendarSelection();
    if (
      persistedSelection?.hasUserSelection &&
      persistedSelection.selectedCalendarIds.length > 0
    ) {
      setHasUserCalendarSelection(true);
      setSelectedCalendarIds(persistedSelection.selectedCalendarIds);
    }

    setIsCalendarSelectionReady(true);
  }, []);

  useEffect(() => {
    if (!isCalendarSelectionReady) {
      return;
    }

    if (!hasUserCalendarSelection || selectedCalendarIds.length === 0) {
      localStorage.removeItem(BULK_CALENDAR_SELECTION_STORAGE_KEY);
      return;
    }

    const payload: PersistedBulkCalendarSelection = {
      version: BULK_CALENDAR_SELECTION_SCHEMA_VERSION,
      hasUserSelection: true,
      selectedCalendarIds,
    };

    localStorage.setItem(
      BULK_CALENDAR_SELECTION_STORAGE_KEY,
      JSON.stringify(payload),
    );
  }, [hasUserCalendarSelection, isCalendarSelectionReady, selectedCalendarIds]);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchWorkplaces() {
      setIsWorkplaceLoading(true);

      try {
        const response = await fetch("/api/workplaces?includeCounts=false", {
          signal: abortController.signal,
        });

        if (response.ok === false) {
          throw new Error("勤務先一覧の取得に失敗しました。");
        }

        const nextWorkplaces = parseWorkplaceListResponse(
          (await response.json()) as unknown,
        );
        if (!nextWorkplaces) {
          throw new Error("勤務先一覧レスポンスの形式が不正です。");
        }

        setWorkplaces(nextWorkplaces);

        setSelectedWorkplaceId((current) => {
          if (
            current &&
            nextWorkplaces.some((workplace) => workplace.id === current)
          ) {
            return current;
          }

          const lastId = localStorage.getItem(LAST_WORKPLACE_ID_KEY);
          if (
            lastId &&
            nextWorkplaces.some((workplace) => workplace.id === lastId)
          ) {
            return lastId;
          }

          return nextWorkplaces[0]?.id ?? "";
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplaces", error);
        setWorkplaces([]);
        setSelectedWorkplaceId("");
        setErrors({
          form: "勤務先一覧の取得に失敗しました。時間を置いて再度お試しください。",
        });
      } finally {
        if (abortController.signal.aborted === false) {
          setIsWorkplaceLoading(false);
        }
      }
    }

    void fetchWorkplaces();

    return () => {
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    if (!isCalendarSelectionReady) {
      return;
    }

    const abortController = new AbortController();
    const params = new URLSearchParams({
      month: toMonthInputValue(month),
    });
    if (hasUserCalendarSelection) {
      for (const calendarId of selectedCalendarIds) {
        params.append("calendarId", calendarId);
      }
    }

    async function fetchGoogleCalendarEvents() {
      setIsGoogleEventsLoading(true);
      setGoogleEventsError(null);

      try {
        const response = await fetch(
          `/api/calendar/events?${params.toString()}`,
          {
            signal: abortController.signal,
          },
        );

        if (response.ok === false) {
          const resolved = await resolveUserFacingErrorFromResponse(
            response,
            "Google予定の取得に失敗しました。",
          );

          if (resolved.code === "READ_SCOPE_MISSING") {
            throw new Error(
              "Google予定を表示するには、再ログインして権限を再同意してください。",
            );
          }

          throw new Error(resolved.message);
        }

        const payload = parseGoogleCalendarEventsResponse(
          (await response.json()) as unknown,
        );
        if (!payload) {
          throw new Error("Google予定レスポンスの形式が不正です。");
        }

        const nextByDate: Record<string, GoogleCalendarDay> = {};
        for (const day of payload.dates) {
          nextByDate[day.date] = day;
        }

        setCalendarOptions(payload.calendars);
        setSelectedCalendarIds((current) => {
          if (!hasUserCalendarSelection) {
            const nextDefaultIds = payload.selectedCalendarIds;
            const isSameDefaultSelection =
              current.length === nextDefaultIds.length &&
              current.every((id, index) => id === nextDefaultIds[index]);

            return isSameDefaultSelection ? current : nextDefaultIds;
          }

          const availableIds = new Set(
            payload.calendars.map((item) => item.id),
          );
          const filtered = current.filter((id) => availableIds.has(id));
          const nextIds =
            filtered.length > 0 ? filtered : payload.selectedCalendarIds;
          const isSameSelection =
            current.length === nextIds.length &&
            current.every((id, index) => id === nextIds[index]);

          return isSameSelection ? current : nextIds;
        });
        setGoogleEventsByDate(nextByDate);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch google calendar events", error);
        setCalendarOptions([]);
        setGoogleEventsByDate({});
        setGoogleEventsError(
          toErrorMessage(error, "Google予定の取得に失敗しました。"),
        );
      } finally {
        if (abortController.signal.aborted === false) {
          setIsGoogleEventsLoading(false);
        }
      }
    }

    void fetchGoogleCalendarEvents();

    return () => {
      abortController.abort();
    };
  }, [
    calendarFilterKey,
    hasUserCalendarSelection,
    isCalendarSelectionReady,
    month,
    selectedCalendarIds,
  ]);

  useEffect(() => {
    if (!selectedWorkplaceId) {
      return;
    }

    localStorage.setItem(LAST_WORKPLACE_ID_KEY, selectedWorkplaceId);
  }, [selectedWorkplaceId]);

  useEffect(() => {
    if (!selectedWorkplace) {
      setTimetableSets([]);
      return;
    }

    if (selectedWorkplace.type !== "CRAM_SCHOOL") {
      setTimetableSets([]);
      return;
    }

    const workplaceId = selectedWorkplace.id;
    const abortController = new AbortController();

    async function fetchTimetables() {
      setIsTimetableLoading(true);

      try {
        const response = await fetch(
          `/api/workplaces/${workplaceId}/timetables`,
          {
            signal: abortController.signal,
          },
        );

        if (response.ok === false) {
          throw new Error("時間割の取得に失敗しました。");
        }

        const timetablesPayload = parseTimetableSetListResponse(
          (await response.json()) as unknown,
        );
        if (!timetablesPayload) {
          throw new Error("時間割レスポンスの形式が不正です。");
        }

        setTimetableSets(
          timetablesPayload.slice().sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            return left.createdAt.localeCompare(right.createdAt);
          }),
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetableSets", error);
        setTimetableSets([]);
        setErrors((current) => ({
          ...current,
          form: "時間割の取得に失敗しました。時間を置いて再度お試しください。",
        }));
      } finally {
        if (abortController.signal.aborted === false) {
          setIsTimetableLoading(false);
        }
      }
    }

    void fetchTimetables();

    return () => {
      abortController.abort();
    };
  }, [selectedWorkplace]);

  useEffect(() => {
    const workplaceType = selectedWorkplace?.type;

    setDefaults((current) =>
      normalizeDefaultsForWorkplace(current, workplaceType),
    );
    setRowsByDate((current) => {
      const next = { ...current };
      for (const dateKey of Object.keys(next)) {
        next[dateKey] = normalizeRowForWorkplace(next[dateKey], workplaceType);
      }
      return next;
    });
  }, [selectedWorkplace?.type]);

  useEffect(() => {
    if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
      return;
    }

    setDefaults((current) => {
      if (current.shiftType !== "NORMAL") {
        return current;
      }

      return {
        ...current,
        shiftType: "LESSON",
      };
    });
  }, [selectedWorkplace?.type]);

  useEffect(() => {
    if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
      return;
    }

    setDefaults((current) => {
      if (current.shiftType !== "LESSON") {
        return current;
      }

      const nextSetId =
        current.timetableSetId && lessonPeriodsBySetId[current.timetableSetId]
          ? current.timetableSetId
          : firstTimetableSetId;
      const periods = lessonPeriodsBySetId[nextSetId] ?? [];
      if (periods.length === 0) {
        return {
          ...current,
          timetableSetId: nextSetId,
          startPeriod: "",
          endPeriod: "",
        };
      }

      const fallback = String(periods[0]);
      return {
        ...current,
        timetableSetId: nextSetId,
        startPeriod: current.startPeriod || fallback,
        endPeriod: current.endPeriod || fallback,
      };
    });

    setRowsByDate((current) => {
      const next = { ...current };

      for (const dateKey of Object.keys(next)) {
        const row = next[dateKey];
        if (!row || row.shiftType !== "LESSON") {
          continue;
        }

        const nextSetId =
          row.timetableSetId && lessonPeriodsBySetId[row.timetableSetId]
            ? row.timetableSetId
            : firstTimetableSetId;
        const periods = lessonPeriodsBySetId[nextSetId] ?? [];
        const fallback = periods[0] ? String(periods[0]) : "";

        next[dateKey] = {
          ...row,
          timetableSetId: nextSetId,
          startPeriod: row.startPeriod || fallback,
          endPeriod: row.endPeriod || fallback,
        };
      }

      return next;
    });
  }, [firstTimetableSetId, lessonPeriodsBySetId, selectedWorkplace?.type]);

  const applyDefaultsToRows = () => {
    const normalizedDefaults = normalizeDefaultsForWorkplace(
      defaults,
      selectedWorkplace?.type,
    );

    setDefaults(normalizedDefaults);
    setRowsByDate((current) => {
      const next = { ...current };

      for (const dateKey of selectedDateKeys) {
        if (!next[dateKey]) {
          continue;
        }

        next[dateKey] = createRow(dateKey, normalizedDefaults);
      }

      return next;
    });
  };

  const resetDefaults = () => {
    setDefaults(
      normalizeDefaultsForWorkplace(
        DEFAULT_BULK_VALUES,
        selectedWorkplace?.type,
      ),
    );
  };

  const toggleCalendarSelection = (calendarId: string, checked: boolean) => {
    setHasUserCalendarSelection(true);
    setSelectedCalendarIds((current) => {
      const currentSet = new Set(current);

      if (checked) {
        currentSet.add(calendarId);
      } else {
        currentSet.delete(calendarId);
      }

      if (currentSet.size === 0) {
        return current;
      }

      return calendarOptions
        .map((option) => option.id)
        .filter((id) => currentSet.has(id));
    });
  };

  const resetCalendarSelectionToDefault = () => {
    setHasUserCalendarSelection(false);
    setSelectedCalendarIds([]);
  };

  const toggleDateSelection = (dateKey: string) => {
    setErrors((current) => ({
      ...current,
      selectedDates: undefined,
    }));

    setSelectedDateKeys((current) => {
      if (current.includes(dateKey)) {
        return current.filter((key) => key !== dateKey);
      }

      return sortDateKeys([...current, dateKey]);
    });

    setRowsByDate((current) => {
      if (current[dateKey]) {
        const next = { ...current };
        delete next[dateKey];
        return next;
      }

      return {
        ...current,
        [dateKey]: createRow(
          dateKey,
          normalizeDefaultsForWorkplace(defaults, selectedWorkplace?.type),
        ),
      };
    });
  };

  const removeRow = (dateKey: string) => {
    setSelectedDateKeys((current) => current.filter((key) => key !== dateKey));

    setRowsByDate((current) => {
      const next = { ...current };
      delete next[dateKey];
      return next;
    });

    setErrors((current) => {
      if (!current.rows) {
        return current;
      }

      const nextRows = { ...current.rows };
      delete nextRows[dateKey];

      return {
        ...current,
        rows: nextRows,
      };
    });
  };

  const updateRow = (dateKey: string, patch: Partial<BulkShiftRow>) => {
    setRowsByDate((current) => {
      const existing = current[dateKey];
      if (!existing) {
        return current;
      }

      return {
        ...current,
        [dateKey]: {
          ...existing,
          ...patch,
        },
      };
    });

    setErrors((current) => {
      if (!current.rows?.[dateKey]) {
        return current;
      }

      return {
        ...current,
        rows: {
          ...current.rows,
          [dateKey]: {},
        },
      };
    });
  };

  const validateAndBuildPayload = ():
    | {
        success: true;
        payload: BulkShiftPayload[];
      }
    | {
        success: false;
        errors: FormErrors;
      } => {
    const nextErrors: FormErrors = {
      rows: {},
    };

    if (!selectedWorkplaceId) {
      nextErrors.workplaceId = "勤務先を選択してください。";
    }

    if (selectedDateKeys.length === 0) {
      nextErrors.selectedDates = "1日以上選択してください。";
    }

    const payload: BulkShiftPayload[] = [];

    for (const dateKey of selectedDateKeys) {
      const row = rowsByDate[dateKey];
      const rowErrors: RowErrors = {};

      if (!row) {
        rowErrors.shiftType = "入力行の初期化に失敗しました。";
        nextErrors.rows![dateKey] = rowErrors;
        continue;
      }

      if (row.shiftType === "LESSON") {
        if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
          rowErrors.shiftType =
            "授業シフトは塾タイプ勤務先でのみ選択できます。";
        }

        if (!row.timetableSetId) {
          rowErrors.timetableSetId = "時間割セットを選択してください。";
        }

        const startPeriod = Number(row.startPeriod);
        const endPeriod = Number(row.endPeriod);

        if (!Number.isInteger(startPeriod) || startPeriod <= 0) {
          rowErrors.startPeriod = "開始コマは1以上の整数で入力してください。";
        }

        if (!Number.isInteger(endPeriod) || endPeriod <= 0) {
          rowErrors.endPeriod = "終了コマは1以上の整数で入力してください。";
        }

        if (
          Number.isInteger(startPeriod) &&
          Number.isInteger(endPeriod) &&
          startPeriod > endPeriod
        ) {
          rowErrors.endPeriod = "コマ範囲は開始<=終了で指定してください。";
        }

        const periods = lessonPeriodsBySetId[row.timetableSetId] ?? [];
        if (periods.length === 0) {
          rowErrors.startPeriod = "塾の授業は時間割が登録されていません。";
        } else if (
          Number.isInteger(startPeriod) &&
          Number.isInteger(endPeriod) &&
          startPeriod <= endPeriod
        ) {
          const periodSet = new Set(periods);

          for (let period = startPeriod; period <= endPeriod; period += 1) {
            if (periodSet.has(period) === false) {
              rowErrors.endPeriod = "塾の授業は時間割が登録されていません。";
              break;
            }
          }
        }

        if (!hasRowErrors(rowErrors)) {
          payload.push({
            date: dateKey,
            shiftType: "LESSON",
            breakMinutes: 0,
            lessonRange: {
              timetableSetId: row.timetableSetId,
              startPeriod,
              endPeriod,
            },
          });
        }
      } else {
        const breakMinutes = Number(row.breakMinutes);
        if (!Number.isInteger(breakMinutes)) {
          rowErrors.breakMinutes = "休憩時間は整数で入力してください。";
        } else if (breakMinutes < 0 || breakMinutes > MAX_BREAK_MINUTES) {
          rowErrors.breakMinutes = "休憩時間は0〜240分で入力してください。";
        }

        if (!TIME_ONLY_REGEX.test(row.startTime)) {
          rowErrors.startTime = "開始時刻はHH:MM形式で入力してください。";
        }

        if (!TIME_ONLY_REGEX.test(row.endTime)) {
          rowErrors.endTime = "終了時刻はHH:MM形式で入力してください。";
        }

        if (
          TIME_ONLY_REGEX.test(row.startTime) &&
          TIME_ONLY_REGEX.test(row.endTime) &&
          toMinutes(row.startTime) >= toMinutes(row.endTime)
        ) {
          rowErrors.endTime = "開始時刻は終了時刻より前にしてください。";
        }

        if (!hasRowErrors(rowErrors)) {
          payload.push({
            date: dateKey,
            shiftType: row.shiftType,
            startTime: row.startTime,
            endTime: row.endTime,
            breakMinutes,
          });
        }
      }

      if (hasRowErrors(rowErrors)) {
        nextErrors.rows![dateKey] = rowErrors;
      }
    }

    if (Object.keys(nextErrors.rows ?? {}).length === 0) {
      delete nextErrors.rows;
    }

    if (nextErrors.workplaceId || nextErrors.selectedDates || nextErrors.rows) {
      return {
        success: false,
        errors: nextErrors,
      };
    }

    return {
      success: true,
      payload,
    };
  };

  const handleSubmit = async () => {
    const validated = validateAndBuildPayload();

    if (!validated.success) {
      setErrors(validated.errors);
      const firstRowError = Object.values(validated.errors.rows ?? {})
        .flatMap((rowError) => Object.values(rowError))
        .find((message): message is string => Boolean(message));
      toast.error(messages.error.validation, {
        description:
          firstRowError ??
          validated.errors.workplaceId ??
          validated.errors.selectedDates,
        duration: 6000,
      });
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    const loadingToastId = toast.loading("シフトを一括登録中です...");

    try {
      const response = await fetch("/api/shifts/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workplaceId: selectedWorkplaceId,
          shifts: validated.payload,
        }),
      });

      if (response.ok === false) {
        const apiError = await readGoogleSyncFailureFromErrorResponse(
          response,
          "シフト一括登録に失敗しました。",
        );

        if (apiError.requiresCalendarSetup) {
          toast.error(messages.error.calendarSyncFailed, {
            id: loadingToastId,
            description: apiError.message,
            duration: 6000,
          });
          router.push(CALENDAR_SETUP_PATH);
          return;
        }

        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as {
        summary?: {
          total?: number;
          failed?: number;
        };
        sync?: {
          pending?: boolean;
        };
      };
      const createdCount = payload.summary?.total ?? validated.payload.length;
      const isSyncPending = payload.sync?.pending === true;

      const syncFailure = parseGoogleSyncFailureFromPayload(
        payload,
        messages.error.calendarSyncFailed,
      );

      if (syncFailure) {
        const failedCount = payload.summary?.failed ?? 0;
        const failedCountLabel =
          failedCount > 0
            ? `${failedCount}件のGoogle同期に失敗しました。`
            : "Google同期に失敗しました。";
        toast.error(messages.error.calendarSyncFailed, {
          id: loadingToastId,
          description: syncFailure.requiresCalendarSetup
            ? syncFailure.message
            : `${failedCountLabel} シフトは保存済みです。`,
          duration: 6000,
        });

        if (syncFailure.requiresCalendarSetup) {
          router.push(CALENDAR_SETUP_PATH);
          return;
        }

        clearShiftDerivedCaches();
        router.push("/my");
        return;
      }

      toast.success(messages.success.shiftsBulkCreated(createdCount), {
        id: loadingToastId,
        description: isSyncPending
          ? "Google Calendar 同期はバックグラウンドで実行中です。"
          : undefined,
      });
      clearShiftDerivedCaches();
      router.push("/my");
    } catch (error) {
      console.error("failed to submit bulk shifts", error);
      const message = toErrorMessage(error, messages.error.bulkShiftSaveFailed);
      setErrors({
        form: message,
      });
      toast.error(messages.error.bulkShiftSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">シフト一括登録</h2>
        <p className="text-sm text-muted-foreground">
          勤務先と日付を選び、複数日のシフトをまとめて登録します。
        </p>
      </header>

      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <section className="space-y-4 rounded-xl border p-4">
          <h3 className="text-base font-semibold">1. 勤務先選択</h3>

          {isWorkplaceLoading ? (
            <SpinnerPanel
              className="min-h-[120px] max-w-md"
              label="勤務先情報を読み込み中..."
            />
          ) : (
            <Field>
              <FieldLabel htmlFor="bulk-workplace">勤務先</FieldLabel>
              <FieldContent>
                <Select
                  value={selectedWorkplaceId}
                  onValueChange={(value) => {
                    if (value === null) {
                      return;
                    }

                    setSelectedWorkplaceId(value);
                    setErrors((current) => ({
                      ...current,
                      workplaceId: undefined,
                      form: undefined,
                    }));
                  }}
                  disabled={workplaces.length === 0}
                >
                  <SelectTrigger
                    id="bulk-workplace"
                    className="w-full md:w-72 max-w-50"
                  >
                    <SelectValue placeholder="勤務先を選択">
                      {selectedWorkplace?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {workplaces.map((workplace) => (
                        <SelectItem key={workplace.id} value={workplace.id}>
                          {workplace.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  前回選択した勤務先を初期表示します。
                </FieldDescription>
                <FormErrorMessage message={errors.workplaceId} />
              </FieldContent>
            </Field>
          )}
        </section>

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
                onClick={() => {
                  setSelectedDateKeys([]);
                  setRowsByDate({});
                  setErrors((current) => ({
                    ...current,
                    selectedDates: undefined,
                    rows: undefined,
                  }));
                }}
                disabled={selectedDateKeys.length === 0}
              >
                選択をリセット
              </Button>
            </div>
          </div>

          {isGoogleCalendarLoading ? (
            <SpinnerPanel
              className="min-h-[360px]"
              label="Google予定を読み込み中..."
            />
          ) : (
            <>
              {calendarOptions.length > 0 ? (
                <div className="space-y-2 rounded-md border border-dashed px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Google予定の表示対象カレンダー（
                      {selectedCalendarIds.length}/{calendarOptions.length}）
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetCalendarSelectionToDefault}
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
                          onCheckedChange={(checked) => {
                            toggleCalendarSelection(
                              calendar.id,
                              checked === true,
                            );
                          }}
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
                    onClick={() =>
                      setMonth((current) => addMonths(current, -1))
                    }
                  >
                    <ChevronLeftIcon className="size-4" />
                    前月
                  </Button>
                  <p className="text-sm font-semibold">
                    {formatMonthLabel(month)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMonth((current) => addMonths(current, 1))}
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
                    const isSunday = dayOfWeek === 0;
                    const isSaturday = dayOfWeek === 6;
                    const isRedDate = isSunday || isHoliday;
                    const googleEventDay = googleEventsByDate[cell.key];
                    const { visible: visibleGoogleEvents, hiddenCount } =
                      getVisibleGoogleEvents(googleEventDay);

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => {
                          if (!cell.isCurrentMonth) {
                            return;
                          }
                          toggleDateSelection(cell.key);
                        }}
                        className={cn(
                          "relative flex min-h-24 flex-col border-b border-r px-1 py-2 text-left text-sm last:border-r-0 md:min-h-28",
                          cell.isCurrentMonth
                            ? "cursor-pointer hover:bg-muted/50"
                            : "cursor-not-allowed bg-muted/20 text-muted-foreground/60",
                          isSelected &&
                            "bg-zinc-200 font-semibold hover:bg-zinc-200 ring-2 ring-inset ring-zinc-400 dark:bg-zinc-800/50 dark:hover:bg-zinc-800/50 dark:ring-zinc-600",
                        )}
                        disabled={cell.isCurrentMonth === false}
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
          )}

          {googleEventsError ? (
            <p className="text-xs text-amber-600">{googleEventsError}</p>
          ) : null}

          <FormErrorMessage message={errors.selectedDates} />
        </section>

        <section className="space-y-4 rounded-xl border p-4">
          <h3 className="text-base font-semibold">3. デフォルト値設定</h3>

          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>デフォルトシフトタイプ</FieldLabel>
              <FieldContent>
                <RadioGroup
                  value={defaults.shiftType}
                  onValueChange={(value) => {
                    const shiftType = value as ShiftType;
                    if (
                      shiftType === "LESSON" &&
                      selectedWorkplace?.type !== "CRAM_SCHOOL"
                    ) {
                      return;
                    }

                    const nextSetId =
                      defaults.timetableSetId || firstTimetableSetId;
                    const periods = lessonPeriodsBySetId[nextSetId] ?? [];
                    const fallbackPeriod = periods[0] ? String(periods[0]) : "";

                    setDefaults((current) => ({
                      ...current,
                      shiftType,
                      ...(shiftType === "LESSON"
                        ? {
                            timetableSetId: nextSetId,
                            startPeriod: current.startPeriod || fallbackPeriod,
                            endPeriod: current.endPeriod || fallbackPeriod,
                          }
                        : {}),
                    }));
                  }}
                >
                  {selectedWorkplace?.type === "CRAM_SCHOOL" ? (
                    <>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="LESSON"
                          id="default-shift-lesson"
                        />
                        <FieldLabel htmlFor="default-shift-lesson">
                          {formatShiftTypeForWorkplace(
                            "LESSON",
                            selectedWorkplace?.type,
                          )}
                        </FieldLabel>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="NORMAL"
                          id="default-shift-normal"
                        />
                        <FieldLabel htmlFor="default-shift-normal">
                          {formatShiftTypeForWorkplace(
                            "NORMAL",
                            selectedWorkplace?.type,
                          )}
                        </FieldLabel>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="NORMAL"
                        id="default-shift-normal"
                      />
                      <FieldLabel htmlFor="default-shift-normal">
                        {formatShiftTypeForWorkplace(
                          "NORMAL",
                          selectedWorkplace?.type,
                        )}
                      </FieldLabel>
                    </div>
                  )}
                </RadioGroup>
              </FieldContent>
            </Field>

            {defaults.shiftType === "LESSON" ? null : (
              <Field>
                <FieldLabel htmlFor="default-break">
                  デフォルト休憩時間
                </FieldLabel>
                <FieldContent>
                  <div className="flex items-center gap-2">
                    <Input
                      id="default-break"
                      type="number"
                      min={0}
                      max={MAX_BREAK_MINUTES}
                      value={defaults.breakMinutes}
                      onChange={(event) => {
                        const breakMinutes = event.currentTarget.value;
                        setDefaults((current) => ({
                          ...current,
                          breakMinutes,
                        }));
                      }}
                      className="max-w-16"
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">
                      分
                    </span>
                  </div>
                </FieldContent>
              </Field>
            )}
          </FieldGroup>

          {defaults.shiftType === "LESSON" ? (
            <FieldGroup className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>デフォルト時間割セット</FieldLabel>
                <FieldContent>
                  <Select
                    value={defaults.timetableSetId}
                    onValueChange={(value) => {
                      if (value === null) {
                        return;
                      }

                      const timetableSetId = value;
                      const periods =
                        lessonPeriodsBySetId[timetableSetId] ?? [];
                      const fallback = periods[0] ? String(periods[0]) : "";

                      setDefaults((current) => ({
                        ...current,
                        timetableSetId,
                        startPeriod: fallback,
                        endPeriod: fallback,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="時間割セットを選択">
                        {timetableSetNameById[defaults.timetableSetId]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {timetableSetOptions.map((set) => (
                          <SelectItem key={set.id} value={set.id}>
                            {set.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>デフォルト開始コマ</FieldLabel>
                <FieldContent>
                  <Select
                    value={defaults.startPeriod}
                    onValueChange={(value) => {
                      if (value === null) {
                        return;
                      }

                      setDefaults((current) => ({
                        ...current,
                        startPeriod: value,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="開始コマ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(
                          lessonPeriodsBySetId[defaults.timetableSetId] ?? []
                        ).map((period) => (
                          <SelectItem
                            key={`default-start-${period}`}
                            value={String(period)}
                          >
                            {period}限
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>デフォルト終了コマ</FieldLabel>
                <FieldContent>
                  <Select
                    value={defaults.endPeriod}
                    onValueChange={(value) => {
                      if (value === null) {
                        return;
                      }

                      setDefaults((current) => ({
                        ...current,
                        endPeriod: value,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="終了コマ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(
                          lessonPeriodsBySetId[defaults.timetableSetId] ?? []
                        ).map((period) => (
                          <SelectItem
                            key={`default-end-${period}`}
                            value={String(period)}
                          >
                            {period}限
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
          ) : (
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="default-start-time">
                  デフォルト開始時刻
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="default-start-time"
                    type="time"
                    value={defaults.startTime}
                    onChange={(event) => {
                      const startTime = event.currentTarget.value;
                      setDefaults((current) => ({
                        ...current,
                        startTime,
                      }));
                    }}
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="default-end-time">
                  デフォルト終了時刻
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="default-end-time"
                    type="time"
                    value={defaults.endTime}
                    onChange={(event) => {
                      const endTime = event.currentTarget.value;
                      setDefaults((current) => ({
                        ...current,
                        endTime,
                      }));
                    }}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={applyDefaultsToRows}
            >
              デフォルト値を適用
            </Button>
            <Button type="button" variant="ghost" onClick={resetDefaults}>
              リセット
            </Button>
          </div>

          {defaults.shiftType === "LESSON" &&
          selectedWorkplace?.type === "CRAM_SCHOOL" &&
          (lessonPeriodsBySetId[defaults.timetableSetId] ?? []).length === 0 ? (
            <FormErrorMessage message="塾の授業は時間割が登録されていません。" />
          ) : null}
        </section>

        <section className="space-y-4 rounded-xl border p-4">
          <h3 className="text-base font-semibold">4. 選択日の詳細入力</h3>

          {isTimetableLoading ? (
            <SpinnerPanel
              className="min-h-[220px]"
              label="時間割データを読み込み中..."
            />
          ) : selectedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              カレンダーから日付を選択してください。
            </p>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {selectedRows.map((row) => {
                const rowErrors = errors.rows?.[row.date] ?? {};
                const lessonPeriods =
                  lessonPeriodsBySetId[row.timetableSetId] ?? [];
                const googleEventDay = googleEventsByDate[row.date];
                const {
                  visible: visibleGoogleEvents,
                  hiddenCount: hiddenGoogleEventCount,
                } = getVisibleGoogleEvents(googleEventDay);

                return (
                  <section key={row.date} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {formatSelectedDate(row.date)}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(row.date)}
                        aria-label={`${row.date}の入力行を削除`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>

                    {visibleGoogleEvents.length > 0 ||
                    hiddenGoogleEventCount > 0 ? (
                      <div className="mt-2 rounded-md bg-muted/40 px-2 py-2">
                        <p className="text-xs text-muted-foreground">
                          Google予定
                        </p>
                        <ul className="mt-1 space-y-1">
                          {visibleGoogleEvents.map((item, index) => (
                            <li
                              key={`${row.date}:${item.calendarId}:${item.title}:${index}`}
                              className="flex items-center gap-1 text-xs leading-tight"
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
                          {hiddenGoogleEventCount > 0 ? (
                            <li className="text-xs font-medium text-muted-foreground">
                              +{hiddenGoogleEventCount}
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}

                    <FieldGroup className="mt-3 grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel>シフトタイプ</FieldLabel>
                        <FieldContent>
                          <RadioGroup
                            value={row.shiftType}
                            onValueChange={(value) => {
                              const shiftType = value as ShiftType;
                              if (
                                shiftType === "LESSON" &&
                                selectedWorkplace?.type !== "CRAM_SCHOOL"
                              ) {
                                return;
                              }

                              const nextSetId =
                                row.timetableSetId || firstTimetableSetId;
                              const periods =
                                lessonPeriodsBySetId[nextSetId] ?? [];
                              const fallbackPeriod = periods[0]
                                ? String(periods[0])
                                : "";

                              updateRow(row.date, {
                                shiftType,
                                ...(shiftType === "LESSON"
                                  ? {
                                      timetableSetId: nextSetId,
                                      startPeriod:
                                        row.startPeriod || fallbackPeriod,
                                      endPeriod:
                                        row.endPeriod || fallbackPeriod,
                                    }
                                  : {}),
                              });
                            }}
                          >
                            {selectedWorkplace?.type === "CRAM_SCHOOL" ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <RadioGroupItem
                                    value="LESSON"
                                    id={`${row.date}-shift-lesson`}
                                  />
                                  <FieldLabel
                                    htmlFor={`${row.date}-shift-lesson`}
                                  >
                                    {formatShiftTypeForWorkplace(
                                      "LESSON",
                                      selectedWorkplace?.type,
                                    )}
                                  </FieldLabel>
                                </div>
                                <div className="flex items-center gap-2">
                                  <RadioGroupItem
                                    value="NORMAL"
                                    id={`${row.date}-shift-normal`}
                                  />
                                  <FieldLabel
                                    htmlFor={`${row.date}-shift-normal`}
                                  >
                                    {formatShiftTypeForWorkplace(
                                      "NORMAL",
                                      selectedWorkplace?.type,
                                    )}
                                  </FieldLabel>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <RadioGroupItem
                                  value="NORMAL"
                                  id={`${row.date}-shift-normal`}
                                />
                                <FieldLabel
                                  htmlFor={`${row.date}-shift-normal`}
                                >
                                  {formatShiftTypeForWorkplace(
                                    "NORMAL",
                                    selectedWorkplace?.type,
                                  )}
                                </FieldLabel>
                              </div>
                            )}
                          </RadioGroup>
                          <FormErrorMessage message={rowErrors.shiftType} />
                        </FieldContent>
                      </Field>

                      {row.shiftType === "LESSON" ? null : (
                        <Field>
                          <FieldLabel htmlFor={`${row.date}-break`}>
                            休憩時間（分）
                          </FieldLabel>
                          <FieldContent>
                            <div className="flex items-center gap-2">
                              <Input
                                id={`${row.date}-break`}
                                type="number"
                                min={0}
                                max={MAX_BREAK_MINUTES}
                                className="max-w-16"
                                value={row.breakMinutes}
                                onChange={(event) => {
                                  const breakMinutes =
                                    event.currentTarget.value;
                                  updateRow(row.date, {
                                    breakMinutes,
                                  });
                                }}
                              />
                              <span className="shrink-0 text-sm text-muted-foreground">
                                分
                              </span>
                            </div>
                            <FormErrorMessage
                              message={rowErrors.breakMinutes}
                            />
                          </FieldContent>
                        </Field>
                      )}
                    </FieldGroup>

                    {row.shiftType === "LESSON" ? (
                      <FieldGroup className="mt-4 grid gap-4 md:grid-cols-3">
                        <Field>
                          <FieldLabel>時間割セット</FieldLabel>
                          <FieldContent>
                            <Select
                              value={row.timetableSetId}
                              onValueChange={(value) => {
                                if (value === null) {
                                  return;
                                }

                                const timetableSetId = value;
                                const periods =
                                  lessonPeriodsBySetId[timetableSetId] ?? [];
                                const fallback = periods[0]
                                  ? String(periods[0])
                                  : "";

                                updateRow(row.date, {
                                  timetableSetId,
                                  startPeriod: fallback,
                                  endPeriod: fallback,
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="時間割セットを選択">
                                  {timetableSetNameById[row.timetableSetId]}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {timetableSetOptions.map((set) => (
                                    <SelectItem
                                      key={`${row.date}-set-${set.id}`}
                                      value={set.id}
                                    >
                                      {set.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FormErrorMessage
                              message={rowErrors.timetableSetId}
                            />
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel>開始コマ</FieldLabel>
                          <FieldContent>
                            <Select
                              value={row.startPeriod}
                              onValueChange={(value) => {
                                if (value === null) {
                                  return;
                                }

                                updateRow(row.date, {
                                  startPeriod: value,
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="開始コマ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {lessonPeriods.map((period) => (
                                    <SelectItem
                                      key={`${row.date}-start-${period}`}
                                      value={String(period)}
                                    >
                                      {period}限
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FormErrorMessage message={rowErrors.startPeriod} />
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel>終了コマ</FieldLabel>
                          <FieldContent>
                            <Select
                              value={row.endPeriod}
                              onValueChange={(value) => {
                                if (value === null) {
                                  return;
                                }

                                updateRow(row.date, {
                                  endPeriod: value,
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="終了コマ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {lessonPeriods.map((period) => (
                                    <SelectItem
                                      key={`${row.date}-end-${period}`}
                                      value={String(period)}
                                    >
                                      {period}限
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FormErrorMessage message={rowErrors.endPeriod} />
                          </FieldContent>
                        </Field>
                      </FieldGroup>
                    ) : (
                      <FieldGroup className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor={`${row.date}-start-time`}>
                            開始時刻
                          </FieldLabel>
                          <FieldContent>
                            <Input
                              id={`${row.date}-start-time`}
                              type="time"
                              value={row.startTime}
                              onChange={(event) => {
                                const startTime = event.currentTarget.value;
                                updateRow(row.date, {
                                  startTime,
                                });
                              }}
                            />
                            <FormErrorMessage message={rowErrors.startTime} />
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`${row.date}-end-time`}>
                            終了時刻
                          </FieldLabel>
                          <FieldContent>
                            <Input
                              id={`${row.date}-end-time`}
                              type="time"
                              value={row.endTime}
                              onChange={(event) => {
                                const endTime = event.currentTarget.value;
                                updateRow(row.date, {
                                  endTime,
                                });
                              }}
                            />
                            <FormErrorMessage message={rowErrors.endTime} />
                          </FieldContent>
                        </Field>
                      </FieldGroup>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <Field>
          <FieldContent>
            <FormErrorMessage message={errors.form} />
          </FieldContent>
        </Field>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              router.push("/my");
            }}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={isSubmitting || isWorkplaceLoading}>
            {isSubmitting ? "登録中..." : "確定"}
          </Button>
        </div>
      </Form>
    </section>
  );
}

"use client";

import { useCallback, useMemo, useReducer, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import holidayJp from "@holiday-jp/holiday_jp";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { ShiftPayrollPreviewFloating } from "@/components/shifts/ShiftPayrollPreviewFloating";
import { useShiftPayrollPreview } from "@/components/shifts/use-shift-payroll-preview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
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
import { DATE_ONLY_REGEX, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import {
  addMonths,
  dateFromDateKey,
  formatMonthLabel,
  fromMonthInputValue,
  toMonthInputValue,
  toDateKey,
} from "@/lib/calendar/date";
import { formatShiftType } from "@/lib/enum-labels";
import {
  parseGoogleSyncStateFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";
import { fetchJson } from "@/lib/query/fetch-json";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { upsertMonthShiftsInCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { queryKeys } from "@/lib/query/query-keys";
import {
  formatShiftTimeRange,
  getShiftEndDate,
  isOvernightShift,
  isSameTimeShift,
} from "@/lib/shifts/time";
import {
  resolveUserFacingErrorFromResponse,
  toUserFacingMessage,
} from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { type MonthShift, normalizeMonthShift } from "@/hooks/use-month-shifts";
import { useResetOnRouteHidden } from "@/hooks/use-reset-on-route-hidden";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const BULK_CALENDAR_SELECTION_STORAGE_KEY = "shifta:bulk-calendar-selection";
const BULK_CALENDAR_SELECTION_SCHEMA_VERSION = 1;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DAY_CELL_COUNT = 42;
const MAX_BREAK_MINUTES = 240;
const GOOGLE_EVENT_LIST_LIMIT = 5;
const GOOGLE_EVENT_LIST_VISIBLE_WHEN_OVERFLOW = 3;
const GOOGLE_TOKEN_EXPIRED_DESCRIPTION =
  "3秒後にログアウトします。再度Googleアカウントでログインしてください。";
const selectedDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

type ShiftType = "NORMAL" | "LESSON";

type Workplace = {
  id: string;
  name: string;
  color: string;
  type: "GENERAL" | "CRAM_SCHOOL";
};

type WorkplacePayrollCycleDetail = {
  id: string;
  closingDayType: "DAY_OF_MONTH" | "END_OF_MONTH";
  closingDay: number | null;
  payday: number;
};

type PreviewPayrollRule = {
  workplaceId: string;
  startDate: string;
  endDate: string | null;
  baseHourlyWage: number | string;
  holidayAllowanceHourly: number | string;
  nightPremiumRate: number | string;
  overtimePremiumRate: number | string;
  dailyOvertimeThreshold: number | string;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
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

type GoogleCalendarEventsResponse = {
  month: string;
  calendars: GoogleCalendarOption[];
  selectedCalendarIds: string[];
  dates: GoogleCalendarDay[];
  cacheWarning: string | null;
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

function isClosingDayType(
  value: unknown,
): value is WorkplacePayrollCycleDetail["closingDayType"] {
  return value === "DAY_OF_MONTH" || value === "END_OF_MONTH";
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

function parseWorkplacePayrollCycleResponse(
  payload: unknown,
): WorkplacePayrollCycleDetail | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    !isClosingDayType(data.closingDayType) ||
    (typeof data.closingDay !== "number" && data.closingDay !== null) ||
    typeof data.payday !== "number"
  ) {
    return null;
  }

  return {
    id: data.id,
    closingDayType: data.closingDayType,
    closingDay: data.closingDay,
    payday: data.payday,
  };
}

function isPreviewPayrollRule(value: unknown): value is PreviewPayrollRule {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.workplaceId === "string" &&
    typeof value.startDate === "string" &&
    (typeof value.endDate === "string" || value.endDate === null) &&
    (typeof value.baseHourlyWage === "number" ||
      typeof value.baseHourlyWage === "string") &&
    (typeof value.holidayAllowanceHourly === "number" ||
      typeof value.holidayAllowanceHourly === "string") &&
    (typeof value.nightPremiumRate === "number" ||
      typeof value.nightPremiumRate === "string") &&
    (typeof value.overtimePremiumRate === "number" ||
      typeof value.overtimePremiumRate === "string") &&
    (typeof value.dailyOvertimeThreshold === "number" ||
      typeof value.dailyOvertimeThreshold === "string") &&
    (value.holidayType === "NONE" ||
      value.holidayType === "WEEKEND" ||
      value.holidayType === "HOLIDAY" ||
      value.holidayType === "WEEKEND_HOLIDAY")
  );
}

function parsePreviewPayrollRuleListResponse(
  payload: unknown,
): PreviewPayrollRule[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  if (payload.data.every(isPreviewPayrollRule) === false) {
    return null;
  }

  return payload.data;
}

function normalizeTimeOnly(value: string): string {
  if (TIME_ONLY_REGEX.test(value)) {
    return value.length >= 5 ? value.slice(0, 5) : value;
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return "";
  }

  const hours = String(asDate.getUTCHours()).padStart(2, "0");
  const minutes = String(asDate.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseGoogleCalendarEventsResponse(
  payload: unknown,
): GoogleCalendarEventsResponse | null {
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

  let cacheWarning: string | null = null;
  if (isRecord(payload.meta)) {
    if (payload.meta.cacheStatus === "stale") {
      cacheWarning =
        typeof payload.meta.warning === "string"
          ? payload.meta.warning
          : "Google予定は最新でない可能性があります。";
    }
  }

  return {
    month: data.month,
    calendars: data.calendars,
    selectedCalendarIds: data.selectedCalendarIds,
    dates: data.dates,
    cacheWarning,
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
  comment: string;
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
  | "comment"
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
  comment: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

type LessonShiftPayload = {
  date: string;
  shiftType: "LESSON";
  comment: string;
  breakMinutes: number;
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  };
};

type BulkShiftPayload = NormalShiftPayload | LessonShiftPayload;

type BulkShiftMutationResult = {
  monthShifts: MonthShift[];
  totalCount: number | null;
  failedCount: number | null;
};

type OvernightSummaryItem = {
  date: string;
  startTime: string;
  endTime: string;
  startDateLabel: string;
  endDateLabel: string;
};

const DEFAULT_BULK_VALUES: BulkDefaults = {
  shiftType: "NORMAL",
  comment: "",
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
    comment: defaults.comment,
    startTime: defaults.startTime,
    endTime: defaults.endTime,
    breakMinutes: defaults.breakMinutes,
    timetableSetId: defaults.timetableSetId,
    startPeriod: defaults.startPeriod,
    endPeriod: defaults.endPeriod,
  };
}

function parseBulkShiftMutationResult(
  payload: unknown,
): BulkShiftMutationResult {
  if (!isRecord(payload)) {
    return {
      monthShifts: [],
      totalCount: null,
      failedCount: null,
    };
  }

  const monthShifts = Array.isArray(payload.data)
    ? payload.data
        .map((shift) => normalizeMonthShift(shift))
        .filter((shift): shift is MonthShift => shift !== null)
    : [];
  const summary = isRecord(payload.summary) ? payload.summary : null;

  return {
    monthShifts,
    totalCount: typeof summary?.total === "number" ? summary.total : null,
    failedCount: typeof summary?.failed === "number" ? summary.failed : null,
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

  return selectedDateFormatter.format(date);
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

function formatEventNamePreview(
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

type CalendarSelectionMode = "default" | "custom";

type BulkShiftFormState = {
  requestedMonth: Date;
  selectedWorkplaceId: string;
  selectedDateKeys: string[];
  rowsByDate: Record<string, BulkShiftRow>;
  defaults: BulkDefaults;
  hasInteractedWithDefaults: boolean;
  calendarSelectionMode: CalendarSelectionMode;
  selectedCalendarIds: string[];
  errors: FormErrors;
  isSubmitting: boolean;
  isOvernightConfirmOpen: boolean;
  overnightSummaries: OvernightSummaryItem[];
};

type BulkShiftFormProps = {
  initialMonthInputValue: string;
  todayDateKey: string;
};

type BulkShiftFormAction =
  | {
      type: "reset";
      state: BulkShiftFormState;
    }
  | {
      type: "setRequestedMonth";
      requestedMonth: Date;
    }
  | {
      type: "selectWorkplace";
      selectedWorkplaceId: string;
      defaults: BulkDefaults;
      hasInteractedWithDefaults: boolean;
    }
  | {
      type: "updateDefaults";
      defaults: BulkDefaults;
      hasInteractedWithDefaults: boolean;
    }
  | {
      type: "toggleDateSelection";
      dateKey: string;
      row: BulkShiftRow;
    }
  | {
      type: "clearSelectedDates";
    }
  | {
      type: "removeRow";
      dateKey: string;
    }
  | {
      type: "setRow";
      dateKey: string;
      row: BulkShiftRow;
    }
  | {
      type: "replaceRowsByDate";
      rowsByDate: Record<string, BulkShiftRow>;
    }
  | {
      type: "setErrors";
      errors: FormErrors;
    }
  | {
      type: "clearFormError";
    }
  | {
      type: "setSubmitting";
      isSubmitting: boolean;
    }
  | {
      type: "openOvernightConfirm";
      overnightSummaries: OvernightSummaryItem[];
    }
  | {
      type: "closeOvernightConfirm";
    }
  | {
      type: "setCalendarSelectionCustom";
      selectedCalendarIds: string[];
    }
  | {
      type: "resetCalendarSelectionDefault";
    };

function readLastWorkplaceId(): string {
  try {
    return localStorage.getItem(LAST_WORKPLACE_ID_KEY) ?? "";
  } catch {
    return "";
  }
}

function writePersistedBulkCalendarSelection(
  selectedCalendarIds: string[],
): void {
  const payload: PersistedBulkCalendarSelection = {
    version: BULK_CALENDAR_SELECTION_SCHEMA_VERSION,
    hasUserSelection: true,
    selectedCalendarIds,
  };

  localStorage.setItem(
    BULK_CALENDAR_SELECTION_STORAGE_KEY,
    JSON.stringify(payload),
  );
}

function clearPersistedBulkCalendarSelection(): void {
  localStorage.removeItem(BULK_CALENDAR_SELECTION_STORAGE_KEY);
}

function createInitialBulkShiftFormState(
  initialRequestedMonth: Date,
): BulkShiftFormState {
  const persistedSelection = readPersistedBulkCalendarSelection();

  return {
    requestedMonth: initialRequestedMonth,
    selectedWorkplaceId: readLastWorkplaceId(),
    selectedDateKeys: [],
    rowsByDate: {},
    defaults: DEFAULT_BULK_VALUES,
    hasInteractedWithDefaults: false,
    calendarSelectionMode:
      persistedSelection?.hasUserSelection &&
      persistedSelection.selectedCalendarIds.length > 0
        ? "custom"
        : "default",
    selectedCalendarIds: persistedSelection?.selectedCalendarIds ?? [],
    errors: {},
    isSubmitting: false,
    isOvernightConfirmOpen: false,
    overnightSummaries: [],
  };
}

function clearRowError(
  rows: Record<string, RowErrors> | undefined,
  dateKey: string,
): Record<string, RowErrors> | undefined {
  if (!rows?.[dateKey]) {
    return rows;
  }

  const nextRows = { ...rows };
  delete nextRows[dateKey];
  return Object.keys(nextRows).length > 0 ? nextRows : undefined;
}

function bulkShiftFormReducer(
  state: BulkShiftFormState,
  action: BulkShiftFormAction,
): BulkShiftFormState {
  switch (action.type) {
    case "reset":
      return action.state;
    case "setRequestedMonth":
      return {
        ...state,
        requestedMonth: action.requestedMonth,
      };
    case "selectWorkplace":
      return {
        ...state,
        selectedWorkplaceId: action.selectedWorkplaceId,
        defaults: action.defaults,
        hasInteractedWithDefaults: action.hasInteractedWithDefaults,
        errors: {
          ...state.errors,
          workplaceId: undefined,
          form: undefined,
        },
      };
    case "updateDefaults":
      return {
        ...state,
        defaults: action.defaults,
        hasInteractedWithDefaults: action.hasInteractedWithDefaults,
      };
    case "toggleDateSelection":
      if (state.selectedDateKeys.includes(action.dateKey)) {
        const nextRowsByDate = { ...state.rowsByDate };
        delete nextRowsByDate[action.dateKey];

        return {
          ...state,
          selectedDateKeys: state.selectedDateKeys.filter(
            (dateKey) => dateKey !== action.dateKey,
          ),
          rowsByDate: nextRowsByDate,
          errors: {
            ...state.errors,
            selectedDates: undefined,
            rows: clearRowError(state.errors.rows, action.dateKey),
          },
        };
      }

      return {
        ...state,
        selectedDateKeys: sortDateKeys([
          ...state.selectedDateKeys,
          action.dateKey,
        ]),
        rowsByDate: {
          ...state.rowsByDate,
          [action.dateKey]: action.row,
        },
        errors: {
          ...state.errors,
          selectedDates: undefined,
        },
      };
    case "clearSelectedDates":
      return {
        ...state,
        selectedDateKeys: [],
        rowsByDate: {},
        errors: {
          ...state.errors,
          selectedDates: undefined,
          rows: undefined,
        },
      };
    case "removeRow": {
      const nextRowsByDate = { ...state.rowsByDate };
      delete nextRowsByDate[action.dateKey];

      return {
        ...state,
        selectedDateKeys: state.selectedDateKeys.filter(
          (dateKey) => dateKey !== action.dateKey,
        ),
        rowsByDate: nextRowsByDate,
        errors: {
          ...state.errors,
          rows: clearRowError(state.errors.rows, action.dateKey),
        },
      };
    }
    case "setRow":
      return {
        ...state,
        rowsByDate: {
          ...state.rowsByDate,
          [action.dateKey]: action.row,
        },
        errors: {
          ...state.errors,
          rows:
            state.errors.rows && state.errors.rows[action.dateKey]
              ? {
                  ...state.errors.rows,
                  [action.dateKey]: {},
                }
              : state.errors.rows,
        },
      };
    case "replaceRowsByDate":
      return {
        ...state,
        rowsByDate: action.rowsByDate,
      };
    case "setErrors":
      return {
        ...state,
        errors: action.errors,
      };
    case "clearFormError":
      return state.errors.form
        ? {
            ...state,
            errors: {
              ...state.errors,
              form: undefined,
            },
          }
        : state;
    case "setSubmitting":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
    case "openOvernightConfirm":
      return {
        ...state,
        isOvernightConfirmOpen: true,
        overnightSummaries: action.overnightSummaries,
      };
    case "closeOvernightConfirm":
      return {
        ...state,
        isOvernightConfirmOpen: false,
        overnightSummaries: [],
      };
    case "setCalendarSelectionCustom":
      return {
        ...state,
        calendarSelectionMode: "custom",
        selectedCalendarIds: action.selectedCalendarIds,
      };
    case "resetCalendarSelectionDefault":
      return {
        ...state,
        calendarSelectionMode: "default",
        selectedCalendarIds: [],
      };
  }
}

function normalizeLessonDefaults(
  defaults: BulkDefaults,
  lessonPeriodsBySetId: Record<string, number[]>,
  firstTimetableSetId: string,
): BulkDefaults {
  if (defaults.shiftType !== "LESSON") {
    return defaults;
  }

  const nextSetId =
    defaults.timetableSetId && lessonPeriodsBySetId[defaults.timetableSetId]
      ? defaults.timetableSetId
      : firstTimetableSetId;
  const periods = lessonPeriodsBySetId[nextSetId] ?? [];
  if (periods.length === 0) {
    return {
      ...defaults,
      timetableSetId: nextSetId,
      startPeriod: "",
      endPeriod: "",
    };
  }

  const fallbackPeriod = String(periods[0]);
  return {
    ...defaults,
    timetableSetId: nextSetId,
    startPeriod: defaults.startPeriod || fallbackPeriod,
    endPeriod: defaults.endPeriod || fallbackPeriod,
  };
}

function normalizeLessonRow(
  row: BulkShiftRow,
  lessonPeriodsBySetId: Record<string, number[]>,
  firstTimetableSetId: string,
): BulkShiftRow {
  if (row.shiftType !== "LESSON") {
    return row;
  }

  const nextSetId =
    row.timetableSetId && lessonPeriodsBySetId[row.timetableSetId]
      ? row.timetableSetId
      : firstTimetableSetId;
  const periods = lessonPeriodsBySetId[nextSetId] ?? [];
  const fallbackPeriod = periods[0] ? String(periods[0]) : "";

  return {
    ...row,
    timetableSetId: nextSetId,
    startPeriod: row.startPeriod || fallbackPeriod,
    endPeriod: row.endPeriod || fallbackPeriod,
  };
}

function normalizeDefaultsForContext(params: {
  defaults: BulkDefaults;
  workplaceType: Workplace["type"] | undefined;
  lessonPeriodsBySetId: Record<string, number[]>;
  firstTimetableSetId: string;
  hasInteractedWithDefaults: boolean;
}): BulkDefaults {
  const {
    defaults,
    workplaceType,
    lessonPeriodsBySetId,
    firstTimetableSetId,
    hasInteractedWithDefaults,
  } = params;

  let nextDefaults = normalizeDefaultsForWorkplace(defaults, workplaceType);
  if (
    workplaceType === "CRAM_SCHOOL" &&
    !hasInteractedWithDefaults &&
    nextDefaults.shiftType === "NORMAL"
  ) {
    nextDefaults = {
      ...nextDefaults,
      shiftType: "LESSON",
    };
  }

  if (workplaceType !== "CRAM_SCHOOL") {
    return nextDefaults;
  }

  return normalizeLessonDefaults(
    nextDefaults,
    lessonPeriodsBySetId,
    firstTimetableSetId,
  );
}

function normalizeRowsForContext(params: {
  rowsByDate: Record<string, BulkShiftRow>;
  workplaceType: Workplace["type"] | undefined;
  lessonPeriodsBySetId: Record<string, number[]>;
  firstTimetableSetId: string;
}): Record<string, BulkShiftRow> {
  const {
    rowsByDate,
    workplaceType,
    lessonPeriodsBySetId,
    firstTimetableSetId,
  } = params;

  const nextRowsByDate: Record<string, BulkShiftRow> = {};
  for (const [dateKey, row] of Object.entries(rowsByDate)) {
    let nextRow = normalizeRowForWorkplace(row, workplaceType);
    if (workplaceType === "CRAM_SCHOOL") {
      nextRow = normalizeLessonRow(
        nextRow,
        lessonPeriodsBySetId,
        firstTimetableSetId,
      );
    }
    nextRowsByDate[dateKey] = nextRow;
  }

  return nextRowsByDate;
}

function resolveSelectedWorkplaceId(
  selectedWorkplaceId: string,
  workplaces: Workplace[],
): string {
  if (selectedWorkplaceId) {
    const hasCurrentWorkplace = workplaces.some(
      (workplace) => workplace.id === selectedWorkplaceId,
    );
    if (hasCurrentWorkplace) {
      return selectedWorkplaceId;
    }
  }

  return workplaces[0]?.id ?? "";
}

function buildGoogleEventsByDate(
  data: GoogleCalendarEventsResponse | undefined,
): Record<string, GoogleCalendarDay> {
  const eventsByDate: Record<string, GoogleCalendarDay> = {};

  for (const day of data?.dates ?? []) {
    eventsByDate[day.date] = day;
  }

  return eventsByDate;
}

function getEffectiveSelectedCalendarIds(params: {
  calendarSelectionMode: CalendarSelectionMode;
  selectedCalendarIds: string[];
  calendarOptions: GoogleCalendarOption[];
  defaultSelectedCalendarIds: string[];
}): string[] {
  const {
    calendarSelectionMode,
    selectedCalendarIds,
    calendarOptions,
    defaultSelectedCalendarIds,
  } = params;

  if (calendarSelectionMode === "default") {
    return defaultSelectedCalendarIds;
  }

  const availableCalendarIds = new Set(calendarOptions.map((item) => item.id));
  const filteredSelectedCalendarIds = selectedCalendarIds.filter((calendarId) =>
    availableCalendarIds.has(calendarId),
  );

  return filteredSelectedCalendarIds.length > 0
    ? filteredSelectedCalendarIds
    : defaultSelectedCalendarIds;
}

function sortCalendarIdsByOptionOrder(
  calendarOptions: GoogleCalendarOption[],
  selectedCalendarIds: Set<string>,
): string[] {
  return calendarOptions
    .map((calendarOption) => calendarOption.id)
    .filter((calendarId) => selectedCalendarIds.has(calendarId));
}

function getLessonSelectionValues(
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

type BulkShiftFormController = ReturnType<typeof useBulkShiftFormController>;

function useBulkShiftFormController({
  initialMonthInputValue,
  todayDateKey,
}: BulkShiftFormProps) {
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const pendingPayloadRef = useRef<BulkShiftPayload[] | null>(null);
  const initialRequestedMonth = fromMonthInputValue(initialMonthInputValue);
  if (!initialRequestedMonth) {
    throw new Error(`Invalid initial month: ${initialMonthInputValue}`);
  }
  const [state, dispatch] = useReducer(
    bulkShiftFormReducer,
    initialRequestedMonth,
    createInitialBulkShiftFormState,
  );
  const { isSignOutScheduled, scheduleSignOut } =
    useGoogleTokenExpiredSignOut();

  const resetFormState = useCallback(() => {
    pendingPayloadRef.current = null;
    dispatch({
      type: "reset",
      state: createInitialBulkShiftFormState(initialRequestedMonth),
    });
  }, [initialRequestedMonth]);

  const { markForResetOnRouteHidden } = useResetOnRouteHidden(resetFormState);
  const loadQueryUserId = "self";
  const todayKey = todayDateKey;

  const {
    data: workplacesData,
    error: workplacesError,
    isPending: isWorkplacePending,
  } = useQuery({
    queryKey: queryKeys.workplaces.list({
      userId: loadQueryUserId,
      includeCounts: false,
    }),
    queryFn: ({ signal }) =>
      fetchJson("/api/workplaces?includeCounts=false", {
        init: { signal },
        fallbackMessage: "勤務先一覧の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseWorkplaceListResponse(payload);
          if (!parsed) {
            throw new Error("WORKPLACE_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const workplaces = useMemo(() => workplacesData ?? [], [workplacesData]);
  const isWorkplaceLoading = isWorkplacePending;
  const selectedWorkplaceId = useMemo(
    () => resolveSelectedWorkplaceId(state.selectedWorkplaceId, workplaces),
    [state.selectedWorkplaceId, workplaces],
  );
  const selectedWorkplace = useMemo(
    () => workplaces.find((workplace) => workplace.id === selectedWorkplaceId),
    [selectedWorkplaceId, workplaces],
  );

  const { data: workplacePayrollCycleData } = useQuery({
    queryKey: queryKeys.workplaces.editDetail({
      workplaceId: selectedWorkplaceId,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${selectedWorkplaceId}`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "勤務先情報の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseWorkplacePayrollCycleResponse(payload);
          if (!parsed) {
            throw new Error("WORKPLACE_PAYROLL_CYCLE_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled: Boolean(selectedWorkplaceId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: previewPayrollRulesData } = useQuery({
    queryKey: queryKeys.workplaces.payrollRules({
      workplaceId: selectedWorkplaceId,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${selectedWorkplaceId}/payroll-rules`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "給与ルール一覧の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parsePreviewPayrollRuleListResponse(payload);
          if (!parsed) {
            throw new Error("PREVIEW_PAYROLL_RULES_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled: Boolean(selectedWorkplaceId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: timetableSetsData,
    error: timetableSetsError,
    isPending: isTimetableSetsPending,
  } = useQuery({
    queryKey: queryKeys.workplaces.timetables({
      workplaceId: selectedWorkplaceId,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${selectedWorkplaceId}/timetables`, {
        init: { signal },
        fallbackMessage: "時間割の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseTimetableSetListResponse(payload);
          if (!parsed) {
            throw new Error("TIMETABLE_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled: selectedWorkplace?.type === "CRAM_SCHOOL",
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const timetableSets = useMemo(() => {
    if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
      return [] as TimetableSet[];
    }

    return (timetableSetsData ?? []).toSorted((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
  }, [selectedWorkplace?.type, timetableSetsData]);
  const isTimetableLoading =
    selectedWorkplace?.type === "CRAM_SCHOOL" && isTimetableSetsPending;
  const firstTimetableSetId = timetableSets[0]?.id ?? "";
  const lessonPeriodsBySetId = useMemo(() => {
    const periodsBySetId: Record<string, number[]> = {};

    for (const timetableSet of timetableSets) {
      periodsBySetId[timetableSet.id] = timetableSet.items
        .map((item) => item.period)
        .sort((left, right) => left - right);
    }

    return periodsBySetId;
  }, [timetableSets]);
  const timetableSetOptions = useMemo(
    () =>
      timetableSets.map((timetableSet) => ({
        id: timetableSet.id,
        name: timetableSet.name,
      })),
    [timetableSets],
  );
  const timetableSetNameById = useMemo(
    () =>
      Object.fromEntries(
        timetableSets.map((timetableSet) => [
          timetableSet.id,
          timetableSet.name,
        ]),
      ),
    [timetableSets],
  );

  const defaults = useMemo(
    () =>
      normalizeDefaultsForContext({
        defaults: state.defaults,
        workplaceType: selectedWorkplace?.type,
        lessonPeriodsBySetId,
        firstTimetableSetId,
        hasInteractedWithDefaults: state.hasInteractedWithDefaults,
      }),
    [
      firstTimetableSetId,
      lessonPeriodsBySetId,
      selectedWorkplace?.type,
      state.defaults,
      state.hasInteractedWithDefaults,
    ],
  );
  const rowsByDate = useMemo(
    () =>
      normalizeRowsForContext({
        rowsByDate: state.rowsByDate,
        workplaceType: selectedWorkplace?.type,
        lessonPeriodsBySetId,
        firstTimetableSetId,
      }),
    [
      firstTimetableSetId,
      lessonPeriodsBySetId,
      selectedWorkplace?.type,
      state.rowsByDate,
    ],
  );

  const requestedMonthInputValue = toMonthInputValue(state.requestedMonth);
  const {
    data: googleCalendarEventsData,
    error: googleCalendarEventsQueryError,
    isPending: isGoogleCalendarEventsPending,
    isFetching: isGoogleCalendarEventsFetching,
  } = useQuery({
    queryKey: [
      "bulk-google-calendar-events",
      requestedMonthInputValue,
      state.calendarSelectionMode,
      state.calendarSelectionMode === "custom"
        ? state.selectedCalendarIds.join(",")
        : "default",
    ],
    queryFn: async ({ signal }) => {
      const searchParams = new URLSearchParams({
        month: requestedMonthInputValue,
      });

      if (state.calendarSelectionMode === "custom") {
        for (const calendarId of state.selectedCalendarIds) {
          searchParams.append("calendarId", calendarId);
        }
      }

      const response = await fetch(
        `/api/calendar/events?${searchParams.toString()}`,
        { signal },
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

      return payload;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const calendarOptions = googleCalendarEventsData?.calendars ?? [];
  const selectedCalendarIds = getEffectiveSelectedCalendarIds({
    calendarSelectionMode: state.calendarSelectionMode,
    selectedCalendarIds: state.selectedCalendarIds,
    calendarOptions,
    defaultSelectedCalendarIds:
      googleCalendarEventsData?.selectedCalendarIds ?? [],
  });
  const googleEventsByDate = useMemo(
    () => buildGoogleEventsByDate(googleCalendarEventsData),
    [googleCalendarEventsData],
  );
  const displayMonth = useMemo(() => {
    const parsedMonth = googleCalendarEventsData
      ? fromMonthInputValue(googleCalendarEventsData.month)
      : null;
    return parsedMonth ?? state.requestedMonth;
  }, [googleCalendarEventsData, state.requestedMonth]);
  const calendarCells = useMemo(
    () => toMonthGrid(displayMonth),
    [displayMonth],
  );
  const isInitialGoogleCalendarLoading =
    isGoogleCalendarEventsPending && !googleCalendarEventsData;
  const isRefreshingGoogleEvents =
    isGoogleCalendarEventsFetching && Boolean(googleCalendarEventsData);
  const googleEventsError = googleCalendarEventsQueryError
    ? toErrorMessage(
        googleCalendarEventsQueryError,
        "Google予定の取得に失敗しました。",
      )
    : null;
  const googleEventsWarning = googleCalendarEventsData?.cacheWarning ?? null;

  const selectedRows = useMemo(
    () =>
      state.selectedDateKeys
        .map((dateKey) => rowsByDate[dateKey])
        .filter((row): row is BulkShiftRow => Boolean(row)),
    [rowsByDate, state.selectedDateKeys],
  );

  const previewWorkplaces = useMemo(() => {
    if (!workplacePayrollCycleData) {
      return [];
    }

    return [
      {
        id: workplacePayrollCycleData.id,
        closingDayType: workplacePayrollCycleData.closingDayType,
        closingDay: workplacePayrollCycleData.closingDay,
        payday: workplacePayrollCycleData.payday,
      },
    ];
  }, [workplacePayrollCycleData]);
  const previewTimetableSets = useMemo(
    () =>
      timetableSets.map((timetableSet) => ({
        id: timetableSet.id,
        workplaceId: timetableSet.workplaceId,
        items: timetableSet.items.map((item) => ({
          timetableSetId: item.timetableSetId,
          period: item.period,
          startTime: normalizeTimeOnly(item.startTime),
          endTime: normalizeTimeOnly(item.endTime),
        })),
      })),
    [timetableSets],
  );
  const previewInputShifts = useMemo(() => {
    if (!selectedWorkplaceId || previewWorkplaces.length === 0) {
      return [];
    }

    return selectedRows.map((row) => ({
      temporaryId: row.date,
      workplaceId: selectedWorkplaceId,
      date: row.date,
      shiftType: row.shiftType,
      startTime: row.startTime,
      endTime: row.endTime,
      breakMinutes: Number(row.breakMinutes) || 0,
      lessonRange:
        row.shiftType === "LESSON"
          ? {
              timetableSetId: row.timetableSetId,
              startPeriod: Number(row.startPeriod),
              endPeriod: Number(row.endPeriod),
            }
          : undefined,
    }));
  }, [previewWorkplaces.length, selectedRows, selectedWorkplaceId]);
  const shiftPayrollPreview = useShiftPayrollPreview({
    userId: loadQueryUserId,
    shifts: previewInputShifts,
    workplaces: previewWorkplaces,
    payrollRules: previewPayrollRulesData ?? [],
    timetableSets: previewTimetableSets,
  });

  const updateDefaults = (
    nextDefaults: BulkDefaults,
    hasInteractedWithDefaults: boolean,
  ) => {
    dispatch({
      type: "updateDefaults",
      defaults: nextDefaults,
      hasInteractedWithDefaults,
    });
  };

  const handleWorkplaceChange = (nextWorkplaceId: string) => {
    const nextWorkplace = workplaces.find(
      (workplace) => workplace.id === nextWorkplaceId,
    );
    const nextDefaults =
      nextWorkplace?.type === "CRAM_SCHOOL"
        ? {
            ...defaults,
            shiftType: "LESSON" as const,
            timetableSetId: "",
            startPeriod: "",
            endPeriod: "",
          }
        : normalizeDefaultsForWorkplace(defaults, nextWorkplace?.type);

    localStorage.setItem(LAST_WORKPLACE_ID_KEY, nextWorkplaceId);
    dispatch({
      type: "selectWorkplace",
      selectedWorkplaceId: nextWorkplaceId,
      defaults: nextDefaults,
      hasInteractedWithDefaults: false,
    });
  };

  const handleRequestedMonthChange = (offset: number) => {
    dispatch({
      type: "setRequestedMonth",
      requestedMonth: addMonths(state.requestedMonth, offset),
    });
  };

  const handleToggleCalendarSelection = (
    calendarId: string,
    checked: boolean,
  ) => {
    const currentSet = new Set(selectedCalendarIds);

    if (checked) {
      currentSet.add(calendarId);
    } else {
      currentSet.delete(calendarId);
    }

    if (currentSet.size === 0) {
      return;
    }

    const nextSelectedCalendarIds = sortCalendarIdsByOptionOrder(
      calendarOptions,
      currentSet,
    );

    writePersistedBulkCalendarSelection(nextSelectedCalendarIds);
    dispatch({
      type: "setCalendarSelectionCustom",
      selectedCalendarIds: nextSelectedCalendarIds,
    });
  };

  const handleResetCalendarSelectionToDefault = () => {
    clearPersistedBulkCalendarSelection();
    dispatch({
      type: "resetCalendarSelectionDefault",
    });
  };

  const handleToggleDateSelection = (dateKey: string) => {
    dispatch({
      type: "toggleDateSelection",
      dateKey,
      row: createRow(dateKey, defaults),
    });
  };

  const handleRemoveRow = (dateKey: string) => {
    dispatch({
      type: "removeRow",
      dateKey,
    });
  };

  const handleUpdateRow = (dateKey: string, patch: Partial<BulkShiftRow>) => {
    const currentRow = rowsByDate[dateKey];
    if (!currentRow) {
      return;
    }

    dispatch({
      type: "setRow",
      dateKey,
      row: {
        ...currentRow,
        ...patch,
      },
    });
  };

  const handleDefaultShiftTypeChange = (shiftType: ShiftType) => {
    if (shiftType === "LESSON" && selectedWorkplace?.type !== "CRAM_SCHOOL") {
      return;
    }

    const lessonSelectionValues = getLessonSelectionValues(
      defaults.timetableSetId,
      lessonPeriodsBySetId,
      firstTimetableSetId,
    );

    updateDefaults(
      {
        ...defaults,
        shiftType,
        ...(shiftType === "LESSON" ? lessonSelectionValues : {}),
      },
      true,
    );
  };

  const handleRowShiftTypeChange = (dateKey: string, shiftType: ShiftType) => {
    const row = rowsByDate[dateKey];
    if (!row) {
      return;
    }

    if (shiftType === "LESSON" && selectedWorkplace?.type !== "CRAM_SCHOOL") {
      return;
    }

    const lessonSelectionValues = getLessonSelectionValues(
      row.timetableSetId,
      lessonPeriodsBySetId,
      firstTimetableSetId,
    );

    handleUpdateRow(dateKey, {
      shiftType,
      ...(shiftType === "LESSON" ? lessonSelectionValues : {}),
    });
  };

  const handleApplyDefaultsToRows = () => {
    const nextRowsByDate = { ...rowsByDate };

    for (const dateKey of state.selectedDateKeys) {
      if (!nextRowsByDate[dateKey]) {
        continue;
      }

      nextRowsByDate[dateKey] = createRow(dateKey, defaults);
    }

    dispatch({
      type: "replaceRowsByDate",
      rowsByDate: nextRowsByDate,
    });
  };

  const handleResetDefaults = () => {
    updateDefaults(DEFAULT_BULK_VALUES, false);
  };

  const validateAndBuildPayload = ():
    | {
        success: true;
        payload: BulkShiftPayload[];
        overnightSummaries: OvernightSummaryItem[];
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

    if (state.selectedDateKeys.length === 0) {
      nextErrors.selectedDates = "1日以上選択してください。";
    }

    const payload: BulkShiftPayload[] = [];
    const overnightCandidates: OvernightSummaryItem[] = [];

    for (const dateKey of state.selectedDateKeys) {
      const row = rowsByDate[dateKey];
      const rowErrors: RowErrors = {};

      if (!row) {
        rowErrors.shiftType = "入力行の初期化に失敗しました。";
        nextErrors.rows![dateKey] = rowErrors;
        continue;
      }

      if (row.comment.length > 100) {
        rowErrors.comment = "コメントは100文字以内で入力してください。";
      }

      if (/[\r\n]/.test(row.comment)) {
        rowErrors.comment = "コメントに改行は使用できません。";
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
            comment: row.comment,
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
          isSameTimeShift(row.startTime, row.endTime)
        ) {
          rowErrors.endTime = "開始時刻と終了時刻は同じ時刻にできません。";
        }

        if (!hasRowErrors(rowErrors)) {
          if (isOvernightShift(row.startTime, row.endTime)) {
            overnightCandidates.push({
              date: dateKey,
              startTime: row.startTime,
              endTime: row.endTime,
              startDateLabel: formatSelectedDate(dateKey),
              endDateLabel: formatSelectedDate(
                getShiftEndDate(dateKey, row.startTime, row.endTime),
              ),
            });
          }

          payload.push({
            date: dateKey,
            shiftType: row.shiftType,
            comment: row.comment,
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
      overnightSummaries: overnightCandidates,
    };
  };

  const submitBulk = async (payloadItems: BulkShiftPayload[]) => {
    if (isSignOutScheduled) {
      return;
    }

    dispatch({
      type: "setSubmitting",
      isSubmitting: true,
    });
    dispatch({
      type: "setErrors",
      errors: {},
    });
    const loadingToastId = toast.loading("シフトを一括登録中です...");

    try {
      const response = await fetch("/api/shifts/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workplaceId: selectedWorkplaceId,
          shifts: payloadItems,
        }),
      });

      if (response.ok === false) {
        const apiError = await readGoogleSyncFailureFromErrorResponse(
          response,
          "シフト一括登録に失敗しました。",
        );

        if (apiError.requiresSignOut) {
          toast.error("Google 連携の有効期限が切れました", {
            id: loadingToastId,
            description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
            duration: 6000,
          });
          scheduleSignOut();
          return;
        }

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

      const responsePayload = (await response.json()) as unknown;
      const mutationResult = parseBulkShiftMutationResult(responsePayload);
      const createdCount = mutationResult.totalCount ?? payloadItems.length;
      const syncState = parseGoogleSyncStateFromPayload(
        responsePayload,
        messages.error.calendarSyncFailed,
      );
      const syncFailure = syncState.failure;

      if (mutationResult.monthShifts.length > 0) {
        upsertMonthShiftsInCachesOptimistically(
          queryClient,
          mutationResult.monthShifts,
        );
      }

      void invalidateAfterShiftMutation(queryClient, {
        mode: "background",
      });

      if (syncFailure) {
        if (syncFailure.requiresSignOut) {
          toast.error("Google 連携の有効期限が切れました", {
            id: loadingToastId,
            description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
            duration: 6000,
          });
          scheduleSignOut();
          return;
        }

        const failedCount = mutationResult.failedCount ?? 0;
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

        markForResetOnRouteHidden();
        if (syncFailure.requiresCalendarSetup) {
          router.push(CALENDAR_SETUP_PATH);
          return;
        }

        router.push("/my");
        return;
      }

      toast.success(messages.success.shiftsBulkCreated(createdCount), {
        id: loadingToastId,
        description: buildMutationSuccessDescription({
          syncPending: syncState.pending,
        }),
      });
      markForResetOnRouteHidden();
      router.push("/my");
    } catch (error) {
      console.error("failed to submit bulk shifts", error);
      const message = toErrorMessage(error, messages.error.bulkShiftSaveFailed);
      dispatch({
        type: "setErrors",
        errors: {
          form: message,
        },
      });
      toast.error(messages.error.bulkShiftSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      dispatch({
        type: "setSubmitting",
        isSubmitting: false,
      });
    }
  };

  const handleSubmit = async () => {
    if (isSignOutScheduled) {
      return;
    }

    const validated = validateAndBuildPayload();
    if (!validated.success) {
      dispatch({
        type: "setErrors",
        errors: validated.errors,
      });
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

    if (validated.overnightSummaries.length > 0) {
      pendingPayloadRef.current = validated.payload;
      dispatch({
        type: "openOvernightConfirm",
        overnightSummaries: validated.overnightSummaries,
      });
      return;
    }

    await submitBulk(validated.payload);
  };

  const handleOvernightConfirm = async () => {
    const pendingPayload = pendingPayloadRef.current;
    if (!pendingPayload) {
      return;
    }

    dispatch({
      type: "closeOvernightConfirm",
    });
    await submitBulk(pendingPayload);
    pendingPayloadRef.current = null;
  };

  const handleOvernightDialogOpenChange = (open: boolean) => {
    if (open) {
      return;
    }

    pendingPayloadRef.current = null;
    dispatch({
      type: "closeOvernightConfirm",
    });
  };

  const handleCancel = () => {
    markForResetOnRouteHidden();
    router.push("/my");
  };

  const formErrorMessage =
    state.errors.form ??
    (timetableSetsError
      ? toUserFacingMessage(
          timetableSetsError,
          "時間割の取得に失敗しました。時間を置いて再度お試しください。",
        )
      : workplacesError
        ? toUserFacingMessage(
            workplacesError,
            "勤務先一覧の取得に失敗しました。時間を置いて再度お試しください。",
          )
        : undefined);

  const previewEmptyMessage =
    selectedRows.length === 0
      ? "日付とシフト情報を入力すると支給額を確認できます"
      : (shiftPayrollPreview.items.find((item) => item.status !== "ready")
          ?.message ?? "日付とシフト情報を入力すると支給額を確認できます");

  return {
    todayKey,
    workplaces,
    isWorkplaceLoading,
    selectedWorkplace,
    selectedWorkplaceId,
    selectedDateKeys: state.selectedDateKeys,
    rowsByDate,
    defaults,
    errors: state.errors,
    isSubmitting: state.isSubmitting,
    isOvernightConfirmOpen: state.isOvernightConfirmOpen,
    overnightSummaries: state.overnightSummaries,
    isSignOutScheduled,
    calendarOptions,
    selectedCalendarIds,
    googleEventsByDate,
    googleEventsError,
    googleEventsWarning,
    calendarCells,
    displayMonth,
    isInitialGoogleCalendarLoading,
    isRefreshingGoogleEvents,
    isTimetableLoading,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    selectedRows,
    formErrorMessage,
    previewMonths: shiftPayrollPreview.months,
    previewUnresolvedCount: shiftPayrollPreview.unresolvedCount,
    previewBaselineErrorMessage: shiftPayrollPreview.baselineErrorMessage,
    previewEmptyMessage,
    handleWorkplaceChange,
    handleRequestedMonthChange,
    handleToggleCalendarSelection,
    handleResetCalendarSelectionToDefault,
    handleToggleDateSelection,
    handleClearSelectedDates: () =>
      dispatch({
        type: "clearSelectedDates",
      }),
    handleDefaultShiftTypeChange,
    handleUpdateDefaults: (patch: Partial<BulkDefaults>) =>
      updateDefaults(
        {
          ...defaults,
          ...patch,
        },
        true,
      ),
    handleApplyDefaultsToRows,
    handleResetDefaults,
    handleRemoveRow,
    handleRowShiftTypeChange,
    handleUpdateRow,
    handleSubmit,
    handleCancel,
    handleOvernightDialogOpenChange,
    handleOvernightConfirm,
  };
}

function BulkShiftHeader() {
  return (
    <header className="space-y-2">
      <h2 className="text-xl font-semibold">シフト一括登録</h2>
      <p className="text-sm text-muted-foreground">
        勤務先と日付を選び、複数日のシフトをまとめて登録します。
      </p>
    </header>
  );
}

function BulkShiftWorkplaceSection(
  props: Pick<
    BulkShiftFormController,
    | "isWorkplaceLoading"
    | "workplaces"
    | "selectedWorkplace"
    | "selectedWorkplaceId"
    | "errors"
    | "handleWorkplaceChange"
  >,
) {
  const {
    isWorkplaceLoading,
    workplaces,
    selectedWorkplace,
    selectedWorkplaceId,
    errors,
    handleWorkplaceChange,
  } = props;

  return (
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
                if (value !== null) {
                  handleWorkplaceChange(value);
                }
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
  );
}

function BulkShiftCalendarSection(
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

function BulkShiftDefaultsSection(
  props: Pick<
    BulkShiftFormController,
    | "defaults"
    | "selectedWorkplace"
    | "lessonPeriodsBySetId"
    | "timetableSetOptions"
    | "timetableSetNameById"
    | "handleDefaultShiftTypeChange"
    | "handleUpdateDefaults"
    | "handleApplyDefaultsToRows"
    | "handleResetDefaults"
  >,
) {
  const {
    defaults,
    selectedWorkplace,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    handleDefaultShiftTypeChange,
    handleUpdateDefaults,
    handleApplyDefaultsToRows,
    handleResetDefaults,
  } = props;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="text-base font-semibold">3. デフォルト値設定</h3>

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>デフォルトシフトタイプ</FieldLabel>
          <FieldContent>
            <RadioGroup
              value={defaults.shiftType}
              onValueChange={(value) =>
                handleDefaultShiftTypeChange(value as ShiftType)
              }
            >
              {selectedWorkplace?.type === "CRAM_SCHOOL" ? (
                <>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="LESSON" id="default-shift-lesson" />
                    <FieldLabel htmlFor="default-shift-lesson">
                      {formatShiftTypeForWorkplace(
                        "LESSON",
                        selectedWorkplace?.type,
                      )}
                    </FieldLabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="NORMAL" id="default-shift-normal" />
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
                  <RadioGroupItem value="NORMAL" id="default-shift-normal" />
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
            <FieldLabel htmlFor="default-break">デフォルト休憩時間</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="default-break"
                  type="number"
                  min={0}
                  max={MAX_BREAK_MINUTES}
                  value={defaults.breakMinutes}
                  onChange={(event) =>
                    handleUpdateDefaults({
                      breakMinutes: event.currentTarget.value,
                    })
                  }
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

      <Field>
        <FieldLabel htmlFor="default-comment">デフォルトコメント</FieldLabel>
        <FieldContent>
          <Input
            id="default-comment"
            value={defaults.comment}
            onChange={(event) =>
              handleUpdateDefaults({
                comment: event.currentTarget.value,
              })
            }
            maxLength={100}
            placeholder="例: 事務、授業補助、研修"
          />
          <FieldDescription>
            {formatEventNamePreview(selectedWorkplace?.name, defaults.comment)}
          </FieldDescription>
        </FieldContent>
      </Field>

      {defaults.shiftType === "LESSON" ? (
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel>デフォルト時間割セット</FieldLabel>
            <FieldContent>
              <Select
                value={defaults.timetableSetId}
                onValueChange={(value) => {
                  if (value !== null) {
                    const lessonSelectionValues = getLessonSelectionValues(
                      value,
                      lessonPeriodsBySetId,
                      value,
                    );
                    handleUpdateDefaults(lessonSelectionValues);
                  }
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
                  if (value !== null) {
                    handleUpdateDefaults({
                      startPeriod: value,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="開始コマ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(lessonPeriodsBySetId[defaults.timetableSetId] ?? []).map(
                      (period) => (
                        <SelectItem
                          key={`default-start-${period}`}
                          value={String(period)}
                        >
                          {period}限
                        </SelectItem>
                      ),
                    )}
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
                  if (value !== null) {
                    handleUpdateDefaults({
                      endPeriod: value,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="終了コマ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(lessonPeriodsBySetId[defaults.timetableSetId] ?? []).map(
                      (period) => (
                        <SelectItem
                          key={`default-end-${period}`}
                          value={String(period)}
                        >
                          {period}限
                        </SelectItem>
                      ),
                    )}
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
                onChange={(event) =>
                  handleUpdateDefaults({
                    startTime: event.currentTarget.value,
                  })
                }
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
                onChange={(event) =>
                  handleUpdateDefaults({
                    endTime: event.currentTarget.value,
                  })
                }
              />
            </FieldContent>
          </Field>
        </FieldGroup>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleApplyDefaultsToRows}
        >
          デフォルト値を適用
        </Button>
        <Button type="button" variant="ghost" onClick={handleResetDefaults}>
          リセット
        </Button>
      </div>

      {defaults.shiftType === "LESSON" &&
      selectedWorkplace?.type === "CRAM_SCHOOL" &&
      (lessonPeriodsBySetId[defaults.timetableSetId] ?? []).length === 0 ? (
        <FormErrorMessage message="塾の授業は時間割が登録されていません。" />
      ) : null}
    </section>
  );
}

type BulkShiftRowEditorHandlers = {
  handleRemoveRow: (dateKey: string) => void;
  handleRowShiftTypeChange: (dateKey: string, shiftType: ShiftType) => void;
  handleUpdateRow: (dateKey: string, patch: Partial<BulkShiftRow>) => void;
};

type BulkShiftRowEditorContext = {
  row: BulkShiftRow;
  rowErrors: RowErrors;
  selectedWorkplace: Workplace | undefined;
  lessonPeriodsBySetId: Record<string, number[]>;
  timetableSetOptions: Array<{ id: string; name: string }>;
  timetableSetNameById: Record<string, string>;
};

function BulkShiftRowHeader(props: {
  dateKey: string;
  onRemove: (dateKey: string) => void;
}) {
  const { dateKey, onRemove } = props;

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">{formatSelectedDate(dateKey)}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(dateKey)}
        aria-label={`${dateKey}の入力行を削除`}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

function BulkShiftGoogleEventsSummary(props: {
  dateKey: string;
  googleEventDay: GoogleCalendarDay | undefined;
}) {
  const { dateKey, googleEventDay } = props;
  const { visible: visibleGoogleEvents, hiddenCount: hiddenGoogleEventCount } =
    getVisibleGoogleEvents(googleEventDay);

  if (visibleGoogleEvents.length === 0 && hiddenGoogleEventCount === 0) {
    return null;
  }

  return (
    <div className="mt-2 rounded-md bg-muted/40 px-2 py-2">
      <p className="text-xs text-muted-foreground">Google予定</p>
      <ul className="mt-1 space-y-1">
        {visibleGoogleEvents.map((item, index) => (
          <li
            key={`${dateKey}:${item.calendarId}:${item.title}:${index}`}
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
        ))}
        {hiddenGoogleEventCount > 0 ? (
          <li className="text-xs font-medium text-muted-foreground">
            +{hiddenGoogleEventCount}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function BulkShiftRowTypeFields(
  props: BulkShiftRowEditorContext &
    Pick<
      BulkShiftRowEditorHandlers,
      "handleRowShiftTypeChange" | "handleUpdateRow"
    >,
) {
  const {
    row,
    rowErrors,
    selectedWorkplace,
    handleRowShiftTypeChange,
    handleUpdateRow,
  } = props;

  return (
    <FieldGroup className="mt-3 grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel>シフトタイプ</FieldLabel>
        <FieldContent>
          <RadioGroup
            value={row.shiftType}
            onValueChange={(value) =>
              handleRowShiftTypeChange(row.date, value as ShiftType)
            }
          >
            {selectedWorkplace?.type === "CRAM_SCHOOL" ? (
              <>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="LESSON"
                    id={`${row.date}-shift-lesson`}
                  />
                  <FieldLabel htmlFor={`${row.date}-shift-lesson`}>
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
                  <FieldLabel htmlFor={`${row.date}-shift-normal`}>
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
                <FieldLabel htmlFor={`${row.date}-shift-normal`}>
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
          <FieldLabel htmlFor={`${row.date}-break`}>休憩時間（分）</FieldLabel>
          <FieldContent>
            <div className="flex items-center gap-2">
              <Input
                id={`${row.date}-break`}
                type="number"
                min={0}
                max={MAX_BREAK_MINUTES}
                className="max-w-16"
                value={row.breakMinutes}
                onChange={(event) =>
                  handleUpdateRow(row.date, {
                    breakMinutes: event.currentTarget.value,
                  })
                }
              />
              <span className="shrink-0 text-sm text-muted-foreground">分</span>
            </div>
            <FormErrorMessage message={rowErrors.breakMinutes} />
          </FieldContent>
        </Field>
      )}
    </FieldGroup>
  );
}

function BulkShiftRowCommentField(
  props: Pick<
    BulkShiftRowEditorContext,
    "row" | "rowErrors" | "selectedWorkplace"
  > &
    Pick<BulkShiftRowEditorHandlers, "handleUpdateRow">,
) {
  const { row, rowErrors, selectedWorkplace, handleUpdateRow } = props;

  return (
    <Field className="mt-4" data-invalid={Boolean(rowErrors.comment)}>
      <FieldLabel htmlFor={`${row.date}-comment`}>コメント</FieldLabel>
      <FieldContent>
        <Input
          id={`${row.date}-comment`}
          value={row.comment}
          onChange={(event) =>
            handleUpdateRow(row.date, {
              comment: event.currentTarget.value,
            })
          }
          maxLength={100}
          placeholder="例: 事務、授業補助、研修"
        />
        <FieldDescription>
          {formatEventNamePreview(selectedWorkplace?.name, row.comment)}
        </FieldDescription>
        <FormErrorMessage message={rowErrors.comment} />
      </FieldContent>
    </Field>
  );
}

function BulkShiftRowLessonFields(
  props: Pick<
    BulkShiftRowEditorContext,
    | "row"
    | "rowErrors"
    | "lessonPeriodsBySetId"
    | "timetableSetOptions"
    | "timetableSetNameById"
  > &
    Pick<BulkShiftRowEditorHandlers, "handleUpdateRow">,
) {
  const {
    row,
    rowErrors,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    handleUpdateRow,
  } = props;
  const lessonPeriods = lessonPeriodsBySetId[row.timetableSetId] ?? [];

  return (
    <FieldGroup className="mt-4 grid gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel>時間割セット</FieldLabel>
        <FieldContent>
          <Select
            value={row.timetableSetId}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateRow(row.date, {
                  ...getLessonSelectionValues(
                    value,
                    lessonPeriodsBySetId,
                    value,
                  ),
                });
              }
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
                  <SelectItem key={`${row.date}-set-${set.id}`} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormErrorMessage message={rowErrors.timetableSetId} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>開始コマ</FieldLabel>
        <FieldContent>
          <Select
            value={row.startPeriod}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateRow(row.date, {
                  startPeriod: value,
                });
              }
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
              if (value !== null) {
                handleUpdateRow(row.date, {
                  endPeriod: value,
                });
              }
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
  );
}

function BulkShiftRowTimeFields(
  props: Pick<BulkShiftRowEditorContext, "row" | "rowErrors"> &
    Pick<BulkShiftRowEditorHandlers, "handleUpdateRow">,
) {
  const { row, rowErrors, handleUpdateRow } = props;

  return (
    <FieldGroup className="mt-4 grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${row.date}-start-time`}>開始時刻</FieldLabel>
        <FieldContent>
          <Input
            id={`${row.date}-start-time`}
            type="time"
            value={row.startTime}
            onChange={(event) =>
              handleUpdateRow(row.date, {
                startTime: event.currentTarget.value,
              })
            }
          />
          <FormErrorMessage message={rowErrors.startTime} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${row.date}-end-time`}>終了時刻</FieldLabel>
        <FieldContent>
          <Input
            id={`${row.date}-end-time`}
            type="time"
            value={row.endTime}
            onChange={(event) =>
              handleUpdateRow(row.date, {
                endTime: event.currentTarget.value,
              })
            }
          />
          <FormErrorMessage message={rowErrors.endTime} />
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}

function BulkShiftRowCard(
  props: BulkShiftRowEditorContext &
    BulkShiftRowEditorHandlers & {
      googleEventsByDate: Record<string, GoogleCalendarDay>;
    },
) {
  const {
    row,
    rowErrors,
    selectedWorkplace,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    googleEventsByDate,
    handleRemoveRow,
    handleRowShiftTypeChange,
    handleUpdateRow,
  } = props;

  const rowEditorContext = {
    row,
    rowErrors,
    selectedWorkplace,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
  } satisfies BulkShiftRowEditorContext;

  return (
    <section key={row.date} className="rounded-lg border p-3">
      <BulkShiftRowHeader dateKey={row.date} onRemove={handleRemoveRow} />
      <BulkShiftGoogleEventsSummary
        dateKey={row.date}
        googleEventDay={googleEventsByDate[row.date]}
      />
      <BulkShiftRowTypeFields
        {...rowEditorContext}
        handleRowShiftTypeChange={handleRowShiftTypeChange}
        handleUpdateRow={handleUpdateRow}
      />
      <BulkShiftRowCommentField
        {...rowEditorContext}
        handleUpdateRow={handleUpdateRow}
      />
      {row.shiftType === "LESSON" ? (
        <BulkShiftRowLessonFields
          {...rowEditorContext}
          handleUpdateRow={handleUpdateRow}
        />
      ) : (
        <BulkShiftRowTimeFields
          {...rowEditorContext}
          handleUpdateRow={handleUpdateRow}
        />
      )}
    </section>
  );
}

function BulkShiftRowsSection(
  props: Pick<
    BulkShiftFormController,
    | "isTimetableLoading"
    | "selectedRows"
    | "errors"
    | "selectedWorkplace"
    | "lessonPeriodsBySetId"
    | "timetableSetOptions"
    | "timetableSetNameById"
    | "googleEventsByDate"
    | "handleRemoveRow"
    | "handleRowShiftTypeChange"
    | "handleUpdateRow"
  >,
) {
  const {
    isTimetableLoading,
    selectedRows,
    errors,
    selectedWorkplace,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    googleEventsByDate,
    handleRemoveRow,
    handleRowShiftTypeChange,
    handleUpdateRow,
  } = props;

  return (
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
          {selectedRows.map((row) => (
            <BulkShiftRowCard
              key={row.date}
              row={row}
              rowErrors={errors.rows?.[row.date] ?? {}}
              selectedWorkplace={selectedWorkplace}
              lessonPeriodsBySetId={lessonPeriodsBySetId}
              timetableSetOptions={timetableSetOptions}
              timetableSetNameById={timetableSetNameById}
              googleEventsByDate={googleEventsByDate}
              handleRemoveRow={handleRemoveRow}
              handleRowShiftTypeChange={handleRowShiftTypeChange}
              handleUpdateRow={handleUpdateRow}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BulkShiftFormFooter(
  props: Pick<
    BulkShiftFormController,
    | "formErrorMessage"
    | "isSubmitting"
    | "isSignOutScheduled"
    | "isWorkplaceLoading"
    | "handleCancel"
  >,
) {
  const {
    formErrorMessage,
    isSubmitting,
    isSignOutScheduled,
    isWorkplaceLoading,
    handleCancel,
  } = props;

  return (
    <>
      <Field>
        <FieldContent>
          <FormErrorMessage message={formErrorMessage} />
        </FieldContent>
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={isSubmitting || isSignOutScheduled}
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isSignOutScheduled || isWorkplaceLoading}
        >
          {isSubmitting ? "登録中..." : "確定"}
        </Button>
      </div>
    </>
  );
}

function BulkShiftOvernightDialog(
  props: Pick<
    BulkShiftFormController,
    | "isOvernightConfirmOpen"
    | "overnightSummaries"
    | "isSubmitting"
    | "handleOvernightDialogOpenChange"
    | "handleOvernightConfirm"
  >,
) {
  const {
    isOvernightConfirmOpen,
    overnightSummaries,
    isSubmitting,
    handleOvernightDialogOpenChange,
    handleOvernightConfirm,
  } = props;

  return (
    <Dialog
      open={isOvernightConfirmOpen}
      onOpenChange={handleOvernightDialogOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>翌日終了として登録されるシフトがあります</DialogTitle>
          <DialogDescription>
            終了時刻が開始時刻より早いシフトは翌日終了として登録されます。内容を確認してください。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          <ul className="divide-y">
            {overnightSummaries.map((item) => (
              <li key={item.date} className="space-y-1 px-3 py-2 text-sm">
                <p className="font-medium">{formatSelectedDate(item.date)}</p>
                <p className="text-muted-foreground">
                  入力: {formatShiftTimeRange(item.startTime, item.endTime)}
                </p>
                <p className="text-muted-foreground">
                  解釈: {item.startDateLabel} {item.startTime} 〜{" "}
                  {item.endDateLabel} {item.endTime}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOvernightDialogOpenChange(false)}
            disabled={isSubmitting}
          >
            戻って修正
          </Button>
          <Button
            type="button"
            onClick={() => void handleOvernightConfirm()}
            disabled={isSubmitting}
          >
            まとめて翌日終了として登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkShiftFormScreen(props: BulkShiftFormProps) {
  const controller = useBulkShiftFormController(props);

  return (
    <section className="space-y-6 p-4 pb-32 md:p-6 md:pb-6">
      <BulkShiftHeader />

      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void controller.handleSubmit();
        }}
      >
        <BulkShiftWorkplaceSection {...controller} />
        <BulkShiftCalendarSection {...controller} />
        <BulkShiftDefaultsSection {...controller} />
        <BulkShiftRowsSection {...controller} />
        <BulkShiftFormFooter {...controller} />
      </Form>

      <ShiftPayrollPreviewFloating
        months={controller.previewMonths}
        unresolvedCount={controller.previewUnresolvedCount}
        emptyMessage={controller.previewEmptyMessage}
        baselineErrorMessage={controller.previewBaselineErrorMessage}
      />

      <BulkShiftOvernightDialog {...controller} />
    </section>
  );
}

export function BulkShiftForm(props: BulkShiftFormProps) {
  return <BulkShiftFormScreen {...props} />;
}

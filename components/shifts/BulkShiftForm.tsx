"use client";

import { useCallback, useMemo, useReducer, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BulkShiftFormScreen } from "@/components/shifts/bulk-shift-form/screen";
import {
  formatSelectedDate,
  getLessonSelectionValues,
  MAX_BREAK_MINUTES,
} from "@/components/shifts/bulk-shift-form/view-helpers";
import { useShiftPayrollPreview } from "@/components/shifts/use-shift-payroll-preview";
import { DATE_ONLY_REGEX, TIME_ONLY_REGEX } from "@/lib/api/date-time";
import {
  addMonths,
  fromMonthInputValue,
  toMonthInputValue,
  toDateKey,
} from "@/lib/calendar/date";
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
  getShiftEndDate,
  isOvernightShift,
  isSameTimeShift,
} from "@/lib/shifts/time";
import {
  resolveUserFacingErrorFromResponse,
  toUserFacingMessage,
} from "@/lib/user-facing-error";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { type MonthShift, normalizeMonthShift } from "@/hooks/use-month-shifts";
import { useResetOnRouteHidden } from "@/hooks/use-reset-on-route-hidden";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const BULK_CALENDAR_SELECTION_STORAGE_KEY = "shifta:bulk-calendar-selection";
const BULK_CALENDAR_SELECTION_SCHEMA_VERSION = 1;
const DAY_CELL_COUNT = 42;
const GOOGLE_TOKEN_EXPIRED_DESCRIPTION =
  "3秒後にログアウトします。再度Googleアカウントでログインしてください。";

export type ShiftType = "NORMAL" | "LESSON";

export type Workplace = {
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

export type GoogleCalendarEventItem = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string;
  calendarColor: string | null;
};

export type GoogleCalendarDay = {
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

export type BulkShiftRow = {
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

export type BulkDefaults = Omit<BulkShiftRow, "date">;

type RowErrorKey =
  | "shiftType"
  | "comment"
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "timetableSetId"
  | "startPeriod"
  | "endPeriod";

export type RowErrors = Partial<Record<RowErrorKey, string>>;

export type FormErrors = {
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

export type OvernightSummaryItem = {
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

export type BulkShiftFormProps = {
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

export type BulkShiftFormController = ReturnType<
  typeof useBulkShiftFormController
>;

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

export function BulkShiftForm(props: BulkShiftFormProps) {
  const controller = useBulkShiftFormController(props);
  return <BulkShiftFormScreen controller={controller} />;
}

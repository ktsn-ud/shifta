"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { ShiftPayrollPreviewFloating } from "@/components/shifts/ShiftPayrollPreviewFloating";
import { useShiftPayrollPreview } from "@/components/shifts/use-shift-payroll-preview";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { TimePicker } from "@/components/ui/time-picker";
import {
  dateKeyFromApiDate,
  fromMonthInputValue,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { formatShiftType } from "@/lib/enum-labels";
import {
  parseGoogleSyncStateFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { upsertMonthShiftInCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { fetchJson } from "@/lib/query/fetch-json";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  formatShiftTimeRange,
  isOvernightShift,
  isSameTimeShift,
  shiftDateKeyAddDays,
  toComparableShiftRange,
} from "@/lib/shifts/time";
import { toUserFacingMessage } from "@/lib/user-facing-error";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { type MonthShift, normalizeMonthShift } from "@/hooks/use-month-shifts";
import { useResetOnRouteHidden } from "@/hooks/use-reset-on-route-hidden";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const GOOGLE_TOKEN_EXPIRED_DESCRIPTION =
  "3秒後にログアウトします。再度Googleアカウントでログインしてください。";

type ShiftType = "NORMAL" | "LESSON";
type ShiftFormReturnTo = "dashboard" | "list";

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

type ShiftListItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
};

type ShiftDetail = {
  id: string;
  workplaceId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  shiftType: ShiftType;
  comment: string | null;
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

type FormState = {
  workplaceId: string;
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

type FormErrorKey =
  | "workplaceId"
  | "date"
  | "shiftType"
  | "comment"
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "timetableSetId"
  | "startPeriod"
  | "endPeriod"
  | "form";

type FormErrors = Partial<Record<FormErrorKey, string>>;

type ShiftTimePair = {
  startTime: string;
  endTime: string;
};

type CreateShiftFormProps = {
  mode: "create";
  initialDate: string;
  returnMonth?: string;
  returnTo?: ShiftFormReturnTo;
};

type EditShiftFormProps = {
  mode: "edit";
  shiftId: string;
  returnMonth?: string;
  returnTo?: ShiftFormReturnTo;
};

type ShiftFormProps = CreateShiftFormProps | EditShiftFormProps;

type ShiftFormControllerState = {
  formDraft: FormState | null;
  errors: FormErrors;
  warningMessage: string | null;
  isSubmitting: boolean;
  isOvernightDialogOpen: boolean;
};

type ShiftFormControllerAction =
  | {
      type: "reset";
      formDraft: FormState | null;
    }
  | {
      type: "setFormDraft";
      formDraft: FormState | null;
      clearErrorKeys?: FormErrorKey[];
      clearAllErrors?: boolean;
      resetWarning?: boolean;
    }
  | {
      type: "setErrors";
      errors: FormErrors;
    }
  | {
      type: "clearSubmissionMessages";
    }
  | {
      type: "setWarning";
      warningMessage: string | null;
    }
  | {
      type: "setSubmitting";
      isSubmitting: boolean;
    }
  | {
      type: "setOvernightDialogOpen";
      open: boolean;
    };

type ValidateShiftFormResult = {
  errors: FormErrors;
  candidateTimes: ShiftTimePair | null;
};

type ShiftMutationPayload = {
  workplaceId: string;
  date: string;
  shiftType: ShiftType;
  comment: string;
  startTime?: string;
  endTime?: string;
  breakMinutes: number;
  lessonRange?: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  };
};

type NormalizeShiftFormOptions = {
  mode: ShiftFormProps["mode"];
  hasEditSeed: boolean;
  workplaces: Workplace[];
  preferredWorkplaceId: string | null;
  timetableSets: TimetableSet[];
  isTimetableLoading: boolean;
};

type ShiftFormData = {
  workplaces: Workplace[];
  workplacesError: unknown;
  isWorkplaceLoading: boolean;
  shiftDetailData: ShiftDetail | null;
  shiftDetailError: unknown;
  isShiftLoading: boolean;
  resolvedInitialForm: FormState;
  initialShiftTimes: ShiftTimePair | null;
  selectedWorkplace: Workplace | undefined;
  selectedWorkplaceType: Workplace["type"] | undefined;
  workplacePayrollCycleData: WorkplacePayrollCycleDetail | null;
  previewPayrollRulesData: PreviewPayrollRule[];
  timetableSets: TimetableSet[];
  timetableSetsError: unknown;
  isTimetableLoading: boolean;
};

type ShiftFormEditorProps = {
  mode: ShiftFormProps["mode"];
  form: FormState;
  errors: FormErrors;
  workplaces: Workplace[];
  selectedWorkplace: Workplace | undefined;
  selectedWorkplaceType: Workplace["type"] | undefined;
  timetableSets: TimetableSet[];
  isTimetableLoading: boolean;
  selectedSet: TimetableSet | null;
  lessonPeriods: number[];
  selectedStartPeriodItem: TimetableSetItem | null;
  selectedEndPeriodItem: TimetableSetItem | null;
  eventNamePreview: string;
  disabled: boolean;
  isSubmitting: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onWorkplaceChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onShiftTypeChange: (value: ShiftType) => void;
  onTimetableSetChange: (value: string) => void;
  onStartPeriodChange: (value: string) => void;
  onEndPeriodChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onBreakMinutesChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
};

type ShiftFormControllerResult = {
  mode: ShiftFormProps["mode"];
  form: FormState;
  errors: FormErrors;
  warningMessage: string | null;
  workplaces: Workplace[];
  selectedWorkplace: Workplace | undefined;
  selectedWorkplaceType: Workplace["type"] | undefined;
  timetableSets: TimetableSet[];
  isTimetableLoading: boolean;
  selectedSet: TimetableSet | null;
  lessonPeriods: number[];
  selectedStartPeriodItem: TimetableSetItem | null;
  selectedEndPeriodItem: TimetableSetItem | null;
  eventNamePreview: string;
  disabled: boolean;
  isSubmitting: boolean;
  isShiftLoading: boolean;
  isWorkplaceLoading: boolean;
  formErrorMessage: string | null;
  previewMonths: ReturnType<typeof useShiftPayrollPreview>["months"];
  previewUnresolvedCount: number;
  previewEmptyMessage: string;
  previewBaselineErrorMessage: string | null;
  isOvernightDialogOpen: boolean;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleWorkplaceChange: (value: string) => void;
  handleDateChange: (value: string) => void;
  handleShiftTypeChange: (value: ShiftType) => void;
  handleTimetableSetChange: (value: string) => void;
  handleStartPeriodChange: (value: string) => void;
  handleEndPeriodChange: (value: string) => void;
  handleStartTimeChange: (value: string) => void;
  handleEndTimeChange: (value: string) => void;
  handleBreakMinutesChange: (value: string) => void;
  handleCommentChange: (value: string) => void;
  handleCancel: () => void;
  handleOvernightDialogOpenChange: (open: boolean) => void;
  handleOvernightConfirm: () => Promise<void>;
};

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

function isShiftType(value: unknown): value is ShiftType {
  return value === "NORMAL" || value === "LESSON";
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

function isShiftListItem(value: unknown): value is ShiftListItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string"
  );
}

function parseShiftListResponse(payload: unknown): ShiftListItem[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  if (payload.data.every(isShiftListItem) === false) {
    return null;
  }

  return payload.data;
}

function parseShiftDetailResponse(payload: unknown): ShiftDetail | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.workplaceId !== "string" ||
    typeof data.date !== "string" ||
    typeof data.startTime !== "string" ||
    typeof data.endTime !== "string" ||
    typeof data.breakMinutes !== "number" ||
    Number.isInteger(data.breakMinutes) === false ||
    data.breakMinutes < 0 ||
    (data.comment !== null && typeof data.comment !== "string") ||
    !isShiftType(data.shiftType)
  ) {
    return null;
  }

  let lessonRange: ShiftDetail["lessonRange"] = null;
  if (data.lessonRange !== null) {
    if (!isRecord(data.lessonRange)) {
      return null;
    }

    if (
      typeof data.lessonRange.timetableSetId !== "string" ||
      typeof data.lessonRange.startPeriod !== "number" ||
      Number.isInteger(data.lessonRange.startPeriod) === false ||
      data.lessonRange.startPeriod <= 0 ||
      typeof data.lessonRange.endPeriod !== "number" ||
      Number.isInteger(data.lessonRange.endPeriod) === false ||
      data.lessonRange.endPeriod <= 0
    ) {
      return null;
    }

    lessonRange = {
      timetableSetId: data.lessonRange.timetableSetId,
      startPeriod: data.lessonRange.startPeriod,
      endPeriod: data.lessonRange.endPeriod,
    };
  }

  return {
    id: data.id,
    workplaceId: data.workplaceId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    breakMinutes: data.breakMinutes,
    shiftType: data.shiftType,
    comment: data.comment,
    lessonRange,
  };
}

function parseShiftMutationResult(payload: unknown): {
  detail: ShiftDetail | null;
  monthShift: MonthShift | null;
} {
  if (!isRecord(payload)) {
    return {
      detail: null,
      monthShift: null,
    };
  }

  return {
    detail: parseShiftDetailResponse({ data: payload.data }),
    monthShift: normalizeMonthShift(payload.data),
  };
}

function toTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function findSetById(
  timetableSets: TimetableSet[],
  timetableSetId: string,
): TimetableSet | null {
  return timetableSets.find((set) => set.id === timetableSetId) ?? null;
}

function findSetItemByPeriod(
  timetableSet: TimetableSet | null,
  periodValue: string,
): TimetableSetItem | null {
  if (!timetableSet) {
    return null;
  }

  const period = Number(periodValue);
  if (Number.isFinite(period) === false) {
    return null;
  }

  return timetableSet.items.find((item) => item.period === period) ?? null;
}

function getLessonPeriods(timetableSet: TimetableSet | null): number[] {
  if (!timetableSet) {
    return [];
  }

  return timetableSet.items
    .map((item) => item.period)
    .sort((left, right) => left - right);
}

function resolveLessonTimeRange(
  timetableSet: TimetableSet | null,
  startPeriod: number,
  endPeriod: number,
): ShiftTimePair | null {
  if (!timetableSet || startPeriod > endPeriod) {
    return null;
  }

  const itemByPeriod = new Map<number, TimetableSetItem>();
  for (const item of timetableSet.items) {
    itemByPeriod.set(item.period, item);
  }

  for (let period = startPeriod; period <= endPeriod; period += 1) {
    if (!itemByPeriod.has(period)) {
      return null;
    }
  }

  const first = itemByPeriod.get(startPeriod);
  const last = itemByPeriod.get(endPeriod);
  if (!first || !last) {
    return null;
  }

  const startTime = first.startTimeLabel ?? toTimeOnly(first.startTime);
  const endTime = last.endTimeLabel ?? toTimeOnly(last.endTime);
  if (!startTime || !endTime) {
    return null;
  }

  return { startTime, endTime };
}

function formatCramShiftType(type: ShiftType): string {
  if (type === "NORMAL") {
    return "事務";
  }

  return formatShiftType(type);
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

function createInitialFormState(defaultDate: string): FormState {
  return {
    workplaceId: "",
    date: defaultDate,
    shiftType: "NORMAL",
    comment: "",
    startTime: "",
    endTime: "",
    breakMinutes: "0",
    timetableSetId: "",
    startPeriod: "",
    endPeriod: "",
  };
}

function createEditFormState(detail: ShiftDetail): FormState {
  return {
    workplaceId: detail.workplaceId,
    date: dateKeyFromApiDate(detail.date),
    shiftType: detail.shiftType,
    comment: detail.comment ?? "",
    startTime: toTimeOnly(detail.startTime),
    endTime: toTimeOnly(detail.endTime),
    breakMinutes: String(detail.breakMinutes),
    timetableSetId: detail.lessonRange?.timetableSetId ?? "",
    startPeriod: detail.lessonRange
      ? String(detail.lessonRange.startPeriod)
      : "",
    endPeriod: detail.lessonRange ? String(detail.lessonRange.endPeriod) : "",
  };
}

function getInitialShiftTimes(
  detail: ShiftDetail | null,
): ShiftTimePair | null {
  if (!detail) {
    return null;
  }

  return {
    startTime: toTimeOnly(detail.startTime),
    endTime: toTimeOnly(detail.endTime),
  };
}

function createShiftFormControllerState(
  formDraft: FormState | null,
): ShiftFormControllerState {
  return {
    formDraft,
    errors: {},
    warningMessage: null,
    isSubmitting: false,
    isOvernightDialogOpen: false,
  };
}

function clearErrorKeys(
  currentErrors: FormErrors,
  clearKeys: FormErrorKey[] | undefined,
): FormErrors {
  if (!clearKeys || clearKeys.length === 0) {
    return currentErrors;
  }

  let didChange = false;
  const nextErrors = { ...currentErrors };
  for (const key of clearKeys) {
    if (key in nextErrors) {
      delete nextErrors[key];
      didChange = true;
    }
  }

  return didChange ? nextErrors : currentErrors;
}

function clearFormError(currentErrors: FormErrors): FormErrors {
  if (!currentErrors.form) {
    return currentErrors;
  }

  const nextErrors = { ...currentErrors };
  delete nextErrors.form;
  return nextErrors;
}

function shiftFormControllerReducer(
  state: ShiftFormControllerState,
  action: ShiftFormControllerAction,
): ShiftFormControllerState {
  switch (action.type) {
    case "reset":
      return createShiftFormControllerState(action.formDraft);
    case "setFormDraft":
      return {
        ...state,
        formDraft: action.formDraft,
        errors: action.clearAllErrors
          ? {}
          : clearErrorKeys(state.errors, action.clearErrorKeys),
        warningMessage: action.resetWarning ? null : state.warningMessage,
      };
    case "setErrors":
      return {
        ...state,
        errors: action.errors,
      };
    case "clearSubmissionMessages":
      return {
        ...state,
        errors: clearFormError(state.errors),
        warningMessage: null,
      };
    case "setWarning":
      return {
        ...state,
        warningMessage: action.warningMessage,
      };
    case "setSubmitting":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
    case "setOvernightDialogOpen":
      return {
        ...state,
        isOvernightDialogOpen: action.open,
      };
  }
}

function readLastWorkplaceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(LAST_WORKPLACE_ID_KEY);
  } catch {
    return null;
  }
}

function resolveFallbackWorkplaceId(
  workplaces: Workplace[],
  mode: ShiftFormProps["mode"],
  preferredWorkplaceId: string | null,
): string {
  let nextWorkplaceId = workplaces[0]?.id ?? "";
  if (mode !== "create" || !preferredWorkplaceId) {
    return nextWorkplaceId;
  }

  const hasPreferredWorkplace = workplaces.some(
    (workplace) => workplace.id === preferredWorkplaceId,
  );
  if (hasPreferredWorkplace) {
    nextWorkplaceId = preferredWorkplaceId;
  }

  return nextWorkplaceId;
}

function hasEmptyLessonSelection(form: FormState): boolean {
  return !form.timetableSetId && !form.startPeriod && !form.endPeriod;
}

function normalizeLessonShiftForm(
  form: FormState,
  mode: ShiftFormProps["mode"],
  timetableSets: TimetableSet[],
  isTimetableLoading: boolean,
): FormState {
  if (timetableSets.length === 0) {
    if (hasEmptyLessonSelection(form)) {
      return form;
    }

    if (isTimetableLoading || mode === "edit") {
      return form;
    }

    return {
      ...form,
      timetableSetId: "",
      startPeriod: "",
      endPeriod: "",
    };
  }

  const nextSetId =
    form.timetableSetId && findSetById(timetableSets, form.timetableSetId)
      ? form.timetableSetId
      : (timetableSets[0]?.id ?? "");

  if (!nextSetId) {
    if (hasEmptyLessonSelection(form)) {
      return form;
    }

    return {
      ...form,
      timetableSetId: "",
      startPeriod: "",
      endPeriod: "",
    };
  }

  const nextSet = findSetById(timetableSets, nextSetId);
  const periods = getLessonPeriods(nextSet);
  const periodSet = new Set(periods);
  const first = periods[0] ? String(periods[0]) : "";
  const last = periods[periods.length - 1]
    ? String(periods[periods.length - 1])
    : "";
  const nextStart = periodSet.has(Number(form.startPeriod))
    ? form.startPeriod
    : first;
  const nextEnd = periodSet.has(Number(form.endPeriod)) ? form.endPeriod : last;

  if (
    nextSetId === form.timetableSetId &&
    nextStart === form.startPeriod &&
    nextEnd === form.endPeriod
  ) {
    return form;
  }

  return {
    ...form,
    timetableSetId: nextSetId,
    startPeriod: nextStart,
    endPeriod: nextEnd,
  };
}

function normalizeShiftForm(
  form: FormState,
  options: NormalizeShiftFormOptions,
): FormState {
  if (!options.hasEditSeed) {
    return form;
  }

  let nextForm = form;
  if (
    options.workplaces.length > 0 &&
    options.workplaces.some(
      (workplace) => workplace.id === nextForm.workplaceId,
    ) === false
  ) {
    nextForm = {
      ...nextForm,
      workplaceId: resolveFallbackWorkplaceId(
        options.workplaces,
        options.mode,
        options.preferredWorkplaceId,
      ),
    };
  }

  const selectedWorkplace = options.workplaces.find(
    (workplace) => workplace.id === nextForm.workplaceId,
  );
  if (!selectedWorkplace) {
    return nextForm;
  }

  if (selectedWorkplace.type !== "CRAM_SCHOOL") {
    if (
      nextForm.shiftType === "NORMAL" &&
      !nextForm.timetableSetId &&
      !nextForm.startPeriod &&
      !nextForm.endPeriod
    ) {
      return nextForm;
    }

    return {
      ...nextForm,
      shiftType: "NORMAL",
      timetableSetId: "",
      startPeriod: "",
      endPeriod: "",
    };
  }

  if (options.mode === "create" && nextForm.shiftType !== "LESSON") {
    nextForm = {
      ...nextForm,
      shiftType: "LESSON",
    };
  }

  if (nextForm.shiftType !== "LESSON") {
    return nextForm;
  }

  return normalizeLessonShiftForm(
    nextForm,
    options.mode,
    options.timetableSets,
    options.isTimetableLoading,
  );
}

function useShiftFormData(params: {
  mode: ShiftFormProps["mode"];
  shiftId?: string;
  defaultDate: string;
  formDraft: FormState | null;
  preferredWorkplaceId: string | null;
  loadQueryUserId: string;
}): ShiftFormData {
  const {
    mode,
    shiftId,
    defaultDate,
    formDraft,
    preferredWorkplaceId,
    loadQueryUserId,
  } = params;

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
        init: { signal, cache: "no-store" },
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

  const {
    data: shiftDetailData,
    error: shiftDetailError,
    isPending: isShiftDetailPending,
  } = useQuery({
    queryKey: queryKeys.shifts.detail({
      shiftId: shiftId ?? "",
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/shifts/${shiftId}`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "シフトの取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseShiftDetailResponse(payload);
          if (!parsed) {
            throw new Error("SHIFT_DETAIL_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled: mode === "edit" && Boolean(shiftId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const workplaces = useMemo(() => workplacesData ?? [], [workplacesData]);
  const selectedWorkplaceId =
    formDraft?.workplaceId ||
    shiftDetailData?.workplaceId ||
    resolveFallbackWorkplaceId(workplaces, mode, preferredWorkplaceId);
  const selectedWorkplace = useMemo(
    () => workplaces.find((workplace) => workplace.id === selectedWorkplaceId),
    [selectedWorkplaceId, workplaces],
  );
  const selectedWorkplaceType = selectedWorkplace?.type;

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
        init: { signal, cache: "no-store" },
        fallbackMessage: "時間割一覧の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseTimetableSetListResponse(payload);
          if (!parsed) {
            throw new Error("TIMETABLE_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled:
      selectedWorkplaceType === "CRAM_SCHOOL" && Boolean(selectedWorkplaceId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const timetableSets = useMemo(() => {
    if (selectedWorkplaceType !== "CRAM_SCHOOL") {
      return [] as TimetableSet[];
    }

    const items = timetableSetsData ?? [];
    return items.slice().sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
  }, [selectedWorkplaceType, timetableSetsData]);

  return {
    workplaces,
    workplacesError,
    isWorkplaceLoading: isWorkplacePending,
    shiftDetailData: shiftDetailData ?? null,
    shiftDetailError,
    isShiftLoading: mode === "edit" && Boolean(shiftId) && isShiftDetailPending,
    resolvedInitialForm:
      mode === "edit" && shiftDetailData
        ? createEditFormState(shiftDetailData)
        : createInitialFormState(defaultDate),
    initialShiftTimes:
      mode === "edit" ? getInitialShiftTimes(shiftDetailData ?? null) : null,
    selectedWorkplace,
    selectedWorkplaceType,
    workplacePayrollCycleData: workplacePayrollCycleData ?? null,
    previewPayrollRulesData: previewPayrollRulesData ?? [],
    timetableSets,
    timetableSetsError,
    isTimetableLoading:
      selectedWorkplaceType === "CRAM_SCHOOL" && isTimetableSetsPending,
  };
}

function useShiftFormPreviewInputs(params: {
  mode: ShiftFormProps["mode"];
  form: FormState;
  selectedWorkplaceType: Workplace["type"] | undefined;
  workplacePayrollCycleData: WorkplacePayrollCycleDetail | null;
  timetableSets: TimetableSet[];
}) {
  const {
    mode,
    form,
    selectedWorkplaceType,
    workplacePayrollCycleData,
    timetableSets,
  } = params;

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
      timetableSets.map((set) => ({
        id: set.id,
        workplaceId: set.workplaceId,
        items: set.items.map((item) => ({
          timetableSetId: item.timetableSetId,
          period: item.period,
          startTime: toTimeOnly(item.startTime),
          endTime: toTimeOnly(item.endTime),
        })),
      })),
    [timetableSets],
  );

  const previewInputShifts = useMemo(() => {
    if (
      mode !== "create" ||
      !form.workplaceId ||
      !form.date ||
      previewWorkplaces.length === 0
    ) {
      return [];
    }

    const shiftType: ShiftType =
      selectedWorkplaceType === "CRAM_SCHOOL" && form.shiftType === "LESSON"
        ? "LESSON"
        : "NORMAL";

    return [
      {
        temporaryId: "new-shift",
        workplaceId: form.workplaceId,
        date: form.date,
        shiftType,
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: Number(form.breakMinutes) || 0,
        lessonRange:
          shiftType === "LESSON"
            ? {
                timetableSetId: form.timetableSetId,
                startPeriod: Number(form.startPeriod),
                endPeriod: Number(form.endPeriod),
              }
            : undefined,
      },
    ];
  }, [
    form.breakMinutes,
    form.date,
    form.endPeriod,
    form.endTime,
    form.shiftType,
    form.startPeriod,
    form.startTime,
    form.timetableSetId,
    form.workplaceId,
    mode,
    previewWorkplaces.length,
    selectedWorkplaceType,
  ]);

  return {
    previewWorkplaces,
    previewTimetableSets,
    previewInputShifts,
  };
}

function validateShiftForm(params: {
  form: FormState;
  selectedWorkplace: Workplace | undefined;
  timetableSets: TimetableSet[];
}): ValidateShiftFormResult {
  const { form, selectedWorkplace, timetableSets } = params;
  const nextErrors: FormErrors = {};

  if (!form.workplaceId) {
    nextErrors.workplaceId = "ERR_001: 勤務先は必須項目です";
  }

  if (!form.date) {
    nextErrors.date = "ERR_001: 日付は必須項目です";
  }

  if (form.comment.length > 100) {
    nextErrors.comment = "コメントは100文字以内で入力してください";
  }

  if (/[\r\n]/.test(form.comment)) {
    nextErrors.comment = "コメントに改行は使用できません";
  }

  if (form.shiftType === "LESSON") {
    if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
      nextErrors.shiftType = "授業シフトは塾タイプ勤務先でのみ選択できます";
    }

    if (!form.timetableSetId) {
      nextErrors.timetableSetId = "ERR_001: 時間割セットは必須項目です";
    }

    if (!form.startPeriod) {
      nextErrors.startPeriod = "ERR_001: 開始コマは必須項目です";
    }

    if (!form.endPeriod) {
      nextErrors.endPeriod = "ERR_001: 終了コマは必須項目です";
    }

    const startPeriod = Number(form.startPeriod);
    const endPeriod = Number(form.endPeriod);
    if (
      Number.isFinite(startPeriod) &&
      Number.isFinite(endPeriod) &&
      startPeriod > endPeriod
    ) {
      nextErrors.endPeriod = "開始コマは終了コマ以下で指定してください";
    }

    const timetableSet = findSetById(timetableSets, form.timetableSetId);
    if (!timetableSet) {
      if (timetableSets.length === 0) {
        nextErrors.timetableSetId =
          "ERR_004: 塾の授業は時間割セットが登録されていません";
      } else if (!nextErrors.timetableSetId) {
        nextErrors.timetableSetId =
          "ERR_004: 選択した時間割セットが見つかりません";
      }
    }

    const resolved =
      Number.isFinite(startPeriod) &&
      Number.isFinite(endPeriod) &&
      startPeriod <= endPeriod
        ? resolveLessonTimeRange(timetableSet, startPeriod, endPeriod)
        : null;
    if (!resolved && timetableSet && !nextErrors.endPeriod) {
      nextErrors.endPeriod =
        "ERR_004: 選択したコマ範囲の時間割が登録されていません";
    }

    return {
      errors: nextErrors,
      candidateTimes: resolved,
    };
  }

  const breakMinutes = Number(form.breakMinutes);
  if (Number.isFinite(breakMinutes) === false || breakMinutes < 0) {
    nextErrors.breakMinutes = "休憩時間は0以上で入力してください";
  }

  if (breakMinutes > 240) {
    nextErrors.breakMinutes = "休憩時間は240分以下で入力してください";
  }

  if (!form.startTime) {
    nextErrors.startTime = "ERR_001: 開始時刻は必須項目です";
  }

  if (!form.endTime) {
    nextErrors.endTime = "ERR_001: 終了時刻は必須項目です";
  }

  if (
    form.startTime &&
    form.endTime &&
    isSameTimeShift(form.startTime, form.endTime)
  ) {
    nextErrors.endTime = "ERR_002: 開始時刻と終了時刻は同じ時刻にできません";
  }

  if (Object.keys(nextErrors).length > 0) {
    return {
      errors: nextErrors,
      candidateTimes: null,
    };
  }

  return {
    errors: nextErrors,
    candidateTimes: {
      startTime: form.startTime,
      endTime: form.endTime,
    },
  };
}

async function checkShiftOverlapWarning(params: {
  mode: ShiftFormProps["mode"];
  shiftId?: string;
  form: FormState;
  candidateTimes: ShiftTimePair;
}): Promise<string | null> {
  const { mode, shiftId, form, candidateTimes } = params;
  if (!form.workplaceId || !form.date) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({
      workplaceId: form.workplaceId,
      startDate: shiftDateKeyAddDays(form.date, -1),
      endDate: shiftDateKeyAddDays(form.date, 1),
    });

    const response = await fetch(`/api/shifts?${searchParams.toString()}`, {
      cache: "no-store",
    });
    if (response.ok === false) {
      return null;
    }

    const shiftsPayload = parseShiftListResponse(
      (await response.json()) as unknown,
    );
    if (!shiftsPayload) {
      return null;
    }

    const candidateRange = toComparableShiftRange(
      form.date,
      candidateTimes.startTime,
      candidateTimes.endTime,
    );

    const overlapped = shiftsPayload.some((shift) => {
      if (mode === "edit" && shift.id === shiftId) {
        return false;
      }

      const shiftRange = toComparableShiftRange(
        dateKeyFromApiDate(shift.date),
        toTimeOnly(shift.startTime),
        toTimeOnly(shift.endTime),
      );

      return (
        candidateRange.startAtUtcMinutes < shiftRange.endAtUtcMinutes &&
        shiftRange.startAtUtcMinutes < candidateRange.endAtUtcMinutes
      );
    });

    return overlapped
      ? "ERR_003: この日付にはすでにシフトが登録されています"
      : null;
  } catch (error) {
    console.error("failed to check overlap", error);
    return null;
  }
}

function shouldRequireOvernightConfirmation(params: {
  mode: ShiftFormProps["mode"];
  initialShiftTimes: ShiftTimePair | null;
  candidateTimes: ShiftTimePair;
}): boolean {
  const { mode, initialShiftTimes, candidateTimes } = params;
  if (!isOvernightShift(candidateTimes.startTime, candidateTimes.endTime)) {
    return false;
  }

  if (
    mode === "edit" &&
    initialShiftTimes &&
    initialShiftTimes.startTime === candidateTimes.startTime &&
    initialShiftTimes.endTime === candidateTimes.endTime
  ) {
    return false;
  }

  return true;
}

function buildShiftPayload(
  form: FormState,
  selectedWorkplaceType: Workplace["type"] | undefined,
): ShiftMutationPayload {
  const breakMinutes = Number(form.breakMinutes);
  const effectiveShiftType: ShiftType =
    selectedWorkplaceType === "CRAM_SCHOOL" && form.shiftType === "LESSON"
      ? "LESSON"
      : "NORMAL";

  const payload: ShiftMutationPayload = {
    workplaceId: form.workplaceId,
    date: form.date,
    shiftType: effectiveShiftType,
    comment: form.comment,
    breakMinutes:
      effectiveShiftType === "LESSON"
        ? 0
        : Number.isNaN(breakMinutes)
          ? 0
          : breakMinutes,
  };

  if (effectiveShiftType === "LESSON") {
    payload.lessonRange = {
      timetableSetId: form.timetableSetId,
      startPeriod: Number(form.startPeriod),
      endPeriod: Number(form.endPeriod),
    };
  } else {
    payload.startTime = form.startTime;
    payload.endTime = form.endTime;
  }

  return payload;
}

function getFormErrorMessage(params: {
  errors: FormErrors;
  mode: ShiftFormProps["mode"];
  shiftId?: string;
  shiftDetailError: unknown;
  workplacesError: unknown;
}): string | null {
  const { errors, mode, shiftId, shiftDetailError, workplacesError } = params;

  return (
    errors.form ??
    (mode === "edit" && !shiftId
      ? "編集対象のシフトIDが指定されていません。"
      : shiftDetailError
        ? toUserFacingMessage(shiftDetailError, "シフトの取得に失敗しました。")
        : workplacesError
          ? toUserFacingMessage(
              workplacesError,
              "勤務先一覧の取得に失敗しました。時間を置いて再度お試しください。",
            )
          : null)
  );
}

function ShiftFormHeader({ mode }: { mode: ShiftFormProps["mode"] }) {
  return (
    <header className="space-y-2">
      <h2 className="text-xl font-semibold">
        {mode === "create" ? "シフト入力" : "シフト編集"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {mode === "create"
          ? "新しいシフトを登録します。登録後はカレンダー画面へ戻ります。"
          : "既存シフトを更新します。更新後はカレンダー画面へ戻ります。"}
      </p>
    </header>
  );
}

function ShiftFormPrimaryFields(props: {
  form: FormState;
  errors: FormErrors;
  workplaces: Workplace[];
  selectedWorkplace: Workplace | undefined;
  selectedWorkplaceType: Workplace["type"] | undefined;
  disabled: boolean;
  onWorkplaceChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onShiftTypeChange: (value: ShiftType) => void;
}) {
  const {
    form,
    errors,
    workplaces,
    selectedWorkplace,
    selectedWorkplaceType,
    disabled,
    onWorkplaceChange,
    onDateChange,
    onShiftTypeChange,
  } = props;
  const showShiftTypeSelector = selectedWorkplaceType === "CRAM_SCHOOL";

  return (
    <>
      <Field data-invalid={Boolean(errors.workplaceId)}>
        <FieldLabel>勤務先</FieldLabel>
        <FieldContent>
          <Select
            value={form.workplaceId}
            onValueChange={(value) => onWorkplaceChange(value ?? "")}
            disabled={disabled}
          >
            <SelectTrigger className="w-full max-w-50">
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
          <FormErrorMessage message={errors.workplaceId} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.date)}>
        <FieldLabel htmlFor="shift-date">日付</FieldLabel>
        <FieldContent>
          <DatePicker
            id="shift-date"
            value={form.date}
            onValueChange={onDateChange}
            disabled={disabled}
            className="max-w-40"
          />
          <FormErrorMessage message={errors.date} />
        </FieldContent>
      </Field>

      {showShiftTypeSelector ? (
        <Field data-invalid={Boolean(errors.shiftType)}>
          <FieldLabel>シフトタイプ</FieldLabel>
          <FieldContent>
            <RadioGroup
              value={form.shiftType}
              onValueChange={(value) => onShiftTypeChange(value as ShiftType)}
            >
              <Field orientation="horizontal">
                <RadioGroupItem
                  id="shift-type-lesson"
                  value="LESSON"
                  disabled={disabled}
                />
                <FieldLabel htmlFor="shift-type-lesson">
                  {formatCramShiftType("LESSON")}
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem
                  id="shift-type-normal"
                  value="NORMAL"
                  disabled={disabled}
                />
                <FieldLabel htmlFor="shift-type-normal">
                  {formatCramShiftType("NORMAL")}
                </FieldLabel>
              </Field>
            </RadioGroup>
            <FieldDescription>
              塾タイプ勤務先では授業または事務を選択します。
            </FieldDescription>
            <FormErrorMessage message={errors.shiftType} />
          </FieldContent>
        </Field>
      ) : null}
    </>
  );
}

function ShiftFormLessonFields(props: {
  form: FormState;
  errors: FormErrors;
  disabled: boolean;
  timetableSets: TimetableSet[];
  isTimetableLoading: boolean;
  selectedSet: TimetableSet | null;
  lessonPeriods: number[];
  selectedStartPeriodItem: TimetableSetItem | null;
  selectedEndPeriodItem: TimetableSetItem | null;
  onTimetableSetChange: (value: string) => void;
  onStartPeriodChange: (value: string) => void;
  onEndPeriodChange: (value: string) => void;
}) {
  const {
    form,
    errors,
    disabled,
    timetableSets,
    isTimetableLoading,
    selectedSet,
    lessonPeriods,
    selectedStartPeriodItem,
    selectedEndPeriodItem,
    onTimetableSetChange,
    onStartPeriodChange,
    onEndPeriodChange,
  } = props;

  return (
    <>
      <Field data-invalid={Boolean(errors.timetableSetId)}>
        <FieldLabel>時間割セット</FieldLabel>
        <FieldContent>
          <Select
            value={form.timetableSetId}
            onValueChange={(value) => onTimetableSetChange(value ?? "")}
            disabled={disabled || isTimetableLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="時間割セットを選択">
                {selectedSet?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {timetableSets.map((set) => (
                  <SelectItem key={set.id} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormErrorMessage message={errors.timetableSetId} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.startPeriod)}>
        <FieldLabel>開始コマ</FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Select
              value={form.startPeriod}
              onValueChange={(value) => onStartPeriodChange(value ?? "")}
              disabled={
                disabled || isTimetableLoading || lessonPeriods.length === 0
              }
            >
              <SelectTrigger className="w-full max-w-20">
                <SelectValue placeholder="開始コマを選択">
                  {form.startPeriod ? `${form.startPeriod}限` : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {lessonPeriods.map((period) => (
                    <SelectItem key={period} value={String(period)}>
                      {period}限
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {selectedStartPeriodItem ? (
              <span className="text-sm text-muted-foreground">
                {selectedStartPeriodItem.startTimeLabel ??
                  toTimeOnly(selectedStartPeriodItem.startTime)}
                〜
              </span>
            ) : null}
          </div>
          <FormErrorMessage message={errors.startPeriod} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.endPeriod)}>
        <FieldLabel>終了コマ</FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Select
              value={form.endPeriod}
              onValueChange={(value) => onEndPeriodChange(value ?? "")}
              disabled={
                disabled || isTimetableLoading || lessonPeriods.length === 0
              }
            >
              <SelectTrigger className="w-full max-w-20">
                <SelectValue placeholder="終了コマを選択">
                  {form.endPeriod ? `${form.endPeriod}限` : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {lessonPeriods.map((period) => (
                    <SelectItem key={period} value={String(period)}>
                      {period}限
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {selectedEndPeriodItem ? (
              <span className="text-sm text-muted-foreground">
                〜
                {selectedEndPeriodItem.endTimeLabel ??
                  toTimeOnly(selectedEndPeriodItem.endTime)}
              </span>
            ) : null}
          </div>
          <FormErrorMessage message={errors.endPeriod} />
        </FieldContent>
      </Field>
    </>
  );
}

function ShiftFormTimeFields(props: {
  form: FormState;
  errors: FormErrors;
  disabled: boolean;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onBreakMinutesChange: (value: string) => void;
}) {
  const {
    form,
    errors,
    disabled,
    onStartTimeChange,
    onEndTimeChange,
    onBreakMinutesChange,
  } = props;

  return (
    <>
      <Field data-invalid={Boolean(errors.startTime)}>
        <FieldLabel htmlFor="shift-start-time">開始時刻</FieldLabel>
        <FieldContent>
          <TimePicker
            id="shift-start-time"
            value={form.startTime}
            onValueChange={onStartTimeChange}
            disabled={disabled}
            className="max-w-24"
          />
          <FormErrorMessage message={errors.startTime} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.endTime)}>
        <FieldLabel htmlFor="shift-end-time">終了時刻</FieldLabel>
        <FieldContent>
          <TimePicker
            id="shift-end-time"
            value={form.endTime}
            onValueChange={onEndTimeChange}
            disabled={disabled}
            className="max-w-24"
          />
          <FormErrorMessage message={errors.endTime} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.breakMinutes)}>
        <FieldLabel htmlFor="shift-break-minutes">休憩時間</FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="shift-break-minutes"
              type="number"
              min={0}
              max={240}
              value={form.breakMinutes}
              onChange={(event) =>
                onBreakMinutesChange(event.currentTarget.value)
              }
              disabled={disabled}
              className="max-w-14"
            />
            <span className="shrink-0 text-sm text-muted-foreground">分</span>
          </div>
          <FormErrorMessage message={errors.breakMinutes} />
        </FieldContent>
      </Field>
    </>
  );
}

function ShiftFormCommentField(props: {
  form: FormState;
  errors: FormErrors;
  eventNamePreview: string;
  disabled: boolean;
  onCommentChange: (value: string) => void;
}) {
  const { form, errors, eventNamePreview, disabled, onCommentChange } = props;

  return (
    <Field data-invalid={Boolean(errors.comment)}>
      <FieldLabel htmlFor="shift-comment">コメント</FieldLabel>
      <FieldContent>
        <Input
          id="shift-comment"
          value={form.comment}
          onChange={(event) => onCommentChange(event.currentTarget.value)}
          maxLength={100}
          placeholder="例: 事務、授業補助、研修"
          disabled={disabled}
        />
        <FieldDescription>{eventNamePreview}</FieldDescription>
        <FormErrorMessage message={errors.comment} />
      </FieldContent>
    </Field>
  );
}

function ShiftFormActions(props: {
  mode: ShiftFormProps["mode"];
  disabled: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  const { mode, disabled, isSubmitting, onCancel } = props;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={disabled}>
        {isSubmitting
          ? mode === "create"
            ? "登録中..."
            : "更新中..."
          : mode === "create"
            ? "登録"
            : "更新"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        キャンセル
      </Button>
    </div>
  );
}

function ShiftFormMessages(props: {
  formErrorMessage: string | null;
  warningMessage: string | null;
  workplacesLength: number;
  isWorkplaceLoading: boolean;
}) {
  const {
    formErrorMessage,
    warningMessage,
    workplacesLength,
    isWorkplaceLoading,
  } = props;

  return (
    <>
      {formErrorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {formErrorMessage}
        </p>
      ) : null}

      {warningMessage ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          {warningMessage}
        </p>
      ) : null}

      {workplacesLength === 0 && !isWorkplaceLoading ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          勤務先が未登録です。先に勤務先を作成してください。
        </p>
      ) : null}
    </>
  );
}

function ShiftFormEditor(props: ShiftFormEditorProps) {
  const {
    mode,
    form,
    errors,
    workplaces,
    selectedWorkplace,
    selectedWorkplaceType,
    timetableSets,
    isTimetableLoading,
    selectedSet,
    lessonPeriods,
    selectedStartPeriodItem,
    selectedEndPeriodItem,
    eventNamePreview,
    disabled,
    isSubmitting,
    onSubmit,
    onWorkplaceChange,
    onDateChange,
    onShiftTypeChange,
    onTimetableSetChange,
    onStartPeriodChange,
    onEndPeriodChange,
    onStartTimeChange,
    onEndTimeChange,
    onBreakMinutesChange,
    onCommentChange,
    onCancel,
  } = props;

  const showShiftTypeSelector = selectedWorkplaceType === "CRAM_SCHOOL";
  const showLessonFields = showShiftTypeSelector && form.shiftType === "LESSON";

  return (
    <Form className="max-w-sm" onSubmit={onSubmit}>
      <FieldGroup>
        <ShiftFormPrimaryFields
          form={form}
          errors={errors}
          workplaces={workplaces}
          selectedWorkplace={selectedWorkplace}
          selectedWorkplaceType={selectedWorkplaceType}
          disabled={disabled}
          onWorkplaceChange={onWorkplaceChange}
          onDateChange={onDateChange}
          onShiftTypeChange={onShiftTypeChange}
        />

        {showLessonFields ? (
          <ShiftFormLessonFields
            form={form}
            errors={errors}
            disabled={disabled}
            timetableSets={timetableSets}
            isTimetableLoading={isTimetableLoading}
            selectedSet={selectedSet}
            lessonPeriods={lessonPeriods}
            selectedStartPeriodItem={selectedStartPeriodItem}
            selectedEndPeriodItem={selectedEndPeriodItem}
            onTimetableSetChange={onTimetableSetChange}
            onStartPeriodChange={onStartPeriodChange}
            onEndPeriodChange={onEndPeriodChange}
          />
        ) : (
          <ShiftFormTimeFields
            form={form}
            errors={errors}
            disabled={disabled}
            onStartTimeChange={onStartTimeChange}
            onEndTimeChange={onEndTimeChange}
            onBreakMinutesChange={onBreakMinutesChange}
          />
        )}

        <ShiftFormCommentField
          form={form}
          errors={errors}
          eventNamePreview={eventNamePreview}
          disabled={disabled}
          onCommentChange={onCommentChange}
        />
      </FieldGroup>

      <ShiftFormActions
        mode={mode}
        disabled={disabled}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
      />
    </Form>
  );
}
function useShiftFormController(
  props: ShiftFormProps,
): ShiftFormControllerResult {
  const { mode, returnMonth, returnTo = "dashboard" } = props;
  const shiftId = mode === "edit" ? props.shiftId : undefined;
  const initialDate = mode === "create" ? props.initialDate : null;
  const defaultDate = initialDate ?? "";
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const loadQueryUserId = "self";
  const preferredWorkplaceId = useMemo(() => readLastWorkplaceId(), []);
  const pendingOvernightTimesRef = useRef<ShiftTimePair | null>(null);
  const { isSignOutScheduled, scheduleSignOut } =
    useGoogleTokenExpiredSignOut();
  const [state, dispatch] = useReducer(
    shiftFormControllerReducer,
    mode === "create" ? createInitialFormState(defaultDate) : null,
    createShiftFormControllerState,
  );

  const resetFormState = useCallback(() => {
    pendingOvernightTimesRef.current = null;
    dispatch({
      type: "reset",
      formDraft: mode === "create" ? createInitialFormState(defaultDate) : null,
    });
  }, [defaultDate, dispatch, mode]);

  const { markForResetOnRouteHidden } = useResetOnRouteHidden(() => {
    resetFormState();
  });

  const returnPath = useMemo(() => {
    const basePath = returnTo === "list" ? "/my/shifts/list" : "/my";
    if (!returnMonth) {
      return basePath;
    }

    const parsed = fromMonthInputValue(returnMonth);
    if (!parsed) {
      return basePath;
    }

    return `${basePath}?month=${toMonthInputValue(parsed)}`;
  }, [returnMonth, returnTo]);

  const data = useShiftFormData({
    mode,
    shiftId,
    defaultDate,
    formDraft: state.formDraft,
    preferredWorkplaceId,
    loadQueryUserId,
  });

  useEffect(() => {
    if (data.timetableSetsError) {
      console.error("failed to fetch timetable sets", data.timetableSetsError);
    }
  }, [data.timetableSetsError]);

  const hasEditSeed = mode !== "edit" || Boolean(data.shiftDetailData);
  const form = useMemo(
    () =>
      normalizeShiftForm(state.formDraft ?? data.resolvedInitialForm, {
        mode,
        hasEditSeed,
        workplaces: data.workplaces,
        preferredWorkplaceId,
        timetableSets: data.timetableSets,
        isTimetableLoading: data.isTimetableLoading,
      }),
    [
      data.isTimetableLoading,
      data.resolvedInitialForm,
      data.timetableSets,
      data.workplaces,
      hasEditSeed,
      mode,
      preferredWorkplaceId,
      state.formDraft,
    ],
  );

  const selectedWorkplace = useMemo(
    () =>
      data.workplaces.find((workplace) => workplace.id === form.workplaceId),
    [data.workplaces, form.workplaceId],
  );
  const selectedWorkplaceType = selectedWorkplace?.type;
  const selectedSet = useMemo(
    () => findSetById(data.timetableSets, form.timetableSetId),
    [data.timetableSets, form.timetableSetId],
  );
  const lessonPeriods = useMemo(
    () => getLessonPeriods(selectedSet),
    [selectedSet],
  );
  const selectedStartPeriodItem = useMemo(
    () => findSetItemByPeriod(selectedSet, form.startPeriod),
    [form.startPeriod, selectedSet],
  );
  const selectedEndPeriodItem = useMemo(
    () => findSetItemByPeriod(selectedSet, form.endPeriod),
    [form.endPeriod, selectedSet],
  );

  const { previewWorkplaces, previewTimetableSets, previewInputShifts } =
    useShiftFormPreviewInputs({
      mode,
      form,
      selectedWorkplaceType,
      workplacePayrollCycleData: data.workplacePayrollCycleData,
      timetableSets: data.timetableSets,
    });

  const shiftPayrollPreview = useShiftPayrollPreview({
    userId: loadQueryUserId,
    shifts: previewInputShifts,
    workplaces: previewWorkplaces,
    payrollRules: data.previewPayrollRulesData,
    timetableSets: previewTimetableSets,
  });

  const replaceFormDraft = useCallback(
    (
      nextFormDraft: FormState,
      options?: {
        clearErrorKeys?: FormErrorKey[];
        clearAllErrors?: boolean;
        resetWarning?: boolean;
      },
    ) => {
      dispatch({
        type: "setFormDraft",
        formDraft: nextFormDraft,
        clearErrorKeys: options?.clearErrorKeys,
        clearAllErrors: options?.clearAllErrors,
        resetWarning: options?.resetWarning,
      });
    },
    [dispatch],
  );

  const updateFormField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      replaceFormDraft(
        {
          ...form,
          [key]: value,
        },
        {
          clearErrorKeys: [key as FormErrorKey],
        },
      );
    },
    [form, replaceFormDraft],
  );

  const handleWorkplaceChange = useCallback(
    (nextWorkplaceId: string) => {
      const nextWorkplace = data.workplaces.find(
        (workplace) => workplace.id === nextWorkplaceId,
      );

      let nextFormDraft: FormState = {
        ...form,
        workplaceId: nextWorkplaceId,
      };

      if (nextWorkplace?.type !== "CRAM_SCHOOL") {
        nextFormDraft = {
          ...nextFormDraft,
          shiftType: "NORMAL",
          timetableSetId: "",
          startPeriod: "",
          endPeriod: "",
        };
      } else if (mode === "create") {
        nextFormDraft = {
          ...nextFormDraft,
          shiftType: "LESSON",
          timetableSetId: "",
          startPeriod: "",
          endPeriod: "",
        };
      }

      replaceFormDraft(nextFormDraft, {
        clearErrorKeys: [
          "workplaceId",
          "shiftType",
          "timetableSetId",
          "startPeriod",
          "endPeriod",
        ],
      });
    },
    [data.workplaces, form, mode, replaceFormDraft],
  );

  const handleShiftTypeChange = useCallback(
    (nextShiftType: ShiftType) => {
      replaceFormDraft(
        {
          ...form,
          shiftType: nextShiftType,
        },
        {
          clearAllErrors: true,
          resetWarning: true,
        },
      );
    },
    [form, replaceFormDraft],
  );

  const handleTimetableSetChange = useCallback(
    (nextSetId: string) => {
      const nextSet = findSetById(data.timetableSets, nextSetId);
      const periods = getLessonPeriods(nextSet);
      const first = periods[0] ? String(periods[0]) : "";
      const last = periods[periods.length - 1]
        ? String(periods[periods.length - 1])
        : "";

      replaceFormDraft(
        {
          ...form,
          timetableSetId: nextSetId,
          startPeriod: first,
          endPeriod: last,
        },
        {
          clearErrorKeys: ["timetableSetId", "startPeriod", "endPeriod"],
        },
      );
    },
    [data.timetableSets, form, replaceFormDraft],
  );

  const executeSubmit = useCallback(
    async (
      validation: ValidateShiftFormResult,
      options?: {
        skipOvernightConfirmation?: boolean;
      },
    ) => {
      if (!validation.candidateTimes) {
        return;
      }

      if (
        !options?.skipOvernightConfirmation &&
        shouldRequireOvernightConfirmation({
          mode,
          initialShiftTimes: data.initialShiftTimes,
          candidateTimes: validation.candidateTimes,
        })
      ) {
        pendingOvernightTimesRef.current = validation.candidateTimes;
        dispatch({
          type: "setOvernightDialogOpen",
          open: true,
        });
        return;
      }

      if (mode === "edit" && !shiftId) {
        dispatch({
          type: "setErrors",
          errors: {
            form: "編集対象のシフトIDが指定されていません。",
          },
        });
        return;
      }

      dispatch({
        type: "setSubmitting",
        isSubmitting: true,
      });
      const loadingToastId = toast.loading("シフトを保存中です...");

      try {
        const overlapMessage = await checkShiftOverlapWarning({
          mode,
          shiftId,
          form,
          candidateTimes: validation.candidateTimes,
        });
        if (overlapMessage) {
          dispatch({
            type: "setWarning",
            warningMessage: overlapMessage,
          });
          toast.warning(messages.warning.shiftOverlap, {
            description: overlapMessage,
            duration: 6000,
          });
        }

        const endpoint =
          mode === "create" ? "/api/shifts" : `/api/shifts/${shiftId}`;
        const method = mode === "create" ? "POST" : "PUT";
        const payload = buildShiftPayload(form, selectedWorkplaceType);

        const response = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (response.ok === false) {
          const apiError = await readGoogleSyncFailureFromErrorResponse(
            response,
            "シフトの保存に失敗しました",
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
        const syncState = parseGoogleSyncStateFromPayload(
          responsePayload,
          messages.error.calendarSyncFailed,
        );
        const syncFailure = syncState.failure;
        const mutationResult = parseShiftMutationResult(responsePayload);

        if (mutationResult.monthShift) {
          upsertMonthShiftInCachesOptimistically(
            queryClient,
            mutationResult.monthShift,
            mode === "edit" && shiftId
              ? {
                  previousShiftId: shiftId,
                }
              : undefined,
          );
        }

        if (mode === "edit" && shiftId && mutationResult.detail) {
          queryClient.setQueryData(
            queryKeys.shifts.detail({ shiftId }),
            mutationResult.detail,
          );
        }

        void invalidateAfterShiftMutation(queryClient, {
          mode: "background",
        });
        window.localStorage.setItem(LAST_WORKPLACE_ID_KEY, form.workplaceId);

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

          toast.error(messages.error.calendarSyncFailed, {
            id: loadingToastId,
            description: syncFailure.requiresCalendarSetup
              ? syncFailure.message
              : `${syncFailure.message} シフトは保存済みです。`,
            duration: 6000,
          });

          markForResetOnRouteHidden();
          if (syncFailure.requiresCalendarSetup) {
            router.push(CALENDAR_SETUP_PATH);
            return;
          }

          router.push(returnPath);
          return;
        }

        const successDescription =
          form.date +
          " " +
          formatShiftTimeRange(
            validation.candidateTimes.startTime,
            validation.candidateTimes.endTime,
          );

        toast.success(
          mode === "create"
            ? messages.success.shiftCreated
            : messages.success.shiftUpdated,
          {
            id: loadingToastId,
            description: buildMutationSuccessDescription({
              baseDescription: successDescription,
              syncPending: syncState.pending,
            }),
          },
        );
        markForResetOnRouteHidden();
        router.push(returnPath);
      } catch (error) {
        console.error("failed to save shift", error);
        const message = toErrorMessage(error, messages.error.shiftSaveFailed);
        dispatch({
          type: "setErrors",
          errors: {
            ...state.errors,
            form: message,
          },
        });
        toast.error(messages.error.shiftSaveFailed, {
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
    },
    [
      data.initialShiftTimes,
      form,
      markForResetOnRouteHidden,
      mode,
      queryClient,
      returnPath,
      router,
      scheduleSignOut,
      selectedWorkplaceType,
      shiftId,
      state.errors,
    ],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSignOutScheduled) {
        return;
      }

      dispatch({
        type: "clearSubmissionMessages",
      });

      const validation = validateShiftForm({
        form,
        selectedWorkplace,
        timetableSets: data.timetableSets,
      });

      if (
        Object.keys(validation.errors).length > 0 ||
        !validation.candidateTimes
      ) {
        dispatch({
          type: "setErrors",
          errors: validation.errors,
        });
        const firstValidationMessage = Object.values(validation.errors).find(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        );
        toast.error(messages.error.validation, {
          description: firstValidationMessage,
          duration: 6000,
        });
        return;
      }

      await executeSubmit(validation);
    },
    [
      data.timetableSets,
      executeSubmit,
      form,
      isSignOutScheduled,
      selectedWorkplace,
    ],
  );

  const handleOvernightDialogOpenChange = useCallback(
    (open: boolean) => {
      dispatch({
        type: "setOvernightDialogOpen",
        open,
      });
      if (!open) {
        pendingOvernightTimesRef.current = null;
      }
    },
    [dispatch],
  );

  const formErrorMessage = getFormErrorMessage({
    errors: state.errors,
    mode,
    shiftId,
    shiftDetailError: data.shiftDetailError,
    workplacesError: data.workplacesError,
  });
  const eventNamePreview = formatEventNamePreview(
    selectedWorkplace?.name,
    form.comment,
  );
  const disabled =
    state.isSubmitting ||
    isSignOutScheduled ||
    data.isWorkplaceLoading ||
    data.isShiftLoading ||
    data.workplaces.length === 0;

  const previewEmptyMessage =
    shiftPayrollPreview.items.find((item) => item.status !== "ready")
      ?.message ?? "シフト情報を入力すると支給額を確認できます";

  const handleCancel = useCallback(() => {
    markForResetOnRouteHidden();
    router.push(returnPath);
  }, [markForResetOnRouteHidden, returnPath, router]);

  const handleOvernightConfirm = useCallback(async () => {
    const pendingOvernightTimes = pendingOvernightTimesRef.current;
    if (!pendingOvernightTimes) {
      return;
    }

    await executeSubmit(
      {
        errors: {},
        candidateTimes: pendingOvernightTimes,
      },
      {
        skipOvernightConfirmation: true,
      },
    );
    pendingOvernightTimesRef.current = null;
  }, [executeSubmit]);

  return {
    mode,
    form,
    errors: state.errors,
    warningMessage: state.warningMessage,
    workplaces: data.workplaces,
    selectedWorkplace,
    selectedWorkplaceType,
    timetableSets: data.timetableSets,
    isTimetableLoading: data.isTimetableLoading,
    selectedSet,
    lessonPeriods,
    selectedStartPeriodItem,
    selectedEndPeriodItem,
    eventNamePreview,
    disabled,
    isSubmitting: state.isSubmitting,
    isShiftLoading: data.isShiftLoading,
    isWorkplaceLoading: data.isWorkplaceLoading,
    formErrorMessage,
    previewMonths: shiftPayrollPreview.months,
    previewUnresolvedCount: shiftPayrollPreview.unresolvedCount,
    previewEmptyMessage,
    previewBaselineErrorMessage: shiftPayrollPreview.baselineErrorMessage,
    isOvernightDialogOpen: state.isOvernightDialogOpen,
    handleSubmit,
    handleWorkplaceChange,
    handleDateChange: (value) => updateFormField("date", value),
    handleShiftTypeChange,
    handleTimetableSetChange,
    handleStartPeriodChange: (value) => updateFormField("startPeriod", value),
    handleEndPeriodChange: (value) => updateFormField("endPeriod", value),
    handleStartTimeChange: (value) => updateFormField("startTime", value),
    handleEndTimeChange: (value) => updateFormField("endTime", value),
    handleBreakMinutesChange: (value) => updateFormField("breakMinutes", value),
    handleCommentChange: (value) => updateFormField("comment", value),
    handleCancel,
    handleOvernightDialogOpenChange,
    handleOvernightConfirm,
  };
}

function ShiftFormScreen(props: ShiftFormProps) {
  const controller = useShiftFormController(props);

  if (controller.isShiftLoading) {
    return (
      <section className="space-y-6 p-4 md:p-6">
        <header className="space-y-2">
          <h2 className="text-xl font-semibold">シフト編集</h2>
          <p className="text-sm text-muted-foreground">
            既存シフトを更新します。更新後はカレンダー画面へ戻ります。
          </p>
        </header>

        <SpinnerPanel
          className="min-h-[180px] max-w-2xl"
          label="シフト情報を読み込み中..."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6 p-4 pb-28 md:p-6 md:pb-6">
      <ShiftFormHeader mode={controller.mode} />

      <ShiftFormMessages
        formErrorMessage={controller.formErrorMessage}
        warningMessage={controller.warningMessage}
        workplacesLength={controller.workplaces.length}
        isWorkplaceLoading={controller.isWorkplaceLoading}
      />

      <ShiftFormEditor
        mode={controller.mode}
        form={controller.form}
        errors={controller.errors}
        workplaces={controller.workplaces}
        selectedWorkplace={controller.selectedWorkplace}
        selectedWorkplaceType={controller.selectedWorkplaceType}
        timetableSets={controller.timetableSets}
        isTimetableLoading={controller.isTimetableLoading}
        selectedSet={controller.selectedSet}
        lessonPeriods={controller.lessonPeriods}
        selectedStartPeriodItem={controller.selectedStartPeriodItem}
        selectedEndPeriodItem={controller.selectedEndPeriodItem}
        eventNamePreview={controller.eventNamePreview}
        disabled={controller.disabled}
        isSubmitting={controller.isSubmitting}
        onSubmit={controller.handleSubmit}
        onWorkplaceChange={controller.handleWorkplaceChange}
        onDateChange={controller.handleDateChange}
        onShiftTypeChange={controller.handleShiftTypeChange}
        onTimetableSetChange={controller.handleTimetableSetChange}
        onStartPeriodChange={controller.handleStartPeriodChange}
        onEndPeriodChange={controller.handleEndPeriodChange}
        onStartTimeChange={controller.handleStartTimeChange}
        onEndTimeChange={controller.handleEndTimeChange}
        onBreakMinutesChange={controller.handleBreakMinutesChange}
        onCommentChange={controller.handleCommentChange}
        onCancel={controller.handleCancel}
      />

      {controller.mode === "create" ? (
        <ShiftPayrollPreviewFloating
          months={controller.previewMonths}
          unresolvedCount={controller.previewUnresolvedCount}
          emptyMessage={controller.previewEmptyMessage}
          baselineErrorMessage={controller.previewBaselineErrorMessage}
        />
      ) : null}

      <ConfirmDialog
        open={controller.isOvernightDialogOpen}
        onOpenChange={controller.handleOvernightDialogOpenChange}
        title="このシフトは日付をまたぎます"
        description="終了時刻が開始時刻より早いため、翌日終了として保存します。よろしいですか？"
        confirmLabel="翌日終了として保存"
        cancelLabel="キャンセル"
        destructive={false}
        onConfirm={controller.handleOvernightConfirm}
      />
    </section>
  );
}

export function ShiftForm(props: ShiftFormProps) {
  const resetKey = props.mode === "create" ? props.initialDate : props.shiftId;
  return <ShiftFormScreen key={resetKey} {...props} />;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormErrorMessage } from "@/components/form/form-error-message";
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
  dateFromDateKey,
  dateKeyFromApiDate,
  fromMonthInputValue,
  toDateKey,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { formatShiftType } from "@/lib/enum-labels";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type ShiftType = "NORMAL" | "LESSON";
type ShiftFormMode = "create" | "edit";
type ShiftFormReturnTo = "dashboard" | "list";

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

type ShiftListItem = {
  id: string;
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
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "timetableSetId"
  | "startPeriod"
  | "endPeriod"
  | "form";

type FormErrors = Partial<Record<FormErrorKey, string>>;

type ShiftFormProps = {
  mode: ShiftFormMode;
  shiftId?: string;
  initialDate?: string;
  returnMonth?: string;
  returnTo?: ShiftFormReturnTo;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShiftWorkplaceType(value: unknown): value is Workplace["type"] {
  return value === "GENERAL" || value === "CRAM_SCHOOL";
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

function isShiftListItem(value: unknown): value is ShiftListItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
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
    lessonRange,
  };
}

function isValidDateKey(value?: string | null): value is string {
  if (!value || DATE_ONLY_REGEX.test(value) === false) {
    return false;
  }

  return dateFromDateKey(value) !== null;
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

function toMinutes(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function hasTimeOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
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

function resolveLessonTimeRange(
  timetableSet: TimetableSet | null,
  startPeriod: number,
  endPeriod: number,
): { startTime: string; endTime: string } | null {
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

  return {
    startTime,
    endTime,
  };
}

function formatCramShiftType(type: ShiftType): string {
  if (type === "NORMAL") {
    return "事務";
  }

  return formatShiftType(type);
}

export function ShiftForm({
  mode,
  shiftId,
  initialDate,
  returnMonth,
  returnTo = "dashboard",
}: ShiftFormProps) {
  const router = useRouter();

  const defaultDate = isValidDateKey(initialDate)
    ? initialDate
    : toDateKey(new Date());

  const [form, setForm] = useState<FormState>({
    workplaceId: "",
    date: defaultDate,
    shiftType: "NORMAL",
    startTime: "",
    endTime: "",
    breakMinutes: "0",
    timetableSetId: "",
    startPeriod: "",
    endPeriod: "",
  });
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [timetableSets, setTimetableSets] = useState<TimetableSet[]>([]);
  const [isWorkplaceLoading, setIsWorkplaceLoading] = useState(true);
  const [isTimetableLoading, setIsTimetableLoading] = useState(false);
  const [isShiftLoading, setIsShiftLoading] = useState(mode === "edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

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

  const selectedWorkplace = useMemo(() => {
    return workplaces.find((workplace) => workplace.id === form.workplaceId);
  }, [form.workplaceId, workplaces]);
  const selectedWorkplaceId = form.workplaceId;
  const selectedWorkplaceType = selectedWorkplace?.type;

  const selectedSet = useMemo(
    () => findSetById(timetableSets, form.timetableSetId),
    [form.timetableSetId, timetableSets],
  );

  const lessonPeriods = useMemo(() => {
    if (!selectedSet) {
      return [] as number[];
    }

    return selectedSet.items
      .map((item) => item.period)
      .sort((left, right) => left - right);
  }, [selectedSet]);

  const selectedStartPeriodItem = useMemo(
    () => findSetItemByPeriod(selectedSet, form.startPeriod),
    [form.startPeriod, selectedSet],
  );
  const selectedEndPeriodItem = useMemo(
    () => findSetItemByPeriod(selectedSet, form.endPeriod),
    [form.endPeriod, selectedSet],
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchWorkplaces() {
      setIsWorkplaceLoading(true);

      try {
        const response = await fetch("/api/workplaces?includeCounts=false", {
          signal: abortController.signal,
          cache: "no-store",
        });

        if (response.ok === false) {
          throw new Error("WORKPLACE_FETCH_FAILED");
        }

        const workplacesPayload = parseWorkplaceListResponse(
          (await response.json()) as unknown,
        );
        if (!workplacesPayload) {
          throw new Error("WORKPLACE_RESPONSE_INVALID");
        }

        setWorkplaces(workplacesPayload);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplaces", error);
        setWorkplaces([]);
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
    if (mode !== "edit") {
      setIsShiftLoading(false);
      return;
    }

    if (!shiftId) {
      setIsShiftLoading(false);
      setErrors({
        form: "編集対象のシフトIDが指定されていません。",
      });
      return;
    }

    const abortController = new AbortController();

    async function fetchShift() {
      setIsShiftLoading(true);

      try {
        const response = await fetch(`/api/shifts/${shiftId}`, {
          signal: abortController.signal,
          cache: "no-store",
        });

        if (response.ok === false) {
          const resolved = await resolveUserFacingErrorFromResponse(
            response,
            "シフトの取得に失敗しました。",
          );
          throw new Error(resolved.message);
        }

        const shift = parseShiftDetailResponse(
          (await response.json()) as unknown,
        );
        if (!shift) {
          throw new Error("シフトデータの形式が不正です");
        }

        setForm((current) => ({
          ...current,
          workplaceId: shift.workplaceId,
          date: dateKeyFromApiDate(shift.date),
          shiftType: shift.shiftType,
          startTime: toTimeOnly(shift.startTime),
          endTime: toTimeOnly(shift.endTime),
          breakMinutes: String(shift.breakMinutes),
          timetableSetId: shift.lessonRange?.timetableSetId ?? "",
          startPeriod: shift.lessonRange
            ? String(shift.lessonRange.startPeriod)
            : "",
          endPeriod: shift.lessonRange
            ? String(shift.lessonRange.endPeriod)
            : "",
        }));
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch shift", error);
        setErrors({
          form: toErrorMessage(error, "シフトの取得に失敗しました。"),
        });
      } finally {
        if (abortController.signal.aborted === false) {
          setIsShiftLoading(false);
        }
      }
    }

    void fetchShift();

    return () => {
      abortController.abort();
    };
  }, [mode, shiftId]);

  useEffect(() => {
    if (workplaces.length === 0) {
      return;
    }

    const hasCurrent = workplaces.some(
      (workplace) => workplace.id === form.workplaceId,
    );
    if (hasCurrent) {
      return;
    }

    let nextWorkplaceId = workplaces[0]?.id ?? "";

    if (mode === "create") {
      const savedId = window.localStorage.getItem(LAST_WORKPLACE_ID_KEY);
      if (savedId) {
        const exists = workplaces.some((workplace) => workplace.id === savedId);
        if (exists) {
          nextWorkplaceId = savedId;
        }
      }
    }

    setForm((current) => ({
      ...current,
      workplaceId: nextWorkplaceId,
    }));
  }, [form.workplaceId, mode, workplaces]);

  useEffect(() => {
    if (!selectedWorkplaceId || selectedWorkplaceType !== "CRAM_SCHOOL") {
      setTimetableSets([]);

      setForm((current) => {
        if (
          current.shiftType === "NORMAL" &&
          !current.timetableSetId &&
          !current.startPeriod &&
          !current.endPeriod
        ) {
          return current;
        }

        return {
          ...current,
          shiftType: "NORMAL",
          timetableSetId: "",
          startPeriod: "",
          endPeriod: "",
        };
      });
      return;
    }

    const abortController = new AbortController();

    async function fetchTimetableSets() {
      setIsTimetableLoading(true);

      try {
        const response = await fetch(
          `/api/workplaces/${selectedWorkplaceId}/timetables`,
          {
            signal: abortController.signal,
            cache: "no-store",
          },
        );

        if (response.ok === false) {
          throw new Error("TIMETABLE_FETCH_FAILED");
        }

        const payload = parseTimetableSetListResponse(
          (await response.json()) as unknown,
        );
        if (!payload) {
          throw new Error("TIMETABLE_RESPONSE_INVALID");
        }

        const sorted = payload.slice().sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          return left.createdAt.localeCompare(right.createdAt);
        });

        setTimetableSets(sorted);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetable sets", error);
        setTimetableSets([]);
      } finally {
        if (abortController.signal.aborted === false) {
          setIsTimetableLoading(false);
        }
      }
    }

    void fetchTimetableSets();

    return () => {
      abortController.abort();
    };
  }, [selectedWorkplaceId, selectedWorkplaceType]);

  useEffect(() => {
    if (
      mode !== "create" ||
      selectedWorkplaceType !== "CRAM_SCHOOL" ||
      !selectedWorkplaceId
    ) {
      return;
    }

    setForm((current) => {
      if (current.shiftType === "LESSON") {
        return current;
      }

      return {
        ...current,
        shiftType: "LESSON",
      };
    });
  }, [mode, selectedWorkplaceId, selectedWorkplaceType]);

  useEffect(() => {
    if (selectedWorkplaceType !== "CRAM_SCHOOL") {
      return;
    }

    setForm((current) => {
      if (current.shiftType !== "LESSON") {
        return current;
      }

      const nextSetId =
        current.timetableSetId &&
        findSetById(timetableSets, current.timetableSetId)
          ? current.timetableSetId
          : (timetableSets[0]?.id ?? "");

      if (!nextSetId) {
        if (
          !current.timetableSetId &&
          !current.startPeriod &&
          !current.endPeriod
        ) {
          return current;
        }

        return {
          ...current,
          timetableSetId: "",
          startPeriod: "",
          endPeriod: "",
        };
      }

      const nextSet = findSetById(timetableSets, nextSetId);
      const periods = (nextSet?.items ?? [])
        .map((item) => item.period)
        .sort((left, right) => left - right);
      const first = periods[0] ? String(periods[0]) : "";
      const last = periods[periods.length - 1]
        ? String(periods[periods.length - 1])
        : "";

      const hasStart = periods.includes(Number(current.startPeriod));
      const hasEnd = periods.includes(Number(current.endPeriod));
      const nextStart = hasStart ? current.startPeriod : first;
      const nextEnd = hasEnd ? current.endPeriod : last;

      if (
        nextSetId === current.timetableSetId &&
        nextStart === current.startPeriod &&
        nextEnd === current.endPeriod
      ) {
        return current;
      }

      return {
        ...current,
        timetableSetId: nextSetId,
        startPeriod: nextStart,
        endPeriod: nextEnd,
      };
    });
  }, [selectedWorkplaceType, timetableSets]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validate(): {
    errors: FormErrors;
    candidateTimes: { startTime: string; endTime: string } | null;
  } {
    const nextErrors: FormErrors = {};

    if (!form.workplaceId) {
      nextErrors.workplaceId = "ERR_001: 勤務先は必須項目です";
    }

    if (!form.date) {
      nextErrors.date = "ERR_001: 日付は必須項目です";
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

    if (form.startTime && form.endTime) {
      if (toMinutes(form.startTime) >= toMinutes(form.endTime)) {
        nextErrors.endTime = "ERR_002: 開始時刻は終了時刻より前にしてください";
      }
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

  async function checkOverlapWarning(candidateTimes: {
    startTime: string;
    endTime: string;
  }): Promise<string | null> {
    if (!form.workplaceId || !form.date) {
      return null;
    }

    try {
      const params = new URLSearchParams({
        workplaceId: form.workplaceId,
        startDate: form.date,
        endDate: form.date,
      });

      const response = await fetch(`/api/shifts?${params.toString()}`, {
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

      const candidateStart = toMinutes(candidateTimes.startTime);
      const candidateEnd = toMinutes(candidateTimes.endTime);

      const overlapped = shiftsPayload.some((shift) => {
        if (mode === "edit" && shift.id === shiftId) {
          return false;
        }

        const shiftStart = toMinutes(toTimeOnly(shift.startTime));
        const shiftEnd = toMinutes(toTimeOnly(shift.endTime));

        return hasTimeOverlap(
          candidateStart,
          candidateEnd,
          shiftStart,
          shiftEnd,
        );
      });

      if (overlapped) {
        return "ERR_003: この日付にはすでにシフトが登録されています";
      }

      return null;
    } catch (error) {
      console.error("failed to check overlap", error);
      return null;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setWarningMessage(null);
    setErrors((current) => {
      if (!current.form) {
        return current;
      }

      const next = { ...current };
      delete next.form;
      return next;
    });

    const validation = validate();
    if (
      Object.keys(validation.errors).length > 0 ||
      !validation.candidateTimes
    ) {
      setErrors(validation.errors);
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

    if (mode === "edit" && !shiftId) {
      setErrors({
        form: "編集対象のシフトIDが指定されていません。",
      });
      return;
    }

    const breakMinutes = Number(form.breakMinutes);

    const effectiveShiftType: ShiftType =
      selectedWorkplaceType === "CRAM_SCHOOL" && form.shiftType === "LESSON"
        ? "LESSON"
        : "NORMAL";

    const payload: {
      workplaceId: string;
      date: string;
      shiftType: ShiftType;
      startTime?: string;
      endTime?: string;
      breakMinutes: number;
      lessonRange?: {
        timetableSetId: string;
        startPeriod: number;
        endPeriod: number;
      };
    } = {
      workplaceId: form.workplaceId,
      date: form.date,
      shiftType: effectiveShiftType,
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

    setIsSubmitting(true);
    const loadingToastId = toast.loading("シフトを保存中です...");

    try {
      const overlapMessage = await checkOverlapWarning(
        validation.candidateTimes,
      );
      if (overlapMessage) {
        setWarningMessage(overlapMessage);
        toast.warning(messages.warning.shiftOverlap, {
          description: overlapMessage,
          duration: 6000,
        });
      }

      const endpoint =
        mode === "create" ? "/api/shifts" : `/api/shifts/${shiftId}`;
      const method = mode === "create" ? "POST" : "PUT";

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
      const syncFailure = parseGoogleSyncFailureFromPayload(
        responsePayload,
        messages.error.calendarSyncFailed,
      );

      window.localStorage.setItem(LAST_WORKPLACE_ID_KEY, form.workplaceId);

      if (syncFailure) {
        toast.error(messages.error.calendarSyncFailed, {
          id: loadingToastId,
          description: syncFailure.requiresCalendarSetup
            ? syncFailure.message
            : `${syncFailure.message} シフトは保存済みです。`,
          duration: 6000,
        });

        if (syncFailure.requiresCalendarSetup) {
          router.push(CALENDAR_SETUP_PATH);
          return;
        }

        router.push(returnPath);
        return;
      }

      toast.success(
        mode === "create"
          ? messages.success.shiftCreated
          : messages.success.shiftUpdated,
        {
          id: loadingToastId,
          description: `${form.date} ${validation.candidateTimes.startTime} - ${validation.candidateTimes.endTime}`,
        },
      );
      router.push(returnPath);
    } catch (error) {
      console.error("failed to save shift", error);
      const message = toErrorMessage(error, messages.error.shiftSaveFailed);
      setErrors((current) => ({
        ...current,
        form: message,
      }));
      toast.error(messages.error.shiftSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const showShiftTypeSelector = selectedWorkplaceType === "CRAM_SCHOOL";
  const showLessonFields = showShiftTypeSelector && form.shiftType === "LESSON";
  const disabled =
    isSubmitting ||
    isWorkplaceLoading ||
    isShiftLoading ||
    workplaces.length === 0;

  if (isShiftLoading) {
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
    <section className="space-y-6 p-4 md:p-6">
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

      {errors.form ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.form}
        </p>
      ) : null}

      {warningMessage ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          {warningMessage}
        </p>
      ) : null}

      {workplaces.length === 0 && !isWorkplaceLoading ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          勤務先が未登録です。先に勤務先を作成してください。
        </p>
      ) : null}

      <Form className="max-w-sm" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.workplaceId)}>
            <FieldLabel>勤務先</FieldLabel>
            <FieldContent>
              <Select
                value={form.workplaceId}
                onValueChange={(value) =>
                  updateForm("workplaceId", value ?? "")
                }
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
                onValueChange={(value) => updateForm("date", value)}
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
                  onValueChange={(value) => {
                    const nextType = value as ShiftType;
                    setWarningMessage(null);
                    setErrors({});
                    setForm((current) => ({
                      ...current,
                      shiftType: nextType,
                    }));
                  }}
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

          {showLessonFields ? (
            <>
              <Field data-invalid={Boolean(errors.timetableSetId)}>
                <FieldLabel>時間割セット</FieldLabel>
                <FieldContent>
                  <Select
                    value={form.timetableSetId}
                    onValueChange={(value) => {
                      const nextSetId = value ?? "";
                      const nextSet = findSetById(timetableSets, nextSetId);
                      const periods = (nextSet?.items ?? [])
                        .map((item) => item.period)
                        .sort((left, right) => left - right);
                      const first = periods[0] ? String(periods[0]) : "";
                      const last = periods[periods.length - 1]
                        ? String(periods[periods.length - 1])
                        : "";

                      setForm((current) => ({
                        ...current,
                        timetableSetId: nextSetId,
                        startPeriod: first,
                        endPeriod: last,
                      }));
                      setErrors((current) => ({
                        ...current,
                        timetableSetId: undefined,
                        startPeriod: undefined,
                        endPeriod: undefined,
                      }));
                    }}
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
                      onValueChange={(value) =>
                        updateForm("startPeriod", value ?? "")
                      }
                      disabled={
                        disabled ||
                        isTimetableLoading ||
                        lessonPeriods.length === 0
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
                      onValueChange={(value) =>
                        updateForm("endPeriod", value ?? "")
                      }
                      disabled={
                        disabled ||
                        isTimetableLoading ||
                        lessonPeriods.length === 0
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
          ) : (
            <>
              <Field data-invalid={Boolean(errors.startTime)}>
                <FieldLabel htmlFor="shift-start-time">開始時刻</FieldLabel>
                <FieldContent>
                  <TimePicker
                    id="shift-start-time"
                    value={form.startTime}
                    onValueChange={(value) => updateForm("startTime", value)}
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
                    onValueChange={(value) => updateForm("endTime", value)}
                    disabled={disabled}
                    className="max-w-24"
                  />
                  <FormErrorMessage message={errors.endTime} />
                </FieldContent>
              </Field>
            </>
          )}

          {showLessonFields ? null : (
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
                      updateForm("breakMinutes", event.currentTarget.value)
                    }
                    disabled={disabled}
                    className="max-w-14"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">
                    分
                  </span>
                </div>
                <FormErrorMessage message={errors.breakMinutes} />
              </FieldContent>
            </Field>
          )}
        </FieldGroup>

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
            onClick={() => router.push(returnPath)}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
        </div>
      </Form>
    </section>
  );
}

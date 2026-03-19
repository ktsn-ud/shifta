"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
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
import { Skeleton } from "@/components/ui/skeleton";
import { TimePicker } from "@/components/ui/time-picker";
import {
  dateFromDateKey,
  dateKeyFromApiDate,
  toDateKey,
} from "@/lib/calendar/date";
import { formatLessonType, formatShiftType } from "@/lib/enum-labels";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const workplaceListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    }),
  ),
});

const timetableListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["NORMAL", "INTENSIVE"]),
      period: z.number().int().positive(),
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
});

const shiftListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
});

const shiftDetailResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    workplaceId: z.string(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    breakMinutes: z.number().int().nonnegative(),
    shiftType: z.enum(["NORMAL", "LESSON", "OTHER"]),
    lessonRange: z
      .object({
        startPeriod: z.number().int().positive(),
        endPeriod: z.number().int().positive(),
      })
      .nullable(),
  }),
});

type Workplace = z.infer<typeof workplaceListResponseSchema>["data"][number];
type Timetable = z.infer<typeof timetableListResponseSchema>["data"][number];
type ShiftType = "NORMAL" | "LESSON" | "OTHER";
type LessonType = "NORMAL" | "INTENSIVE";
type ShiftFormMode = "create" | "edit";

type FormState = {
  workplaceId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  lessonType: LessonType;
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
  | "lessonType"
  | "startPeriod"
  | "endPeriod"
  | "form";

type FormErrors = Partial<Record<FormErrorKey, string>>;

type ShiftFormProps = {
  mode: ShiftFormMode;
  shiftId?: string;
  initialDate?: string;
};

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

function resolveLessonTimeRange(
  timetables: Timetable[],
  lessonType: LessonType,
  startPeriod: number,
  endPeriod: number,
): { startTime: string; endTime: string } | null {
  const timetableByPeriod = new Map<number, Timetable>();

  for (const timetable of timetables) {
    if (timetable.type === lessonType) {
      timetableByPeriod.set(timetable.period, timetable);
    }
  }

  for (let period = startPeriod; period <= endPeriod; period += 1) {
    if (timetableByPeriod.has(period) === false) {
      return null;
    }
  }

  const first = timetableByPeriod.get(startPeriod);
  const last = timetableByPeriod.get(endPeriod);

  if (!first || !last) {
    return null;
  }

  const startTime = toTimeOnly(first.startTime);
  const endTime = toTimeOnly(last.endTime);

  if (!startTime || !endTime) {
    return null;
  }

  return {
    startTime,
    endTime,
  };
}

function inferLessonType(
  timetables: Timetable[],
  startPeriod: number,
  endPeriod: number,
  expectedStartTime: string,
  expectedEndTime: string,
): LessonType {
  const lessonTypes: LessonType[] = ["NORMAL", "INTENSIVE"];

  for (const lessonType of lessonTypes) {
    const resolved = resolveLessonTimeRange(
      timetables,
      lessonType,
      startPeriod,
      endPeriod,
    );

    if (!resolved) {
      continue;
    }

    if (
      resolved.startTime === expectedStartTime &&
      resolved.endTime === expectedEndTime
    ) {
      return lessonType;
    }
  }

  return "NORMAL";
}

export function ShiftForm({ mode, shiftId, initialDate }: ShiftFormProps) {
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
    lessonType: "NORMAL",
    startPeriod: "",
    endPeriod: "",
  });
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [isWorkplaceLoading, setIsWorkplaceLoading] = useState(true);
  const [isTimetableLoading, setIsTimetableLoading] = useState(false);
  const [isShiftLoading, setIsShiftLoading] = useState(mode === "edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [loadedLessonTime, setLoadedLessonTime] = useState<{
    startTime: string;
    endTime: string;
  } | null>(null);
  const [isLessonTypeInferred, setIsLessonTypeInferred] = useState(false);

  const selectedWorkplace = useMemo(() => {
    return workplaces.find((workplace) => workplace.id === form.workplaceId);
  }, [form.workplaceId, workplaces]);
  const selectedWorkplaceId = selectedWorkplace?.id;
  const selectedWorkplaceType = selectedWorkplace?.type;

  const lessonPeriods = useMemo(() => {
    return timetables
      .filter((timetable) => timetable.type === form.lessonType)
      .map((timetable) => timetable.period)
      .sort((left, right) => left - right);
  }, [form.lessonType, timetables]);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchWorkplaces() {
      setIsWorkplaceLoading(true);

      try {
        const response = await fetch("/api/workplaces", {
          signal: abortController.signal,
          cache: "no-store",
        });

        if (response.ok === false) {
          throw new Error("WORKPLACE_FETCH_FAILED");
        }

        const payload = workplaceListResponseSchema.safeParse(
          (await response.json()) as unknown,
        );

        if (payload.success === false) {
          throw new Error("WORKPLACE_RESPONSE_INVALID");
        }

        setWorkplaces(payload.data.data);
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
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "シフトの取得に失敗しました");
        }

        const payload = shiftDetailResponseSchema.safeParse(
          (await response.json()) as unknown,
        );

        if (payload.success === false) {
          throw new Error("シフトデータの形式が不正です");
        }

        const shift = payload.data.data;

        setForm((current) => ({
          ...current,
          workplaceId: shift.workplaceId,
          date: dateKeyFromApiDate(shift.date),
          shiftType: shift.shiftType,
          startTime: toTimeOnly(shift.startTime),
          endTime: toTimeOnly(shift.endTime),
          breakMinutes: String(shift.breakMinutes),
          lessonType: "NORMAL",
          startPeriod: shift.lessonRange
            ? String(shift.lessonRange.startPeriod)
            : "",
          endPeriod: shift.lessonRange
            ? String(shift.lessonRange.endPeriod)
            : "",
        }));

        setLoadedLessonTime(
          shift.shiftType === "LESSON"
            ? {
                startTime: toTimeOnly(shift.startTime),
                endTime: toTimeOnly(shift.endTime),
              }
            : null,
        );
        setIsLessonTypeInferred(false);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch shift", error);
        setErrors({
          form:
            error instanceof Error
              ? error.message
              : "シフトの取得に失敗しました。",
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
      setTimetables([]);

      setForm((current) => {
        if (current.shiftType !== "LESSON") {
          return current;
        }

        return {
          ...current,
          shiftType: "NORMAL",
          startPeriod: "",
          endPeriod: "",
        };
      });
      return;
    }

    const abortController = new AbortController();

    async function fetchTimetables() {
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

        const payload = timetableListResponseSchema.safeParse(
          (await response.json()) as unknown,
        );

        if (payload.success === false) {
          throw new Error("TIMETABLE_RESPONSE_INVALID");
        }

        setTimetables(payload.data.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetables", error);
        setTimetables([]);
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
  }, [selectedWorkplaceId, selectedWorkplaceType]);

  useEffect(() => {
    if (
      mode !== "edit" ||
      form.shiftType !== "LESSON" ||
      !loadedLessonTime ||
      isLessonTypeInferred
    ) {
      return;
    }

    const startPeriod = Number(form.startPeriod);
    const endPeriod = Number(form.endPeriod);
    if (
      Number.isFinite(startPeriod) === false ||
      Number.isFinite(endPeriod) === false
    ) {
      return;
    }

    const lessonType = inferLessonType(
      timetables,
      startPeriod,
      endPeriod,
      loadedLessonTime.startTime,
      loadedLessonTime.endTime,
    );

    setForm((current) => ({
      ...current,
      lessonType,
    }));
    setIsLessonTypeInferred(true);
  }, [
    form.endPeriod,
    form.shiftType,
    form.startPeriod,
    isLessonTypeInferred,
    loadedLessonTime,
    mode,
    timetables,
  ]);

  useEffect(() => {
    if (form.shiftType !== "LESSON") {
      return;
    }

    if (lessonPeriods.length === 0) {
      if (!form.startPeriod && !form.endPeriod) {
        return;
      }

      setForm((current) => ({
        ...current,
        startPeriod: "",
        endPeriod: "",
      }));
      return;
    }

    const first = String(lessonPeriods[0]);
    const last = String(lessonPeriods[lessonPeriods.length - 1]);

    setForm((current) => {
      const hasStart = lessonPeriods.includes(Number(current.startPeriod));
      const hasEnd = lessonPeriods.includes(Number(current.endPeriod));
      const nextStart = hasStart ? current.startPeriod : first;
      const nextEnd = hasEnd ? current.endPeriod : last;

      if (nextStart === current.startPeriod && nextEnd === current.endPeriod) {
        return current;
      }

      return {
        ...current,
        startPeriod: nextStart,
        endPeriod: nextEnd,
      };
    });
  }, [form.endPeriod, form.shiftType, form.startPeriod, lessonPeriods]);

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

    const breakMinutes = Number(form.breakMinutes);
    if (Number.isFinite(breakMinutes) === false || breakMinutes < 0) {
      nextErrors.breakMinutes = "休憩時間は0以上で入力してください";
    }

    if (breakMinutes > 240) {
      nextErrors.breakMinutes = "休憩時間は240分以下で入力してください";
    }

    if (form.shiftType === "LESSON") {
      if (!form.lessonType) {
        nextErrors.lessonType = "ERR_001: コマ種別は必須項目です";
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

      if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
        nextErrors.shiftType = "授業シフトは塾タイプ勤務先でのみ選択できます";
      }

      const hasTimetables = timetables.length > 0;
      if (!hasTimetables) {
        nextErrors.lessonType = "ERR_004: 塾の授業は時間割が登録されていません";
      }

      const resolved =
        Number.isFinite(startPeriod) &&
        Number.isFinite(endPeriod) &&
        startPeriod <= endPeriod
          ? resolveLessonTimeRange(
              timetables,
              form.lessonType,
              startPeriod,
              endPeriod,
            )
          : null;

      if (!resolved && hasTimetables && !nextErrors.endPeriod) {
        nextErrors.endPeriod =
          "ERR_004: 選択したコマ範囲の時間割が登録されていません";
      }

      return {
        errors: nextErrors,
        candidateTimes: resolved,
      };
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

      const payload = shiftListResponseSchema.safeParse(
        (await response.json()) as unknown,
      );

      if (payload.success === false) {
        return null;
      }

      const candidateStart = toMinutes(candidateTimes.startTime);
      const candidateEnd = toMinutes(candidateTimes.endTime);

      const overlapped = payload.data.data.some((shift) => {
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

    const payload: {
      workplaceId: string;
      date: string;
      shiftType: ShiftType;
      startTime?: string;
      endTime?: string;
      breakMinutes: number;
      lessonRange?: {
        lessonType: LessonType;
        startPeriod: number;
        endPeriod: number;
      };
    } = {
      workplaceId: form.workplaceId,
      date: form.date,
      shiftType: form.shiftType,
      breakMinutes: Number.isNaN(breakMinutes) ? 0 : breakMinutes,
    };

    if (form.shiftType === "LESSON") {
      payload.lessonRange = {
        lessonType: form.lessonType,
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

        router.push("/my/calendar");
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
      router.push("/my/calendar");
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

  const showLessonFields = form.shiftType === "LESSON";
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

        <div className="flex max-w-2xl flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
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

      <Form className="max-w-2xl" onSubmit={handleSubmit}>
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
                <SelectTrigger className="w-full">
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
              />
              <FormErrorMessage message={errors.date} />
            </FieldContent>
          </Field>

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
                  <FieldLabel htmlFor="shift-type-normal">
                    {formatShiftType("NORMAL")}
                  </FieldLabel>
                  <RadioGroupItem
                    id="shift-type-normal"
                    value="NORMAL"
                    disabled={disabled}
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-type-lesson">
                    {formatShiftType("LESSON")}
                  </FieldLabel>
                  <RadioGroupItem
                    id="shift-type-lesson"
                    value="LESSON"
                    disabled={
                      disabled || selectedWorkplace?.type !== "CRAM_SCHOOL"
                    }
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-type-other">
                    {formatShiftType("OTHER")}
                  </FieldLabel>
                  <RadioGroupItem
                    id="shift-type-other"
                    value="OTHER"
                    disabled={disabled}
                  />
                </Field>
              </RadioGroup>
              <FieldDescription>
                授業は塾タイプ勤務先選択時のみ有効です。
              </FieldDescription>
              <FormErrorMessage message={errors.shiftType} />
            </FieldContent>
          </Field>

          {showLessonFields ? (
            <>
              <Field data-invalid={Boolean(errors.lessonType)}>
                <FieldLabel>コマ種別</FieldLabel>
                <FieldContent>
                  <RadioGroup
                    value={form.lessonType}
                    onValueChange={(value) => {
                      setIsLessonTypeInferred(true);
                      updateForm("lessonType", value as LessonType);
                    }}
                    disabled={disabled || isTimetableLoading}
                  >
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="lesson-type-normal">
                        {formatLessonType("NORMAL")}
                      </FieldLabel>
                      <RadioGroupItem
                        id="lesson-type-normal"
                        value="NORMAL"
                        disabled={disabled || isTimetableLoading}
                      />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="lesson-type-intensive">
                        {formatLessonType("INTENSIVE")}
                      </FieldLabel>
                      <RadioGroupItem
                        id="lesson-type-intensive"
                        value="INTENSIVE"
                        disabled={disabled || isTimetableLoading}
                      />
                    </Field>
                  </RadioGroup>
                  <FormErrorMessage message={errors.lessonType} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.startPeriod)}>
                <FieldLabel>開始コマ</FieldLabel>
                <FieldContent>
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
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="開始コマを選択" />
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
                  <FormErrorMessage message={errors.startPeriod} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.endPeriod)}>
                <FieldLabel>終了コマ</FieldLabel>
                <FieldContent>
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
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="終了コマを選択" />
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
                  />
                  <FormErrorMessage message={errors.endTime} />
                </FieldContent>
              </Field>
            </>
          )}

          <Field data-invalid={Boolean(errors.breakMinutes)}>
            <FieldLabel htmlFor="shift-break-minutes">休憩時間 (分)</FieldLabel>
            <FieldContent>
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
              />
              <FormErrorMessage message={errors.breakMinutes} />
            </FieldContent>
          </Field>
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
            onClick={() => router.push("/my/calendar")}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
        </div>
      </Form>
    </section>
  );
}

export type { ShiftFormMode, ShiftFormProps };

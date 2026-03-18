"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { TimePicker } from "@/components/ui/time-picker";
import { dateFromDateKey, toDateKey } from "@/lib/calendar/date";

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

type Workplace = z.infer<typeof workplaceListResponseSchema>["data"][number];
type Timetable = z.infer<typeof timetableListResponseSchema>["data"][number];
type ShiftType = "NORMAL" | "LESSON" | "OTHER";
type LessonType = "NORMAL" | "INTENSIVE";

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

function isValidDateKey(value: string | null): value is string {
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

export default function NewShiftPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dateParam = searchParams.get("date");
  const defaultDate = isValidDateKey(dateParam)
    ? dateParam
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const selectedWorkplace = useMemo(() => {
    return workplaces.find((workplace) => workplace.id === form.workplaceId);
  }, [form.workplaceId, workplaces]);

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
    if (workplaces.length === 0) {
      return;
    }

    const hasCurrent = workplaces.some(
      (workplace) => workplace.id === form.workplaceId,
    );
    if (hasCurrent) {
      return;
    }

    let initialWorkplaceId = workplaces[0]?.id ?? "";

    const savedId = window.localStorage.getItem(LAST_WORKPLACE_ID_KEY);
    if (savedId) {
      const exists = workplaces.some((workplace) => workplace.id === savedId);
      if (exists) {
        initialWorkplaceId = savedId;
      }
    }

    setForm((current) => ({
      ...current,
      workplaceId: initialWorkplaceId,
    }));
  }, [form.workplaceId, workplaces]);

  useEffect(() => {
    if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
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
          `/api/workplaces/${selectedWorkplace.id}/timetables`,
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
  }, [selectedWorkplace?.id, selectedWorkplace?.type]);

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
        nextErrors.shiftType =
          "LESSON型は CRAM_SCHOOL 勤務先でのみ選択できます";
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

    try {
      const overlapMessage = await checkOverlapWarning(
        validation.candidateTimes,
      );
      if (overlapMessage) {
        setWarningMessage(overlapMessage);
      }

      const response = await fetch("/api/shifts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok === false) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "シフトの登録に失敗しました");
      }

      window.localStorage.setItem(LAST_WORKPLACE_ID_KEY, form.workplaceId);
      router.push("/my/calendar");
    } catch (error) {
      console.error("failed to create shift", error);
      setErrors((current) => ({
        ...current,
        form:
          error instanceof Error
            ? error.message
            : "シフトの登録に失敗しました。",
      }));
    } finally {
      setIsSubmitting(false);
    }
  }

  const showLessonFields = form.shiftType === "LESSON";

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">シフト入力</h2>
        <p className="text-sm text-muted-foreground">
          新しいシフトを登録します。登録後はカレンダー画面へ戻ります。
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
                onValueChange={(value) => updateForm("workplaceId", value)}
                disabled={isWorkplaceLoading || workplaces.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="勤務先を選択" />
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
                  <FieldLabel htmlFor="shift-type-normal">NORMAL</FieldLabel>
                  <RadioGroupItem id="shift-type-normal" value="NORMAL" />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-type-lesson">LESSON</FieldLabel>
                  <RadioGroupItem
                    id="shift-type-lesson"
                    value="LESSON"
                    disabled={selectedWorkplace?.type !== "CRAM_SCHOOL"}
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-type-other">OTHER</FieldLabel>
                  <RadioGroupItem id="shift-type-other" value="OTHER" />
                </Field>
              </RadioGroup>
              <FieldDescription>
                LESSON は CRAM_SCHOOL 勤務先選択時のみ有効です。
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
                      updateForm("lessonType", value as LessonType);
                    }}
                    disabled={isTimetableLoading}
                  >
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="lesson-type-normal">
                        NORMAL
                      </FieldLabel>
                      <RadioGroupItem id="lesson-type-normal" value="NORMAL" />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="lesson-type-intensive">
                        INTENSIVE
                      </FieldLabel>
                      <RadioGroupItem
                        id="lesson-type-intensive"
                        value="INTENSIVE"
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
                    onValueChange={(value) => updateForm("startPeriod", value)}
                    disabled={isTimetableLoading || lessonPeriods.length === 0}
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
                    onValueChange={(value) => updateForm("endPeriod", value)}
                    disabled={isTimetableLoading || lessonPeriods.length === 0}
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
              />
              <FormErrorMessage message={errors.breakMinutes} />
            </FieldContent>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={
              isSubmitting || isWorkplaceLoading || workplaces.length === 0
            }
          >
            {isSubmitting ? "登録中..." : "登録"}
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

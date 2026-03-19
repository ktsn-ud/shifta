"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
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
import { TIME_ONLY_REGEX, toMinutes } from "@/lib/api/date-time";
import {
  addMonths,
  dateFromDateKey,
  formatMonthLabel,
  toDateKey,
} from "@/lib/calendar/date";
import { formatLessonType, formatShiftType } from "@/lib/enum-labels";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";
import { cn } from "@/lib/utils";

const LAST_WORKPLACE_ID_KEY = "shifta:last-workplace-id";
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DAY_CELL_COUNT = 42;
const MAX_BREAK_MINUTES = 240;

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

type ShiftType = "NORMAL" | "LESSON" | "OTHER";
type LessonType = "NORMAL" | "INTENSIVE";

type Workplace = z.infer<typeof workplaceListResponseSchema>["data"][number];
type Timetable = z.infer<typeof timetableListResponseSchema>["data"][number];

type BulkShiftRow = {
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  lessonType: LessonType;
  startPeriod: string;
  endPeriod: string;
};

type BulkDefaults = Omit<BulkShiftRow, "date">;

type RowErrorKey =
  | "shiftType"
  | "startTime"
  | "endTime"
  | "breakMinutes"
  | "lessonType"
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

type NormalOrOtherShiftPayload = {
  date: string;
  shiftType: "NORMAL" | "OTHER";
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

type LessonShiftPayload = {
  date: string;
  shiftType: "LESSON";
  breakMinutes: number;
  lessonRange: {
    lessonType: LessonType;
    startPeriod: number;
    endPeriod: number;
  };
};

type BulkShiftPayload = NormalOrOtherShiftPayload | LessonShiftPayload;

const DEFAULT_BULK_VALUES: BulkDefaults = {
  shiftType: "NORMAL",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: "0",
  lessonType: "NORMAL",
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
    lessonType: defaults.lessonType,
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
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [selectedDateKeys, setSelectedDateKeys] = useState<string[]>([]);
  const [rowsByDate, setRowsByDate] = useState<Record<string, BulkShiftRow>>(
    {},
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

  const lessonPeriodsByType = useMemo(() => {
    const map = {
      NORMAL: [] as number[],
      INTENSIVE: [] as number[],
    };

    for (const timetable of timetables) {
      map[timetable.type].push(timetable.period);
    }

    map.NORMAL.sort((left, right) => left - right);
    map.INTENSIVE.sort((left, right) => left - right);

    return map;
  }, [timetables]);

  const calendarCells = useMemo(() => {
    return toMonthGrid(month);
  }, [month]);

  const selectedRows = useMemo(() => {
    return selectedDateKeys
      .map((dateKey) => rowsByDate[dateKey])
      .filter((row): row is BulkShiftRow => Boolean(row));
  }, [rowsByDate, selectedDateKeys]);

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
          throw new Error("勤務先一覧の取得に失敗しました。");
        }

        const payload = workplaceListResponseSchema.safeParse(
          (await response.json()) as unknown,
        );

        if (payload.success === false) {
          throw new Error("勤務先一覧レスポンスの形式が不正です。");
        }

        const nextWorkplaces = payload.data.data;
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
    if (!selectedWorkplaceId) {
      return;
    }

    localStorage.setItem(LAST_WORKPLACE_ID_KEY, selectedWorkplaceId);
  }, [selectedWorkplaceId]);

  useEffect(() => {
    if (!selectedWorkplace) {
      setTimetables([]);
      return;
    }

    if (selectedWorkplace.type !== "CRAM_SCHOOL") {
      setTimetables([]);
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
            cache: "no-store",
          },
        );

        if (response.ok === false) {
          throw new Error("時間割の取得に失敗しました。");
        }

        const payload = timetableListResponseSchema.safeParse(
          (await response.json()) as unknown,
        );

        if (payload.success === false) {
          throw new Error("時間割レスポンスの形式が不正です。");
        }

        setTimetables(payload.data.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetables", error);
        setTimetables([]);
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
      if (current.shiftType !== "LESSON") {
        return current;
      }

      const periods = lessonPeriodsByType[current.lessonType];
      if (periods.length === 0) {
        return {
          ...current,
          startPeriod: "",
          endPeriod: "",
        };
      }

      const fallback = String(periods[0]);
      return {
        ...current,
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

        const periods = lessonPeriodsByType[row.lessonType];
        const fallback = periods[0] ? String(periods[0]) : "";

        next[dateKey] = {
          ...row,
          startPeriod: row.startPeriod || fallback,
          endPeriod: row.endPeriod || fallback,
        };
      }

      return next;
    });
  }, [lessonPeriodsByType, selectedWorkplace?.type]);

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

      const breakMinutes = Number(row.breakMinutes);
      if (!Number.isInteger(breakMinutes)) {
        rowErrors.breakMinutes = "休憩時間は整数で入力してください。";
      } else if (breakMinutes < 0 || breakMinutes > MAX_BREAK_MINUTES) {
        rowErrors.breakMinutes = "休憩時間は0〜240分で入力してください。";
      }

      if (row.shiftType === "LESSON") {
        if (selectedWorkplace?.type !== "CRAM_SCHOOL") {
          rowErrors.shiftType =
            "授業シフトは塾タイプ勤務先でのみ選択できます。";
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

        const periods = lessonPeriodsByType[row.lessonType];
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
            breakMinutes,
            lessonRange: {
              lessonType: row.lessonType,
              startPeriod,
              endPeriod,
            },
          });
        }
      } else {
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
      };
      const createdCount = payload.summary?.total ?? validated.payload.length;

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

        router.push("/my/calendar");
        router.refresh();
        return;
      }

      toast.success(messages.success.shiftsBulkCreated(createdCount), {
        id: loadingToastId,
      });
      router.push("/my/calendar");
      router.refresh();
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
            <div className="flex max-w-md flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
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

          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-3 py-2 md:px-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonth((current) => addMonths(current, -1))}
              >
                <ChevronLeftIcon className="size-4" />
                前月
              </Button>
              <p className="text-sm font-semibold">{formatMonthLabel(month)}</p>
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
                      "relative min-h-16 border-b border-r p-1 text-sm last:border-r-0 md:min-h-20",
                      cell.isCurrentMonth
                        ? "cursor-pointer hover:bg-muted/50"
                        : "cursor-not-allowed bg-muted/20 text-muted-foreground/60",
                      isSelected &&
                        "bg-primary/15 font-semibold text-primary ring-1 ring-primary/40",
                    )}
                    disabled={cell.isCurrentMonth === false}
                  >
                    {isToday ? (
                      <span className="pointer-events-none absolute top-1 right-1 size-2 rounded-full bg-primary" />
                    ) : null}
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

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

                    const periods = lessonPeriodsByType[defaults.lessonType];
                    const fallbackPeriod = periods[0] ? String(periods[0]) : "";

                    setDefaults((current) => ({
                      ...current,
                      shiftType,
                      ...(shiftType === "LESSON"
                        ? {
                            startPeriod: current.startPeriod || fallbackPeriod,
                            endPeriod: current.endPeriod || fallbackPeriod,
                          }
                        : {}),
                    }));
                  }}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="NORMAL" id="default-shift-normal" />
                    <FieldLabel htmlFor="default-shift-normal">
                      {formatShiftType("NORMAL")}
                    </FieldLabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="LESSON"
                      id="default-shift-lesson"
                      disabled={selectedWorkplace?.type !== "CRAM_SCHOOL"}
                    />
                    <FieldLabel htmlFor="default-shift-lesson">
                      {formatShiftType("LESSON")}
                    </FieldLabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="OTHER" id="default-shift-other" />
                    <FieldLabel htmlFor="default-shift-other">
                      {formatShiftType("OTHER")}
                    </FieldLabel>
                  </div>
                </RadioGroup>
              </FieldContent>
            </Field>

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
                      setDefaults((current) => ({
                        ...current,
                        breakMinutes: event.currentTarget.value,
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
          </FieldGroup>

          {defaults.shiftType === "LESSON" ? (
            <FieldGroup className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>デフォルトコマ種別</FieldLabel>
                <FieldContent>
                  <RadioGroup
                    value={defaults.lessonType}
                    onValueChange={(value) => {
                      const lessonType = value as LessonType;
                      const periods = lessonPeriodsByType[lessonType];
                      const fallback = periods[0] ? String(periods[0]) : "";

                      setDefaults((current) => ({
                        ...current,
                        lessonType,
                        startPeriod: fallback,
                        endPeriod: fallback,
                      }));
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="NORMAL"
                        id="default-lesson-normal"
                      />
                      <FieldLabel htmlFor="default-lesson-normal">
                        {formatLessonType("NORMAL")}
                      </FieldLabel>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value="INTENSIVE"
                        id="default-lesson-intensive"
                      />
                      <FieldLabel htmlFor="default-lesson-intensive">
                        {formatLessonType("INTENSIVE")}
                      </FieldLabel>
                    </div>
                  </RadioGroup>
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
                        {lessonPeriodsByType[defaults.lessonType].map(
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
                        {lessonPeriodsByType[defaults.lessonType].map(
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
                    onChange={(event) => {
                      setDefaults((current) => ({
                        ...current,
                        startTime: event.currentTarget.value,
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
                      setDefaults((current) => ({
                        ...current,
                        endTime: event.currentTarget.value,
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
          lessonPeriodsByType[defaults.lessonType].length === 0 ? (
            <FormErrorMessage message="塾の授業は時間割が登録されていません。" />
          ) : null}
        </section>

        <section className="space-y-4 rounded-xl border p-4">
          <h3 className="text-base font-semibold">4. 選択日の詳細入力</h3>

          {isTimetableLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : selectedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              カレンダーから日付を選択してください。
            </p>
          ) : (
            <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
              {selectedRows.map((row) => {
                const rowErrors = errors.rows?.[row.date] ?? {};
                const lessonPeriods = lessonPeriodsByType[row.lessonType];

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

                              const periods =
                                lessonPeriodsByType[row.lessonType];
                              const fallbackPeriod = periods[0]
                                ? String(periods[0])
                                : "";

                              updateRow(row.date, {
                                shiftType,
                                ...(shiftType === "LESSON"
                                  ? {
                                      startPeriod:
                                        row.startPeriod || fallbackPeriod,
                                      endPeriod:
                                        row.endPeriod || fallbackPeriod,
                                    }
                                  : {}),
                              });
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <RadioGroupItem
                                value="NORMAL"
                                id={`${row.date}-shift-normal`}
                              />
                              <FieldLabel htmlFor={`${row.date}-shift-normal`}>
                                {formatShiftType("NORMAL")}
                              </FieldLabel>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem
                                value="LESSON"
                                id={`${row.date}-shift-lesson`}
                                disabled={
                                  selectedWorkplace?.type !== "CRAM_SCHOOL"
                                }
                              />
                              <FieldLabel htmlFor={`${row.date}-shift-lesson`}>
                                {formatShiftType("LESSON")}
                              </FieldLabel>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem
                                value="OTHER"
                                id={`${row.date}-shift-other`}
                              />
                              <FieldLabel htmlFor={`${row.date}-shift-other`}>
                                {formatShiftType("OTHER")}
                              </FieldLabel>
                            </div>
                          </RadioGroup>
                          <FormErrorMessage message={rowErrors.shiftType} />
                        </FieldContent>
                      </Field>

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
                                updateRow(row.date, {
                                  breakMinutes: event.currentTarget.value,
                                });
                              }}
                            />
                            <span className="shrink-0 text-sm text-muted-foreground">
                              分
                            </span>
                          </div>
                          <FormErrorMessage message={rowErrors.breakMinutes} />
                        </FieldContent>
                      </Field>
                    </FieldGroup>

                    {row.shiftType === "LESSON" ? (
                      <FieldGroup className="mt-4 grid gap-4 md:grid-cols-3">
                        <Field>
                          <FieldLabel>コマ種別</FieldLabel>
                          <FieldContent>
                            <RadioGroup
                              value={row.lessonType}
                              onValueChange={(value) => {
                                const lessonType = value as LessonType;
                                const periods = lessonPeriodsByType[lessonType];
                                const fallback = periods[0]
                                  ? String(periods[0])
                                  : "";

                                updateRow(row.date, {
                                  lessonType,
                                  startPeriod: fallback,
                                  endPeriod: fallback,
                                });
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <RadioGroupItem
                                  value="NORMAL"
                                  id={`${row.date}-lesson-type-normal`}
                                />
                                <FieldLabel
                                  htmlFor={`${row.date}-lesson-type-normal`}
                                >
                                  {formatLessonType("NORMAL")}
                                </FieldLabel>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem
                                  value="INTENSIVE"
                                  id={`${row.date}-lesson-type-intensive`}
                                />
                                <FieldLabel
                                  htmlFor={`${row.date}-lesson-type-intensive`}
                                >
                                  {formatLessonType("INTENSIVE")}
                                </FieldLabel>
                              </div>
                            </RadioGroup>
                            <FormErrorMessage message={rowErrors.lessonType} />
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
                                updateRow(row.date, {
                                  startTime: event.currentTarget.value,
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
                                updateRow(row.date, {
                                  endTime: event.currentTarget.value,
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
              router.push("/my/calendar");
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

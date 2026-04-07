"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SpinnerPanel } from "@/components/ui/spinner";
import { messages, toErrorMessage } from "@/lib/messages";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

type TimetableFormMode = "create" | "edit";

type TimetableFormProps = {
  mode: TimetableFormMode;
  workplaceId: string;
  timetableId?: string;
};

type WorkplaceSummary = {
  id: string;
  name: string;
  type: "GENERAL" | "CRAM_SCHOOL";
};

type TimetableItem = {
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
  items: TimetableItem[];
};

type FormValues = {
  name: string;
  items: Array<{
    period: string;
    startTime: string;
    endTime: string;
  }>;
};

type FormErrors = Partial<Record<"name" | "form", string>>;
type RowErrors = Partial<Record<"period" | "startTime" | "endTime", string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWorkplaceResponse(payload: unknown): WorkplaceSummary | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    (data.type !== "GENERAL" && data.type !== "CRAM_SCHOOL")
  ) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
  };
}

function isTimetableItem(value: unknown): value is TimetableItem {
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
    value.items.every(isTimetableItem)
  );
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

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function toTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function createEmptyItem(): FormValues["items"][number] {
  return {
    period: "",
    startTime: "",
    endTime: "",
  };
}

function createEmptyFormValues(): FormValues {
  return {
    name: "",
    items: [createEmptyItem()],
  };
}

function hasAnySetInput(values: FormValues): boolean {
  if (values.name.trim().length > 0) {
    return true;
  }

  return values.items.some(
    (item) => item.period || item.startTime || item.endTime,
  );
}

function normalizeItems(items: TimetableItem[]): FormValues["items"] {
  return items
    .slice()
    .sort((left, right) => left.period - right.period)
    .map((item) => ({
      period: String(item.period),
      startTime: item.startTimeLabel ?? toTimeOnly(item.startTime),
      endTime: item.endTimeLabel ?? toTimeOnly(item.endTime),
    }));
}

function validateRows(items: FormValues["items"]): {
  rowErrors: RowErrors[];
  hasError: boolean;
} {
  const rowErrors: RowErrors[] = items.map(() => ({}));
  let hasError = false;

  const seenPeriods = new Map<number, number>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const errors: RowErrors = {};
    const period = Number(item.period);

    if (!item.period || Number.isInteger(period) === false || period <= 0) {
      errors.period = "コマ番号は1以上の整数で入力してください。";
    }

    if (!timeRegex.test(item.startTime)) {
      errors.startTime = "開始時刻はHH:MM形式で入力してください。";
    }

    if (!timeRegex.test(item.endTime)) {
      errors.endTime = "終了時刻はHH:MM形式で入力してください。";
    }

    if (
      timeRegex.test(item.startTime) &&
      timeRegex.test(item.endTime) &&
      toMinutes(item.startTime) >= toMinutes(item.endTime)
    ) {
      errors.endTime = "終了時刻は開始時刻より後にしてください。";
    }

    if (Object.keys(errors).length > 0) {
      rowErrors[index] = errors;
      hasError = true;
      continue;
    }

    const duplicatedIndex = seenPeriods.get(period);
    if (duplicatedIndex !== undefined) {
      rowErrors[index] = {
        ...rowErrors[index],
        period: "同じコマ番号が重複しています。",
      };
      rowErrors[duplicatedIndex] = {
        ...rowErrors[duplicatedIndex],
        period:
          rowErrors[duplicatedIndex]?.period ??
          "同じコマ番号が重複しています。",
      };
      hasError = true;
      continue;
    }

    seenPeriods.set(period, index);
  }

  return { rowErrors, hasError };
}

export function TimetableForm({
  mode,
  workplaceId,
  timetableId,
}: TimetableFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [workplace, setWorkplace] = useState<WorkplaceSummary | null>(null);
  const [values, setValues] = useState<FormValues>(createEmptyFormValues);
  const [queuedSets, setQueuedSets] = useState<FormValues[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [rowErrors, setRowErrors] = useState<RowErrors[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pageTitle = useMemo(
    () => (isEdit ? "時間割セット編集" : "時間割セット作成"),
    [isEdit],
  );
  const listHref = `/my/workplaces/${workplaceId}/timetables`;

  useEffect(() => {
    if (isEdit && !timetableId) {
      setIsLoading(false);
      setErrors({
        form: "編集対象の時間割セットIDが指定されていません。",
      });
      return;
    }

    const abortController = new AbortController();

    async function fetchInitialData() {
      setIsLoading(true);
      setErrors({});

      try {
        const workplaceResponse = await fetch(
          `/api/workplaces/${workplaceId}`,
          {
            signal: abortController.signal,
          },
        );

        if (workplaceResponse.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              workplaceResponse,
              "勤務先情報の取得に失敗しました。",
            ),
          );
        }

        const parsedWorkplace = parseWorkplaceResponse(
          (await workplaceResponse.json()) as unknown,
        );
        if (!parsedWorkplace) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }

        setWorkplace(parsedWorkplace);

        if (parsedWorkplace.type !== "CRAM_SCHOOL") {
          throw new Error("時間割は塾タイプ勤務先でのみ操作できます。");
        }

        if (!isEdit) {
          return;
        }

        const response = await fetch(
          `/api/workplaces/${workplaceId}/timetables`,
          {
            signal: abortController.signal,
          },
        );
        if (response.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              response,
              "時間割一覧の取得に失敗しました。",
            ),
          );
        }

        const list = parseTimetableSetListResponse(
          (await response.json()) as unknown,
        );
        if (!list) {
          throw new Error("時間割一覧レスポンスの形式が不正です。");
        }

        const target = list.find((set) => set.id === timetableId);
        if (!target) {
          throw new Error("編集対象の時間割セットが見つかりません。");
        }

        setValues({
          name: target.name,
          items:
            target.items.length > 0
              ? normalizeItems(target.items)
              : [createEmptyItem()],
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetable form data", error);
        setErrors({
          form: toErrorMessage(error, "時間割データの読み込みに失敗しました。"),
        });
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchInitialData();

    return () => {
      abortController.abort();
    };
  }, [isEdit, timetableId, workplaceId]);

  function updateValue(key: "name", value: string) {
    setValues((current) => ({
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

  function updateItem(
    index: number,
    patch: Partial<FormValues["items"][number]>,
  ) {
    setValues((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));

    setRowErrors((current) => {
      if (!current[index]) {
        return current;
      }

      const next = [...current];
      next[index] = {};
      return next;
    });
  }

  function appendItem() {
    setValues((current) => ({
      ...current,
      items: [...current.items, createEmptyItem()],
    }));
    setRowErrors((current) => [...current, {}]);
  }

  function removeItem(index: number) {
    setValues((current) => {
      if (current.items.length <= 1) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });

    setRowErrors((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function validateForm(target: FormValues): {
    formErrors: FormErrors;
    rowErrors: RowErrors[];
  } {
    const formErrors: FormErrors = {};

    if (!target.name.trim()) {
      formErrors.name = "時間割セット名は必須です。";
    } else if (target.name.trim().length > 50) {
      formErrors.name = "時間割セット名は50文字以内で入力してください。";
    }

    const rowValidation = validateRows(target.items);
    return {
      formErrors,
      rowErrors: rowValidation.rowErrors,
    };
  }

  function toCreatePayload(set: FormValues) {
    return {
      name: set.name.trim(),
      items: set.items.map((item) => ({
        period: Number(item.period),
        startTime: item.startTime,
        endTime: item.endTime,
      })),
    };
  }

  function handleQueueCurrentSet() {
    const validation = validateForm(values);
    const hasFormError = Object.keys(validation.formErrors).length > 0;
    const hasRowError = validation.rowErrors.some(
      (error) => Object.keys(error).length > 0,
    );

    if (hasFormError || hasRowError) {
      setErrors(validation.formErrors);
      setRowErrors(validation.rowErrors);
      const firstError =
        Object.values(validation.formErrors).find(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ) ??
        validation.rowErrors
          .flatMap((error) => Object.values(error))
          .find(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          );

      toast.error(messages.error.validation, {
        description: firstError,
        duration: 6000,
      });
      return;
    }

    setQueuedSets((current) => [...current, values]);
    setValues(createEmptyFormValues());
    setErrors({});
    setRowErrors([]);
    toast.success("作成予定セットに追加しました。");
  }

  function removeQueuedSet(index: number) {
    setQueuedSets((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isEdit && !timetableId) {
      setErrors({ form: "編集対象の時間割セットIDが指定されていません。" });
      return;
    }

    const validation = validateForm(values);
    const hasFormError = Object.keys(validation.formErrors).length > 0;
    const hasRowError = validation.rowErrors.some(
      (error) => Object.keys(error).length > 0,
    );

    if (isEdit && (hasFormError || hasRowError)) {
      setErrors(validation.formErrors);
      setRowErrors(validation.rowErrors);
      const firstError =
        Object.values(validation.formErrors).find(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ) ??
        validation.rowErrors
          .flatMap((error) => Object.values(error))
          .find(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          );

      toast.error(messages.error.validation, {
        description: firstError,
        duration: 6000,
      });
      return;
    }

    const createTargets = [...queuedSets];
    if (!isEdit) {
      const shouldIncludeCurrent = hasAnySetInput(values);

      if (shouldIncludeCurrent) {
        if (hasFormError || hasRowError) {
          setErrors(validation.formErrors);
          setRowErrors(validation.rowErrors);
          const firstError =
            Object.values(validation.formErrors).find(
              (value): value is string =>
                typeof value === "string" && value.length > 0,
            ) ??
            validation.rowErrors
              .flatMap((error) => Object.values(error))
              .find(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              );

          toast.error(messages.error.validation, {
            description: firstError,
            duration: 6000,
          });
          return;
        }

        createTargets.push(values);
      } else if (createTargets.length === 0) {
        setErrors({ name: "少なくとも1つの時間割セットを入力してください。" });
        toast.error(messages.error.validation, {
          description: "少なくとも1つの時間割セットを入力してください。",
          duration: 6000,
        });
        return;
      }
    }

    const payload =
      isEdit || createTargets.length <= 1
        ? toCreatePayload(isEdit ? values : createTargets[0]!)
        : {
            sets: createTargets.map((set) => toCreatePayload(set)),
          };

    setIsSubmitting(true);
    const loadingToastId = toast.loading(
      isEdit
        ? "時間割セットを更新中です..."
        : "時間割セットを一括作成中です...",
    );

    try {
      const endpoint = isEdit
        ? `/api/workplaces/${workplaceId}/timetables/${timetableId}`
        : `/api/workplaces/${workplaceId}/timetables`;
      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(
            response,
            messages.error.timetableSaveFailed,
          ),
        );
      }

      const createdCount = isEdit ? 1 : createTargets.length;
      toast.success(
        isEdit
          ? messages.success.timetableUpdated
          : messages.success.timetableCreated(createdCount),
        { id: loadingToastId },
      );
      router.push(listHref);
    } catch (error) {
      console.error("failed to save timetable set", error);
      const message = toErrorMessage(error, messages.error.timetableSaveFailed);
      setErrors((current) => ({
        ...current,
        form: message,
      }));
      toast.error(messages.error.timetableSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-4 p-4 md:p-6">
        <header>
          <h2 className="text-xl font-semibold">{pageTitle}</h2>
        </header>
        <SpinnerPanel
          className="min-h-[180px]"
          label="時間割データを読み込み中..."
        />
      </section>
    );
  }

  if (workplace?.type !== "CRAM_SCHOOL") {
    return (
      <section className="space-y-4 p-4 md:p-6">
        <header>
          <h2 className="text-xl font-semibold">{pageTitle}</h2>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>操作対象外の勤務先です</CardTitle>
            <CardDescription>
              時間割は塾タイプの勤務先でのみ操作できます。
            </CardDescription>
          </CardHeader>
        </Card>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(listHref)}
        >
          時間割一覧へ戻る
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{pageTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {workplace
            ? isEdit
              ? `${workplace.name} の時間割セットを編集します。`
              : `${workplace.name} の時間割セットを作成します。`
            : isEdit
              ? "時間割セットを編集します。"
              : "時間割セットを作成します。"}
        </p>
      </header>

      {errors.form ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errors.form}
        </p>
      ) : null}

      <Form className="space-y-6" onSubmit={handleSubmit}>
        <FieldGroup className="grid gap-4">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="timetable-set-name">時間割セット名</FieldLabel>
            <FieldContent>
              <Input
                id="timetable-set-name"
                value={values.name}
                onChange={(event) =>
                  updateValue("name", event.currentTarget.value)
                }
                disabled={isSubmitting}
                maxLength={50}
              />
              <FormErrorMessage message={errors.name} />
            </FieldContent>
          </Field>
        </FieldGroup>

        {!isEdit ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                作成予定セット ({queuedSets.length})
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleQueueCurrentSet}
                disabled={isSubmitting}
              >
                現在の入力を追加
              </Button>
            </div>

            {queuedSets.length === 0 ? (
              <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                追加済みのセットはありません。入力中のセットを「現在の入力を追加」で作成予定に積めます。
              </p>
            ) : (
              <div className="space-y-2">
                {queuedSets.map((set, index) => (
                  <Card key={`queued-set-${index}`}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-sm">
                            {index + 1}. {set.name}
                          </CardTitle>
                          <CardDescription>
                            コマ数: {set.items.length}
                          </CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQueuedSet(index)}
                          disabled={isSubmitting}
                          aria-label={`作成予定${index + 1}を削除`}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">コマ設定</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={appendItem}
              disabled={isSubmitting}
            >
              <PlusIcon className="size-4" />
              行を追加
            </Button>
          </div>

          <div className="space-y-3">
            {values.items.map((item, index) => {
              const error = rowErrors[index] ?? {};

              return (
                <Card key={`row-${index}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{index + 1}行目</CardTitle>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        disabled={isSubmitting || values.items.length <= 1}
                        aria-label={`${index + 1}行目を削除`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <div className="grid gap-3 px-6 pb-6 md:grid-cols-3">
                    <Field data-invalid={Boolean(error.period)}>
                      <FieldLabel>コマ番号</FieldLabel>
                      <FieldContent>
                        <Input
                          type="number"
                          min={1}
                          value={item.period}
                          onChange={(event) =>
                            updateItem(index, {
                              period: event.currentTarget.value,
                            })
                          }
                          disabled={isSubmitting}
                        />
                        <FormErrorMessage message={error.period} />
                      </FieldContent>
                    </Field>

                    <Field data-invalid={Boolean(error.startTime)}>
                      <FieldLabel>開始時刻</FieldLabel>
                      <FieldContent>
                        <Input
                          type="time"
                          value={item.startTime}
                          onChange={(event) =>
                            updateItem(index, {
                              startTime: event.currentTarget.value,
                            })
                          }
                          disabled={isSubmitting}
                        />
                        <FormErrorMessage message={error.startTime} />
                      </FieldContent>
                    </Field>

                    <Field data-invalid={Boolean(error.endTime)}>
                      <FieldLabel>終了時刻</FieldLabel>
                      <FieldContent>
                        <Input
                          type="time"
                          value={item.endTime}
                          onChange={(event) =>
                            updateItem(index, {
                              endTime: event.currentTarget.value,
                            })
                          }
                          disabled={isSubmitting}
                        />
                        <FormErrorMessage message={error.endTime} />
                      </FieldContent>
                    </Field>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? isEdit
                ? "更新中..."
                : "作成中..."
              : isEdit
                ? "更新"
                : "まとめて作成"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(listHref)}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
        </div>
      </Form>
    </section>
  );
}

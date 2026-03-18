"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { dateKeyFromApiDate } from "@/lib/calendar/date";

const workplaceResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
  }),
});

const numericValueSchema = z.union([z.number(), z.string()]);

const payrollRuleResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    workplaceId: z.string(),
    startDate: z.string(),
    endDate: z.string().nullable(),
    baseHourlyWage: numericValueSchema,
    perLessonWage: numericValueSchema.nullable(),
    holidayHourlyWage: numericValueSchema.nullable(),
    nightMultiplier: numericValueSchema,
    overtimeMultiplier: numericValueSchema,
    nightStart: z.string(),
    nightEnd: z.string(),
    dailyOvertimeThreshold: numericValueSchema,
    holidayType: z.enum(["NONE", "WEEKEND", "HOLIDAY", "WEEKEND_HOLIDAY"]),
  }),
});

const upsertResponseSchema = z.object({
  warning: z
    .object({
      message: z.string(),
      overlappingRuleIds: z.array(z.string()),
    })
    .nullable()
    .optional(),
});

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
type PayrollRuleFormMode = "create" | "edit";

type PayrollRuleFormProps = {
  mode: PayrollRuleFormMode;
  workplaceId: string;
  ruleId?: string;
};

type FormValues = {
  startDate: string;
  endDate: string;
  baseHourlyWage: string;
  perLessonWage: string;
  holidayHourlyWage: string;
  nightMultiplier: string;
  overtimeMultiplier: string;
  dailyOvertimeThreshold: string;
  nightStart: string;
  nightEnd: string;
  holidayType: HolidayType;
};

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

function toNumberString(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  return String(value);
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

type ParsedApiError = {
  message: string;
  fieldErrors: Record<string, string>;
};

async function parseApiError(
  response: Response,
  fallback: string,
): Promise<ParsedApiError> {
  try {
    const payload = (await response.json()) as {
      error?: unknown;
      details?: unknown;
    };

    const fieldErrors: Record<string, string> = {};
    if (
      payload.details &&
      typeof payload.details === "object" &&
      "fieldErrors" in payload.details
    ) {
      const rawFieldErrors = (payload.details as { fieldErrors?: unknown })
        .fieldErrors;
      if (rawFieldErrors && typeof rawFieldErrors === "object") {
        Object.entries(rawFieldErrors).forEach(([field, messages]) => {
          if (Array.isArray(messages) === false) {
            return;
          }

          const firstMessage = messages.find(
            (message): message is string =>
              typeof message === "string" && message.length > 0,
          );
          if (firstMessage) {
            fieldErrors[field] = firstMessage;
          }
        });
      }
    }

    if (typeof payload.error === "string" && payload.error.length > 0) {
      return {
        message: payload.error,
        fieldErrors,
      };
    }
  } catch {
    return {
      message: fallback,
      fieldErrors: {},
    };
  }

  return {
    message: fallback,
    fieldErrors: {},
  };
}

function validate(
  values: FormValues,
  workplaceType: WorkplaceType,
): FormErrors {
  const errors: FormErrors = {};

  if (!values.startDate) {
    errors.startDate = "開始日は必須です。";
  }

  if (
    values.endDate &&
    values.startDate &&
    values.endDate <= values.startDate
  ) {
    errors.endDate = "終了日は開始日より後の日付を指定してください。";
  }

  if (workplaceType === "CRAM_SCHOOL") {
    const perLessonWage = Number(values.perLessonWage);
    if (!values.perLessonWage || Number.isFinite(perLessonWage) === false) {
      errors.perLessonWage = "コマ給は必須です。";
    } else if (perLessonWage <= 0) {
      errors.perLessonWage = "コマ給は正の数で入力してください。";
    }
  } else {
    const baseHourlyWage = Number(values.baseHourlyWage);
    if (!values.baseHourlyWage || Number.isFinite(baseHourlyWage) === false) {
      errors.baseHourlyWage = "基本時給は必須です。";
    } else if (baseHourlyWage <= 0) {
      errors.baseHourlyWage = "基本時給は正の数で入力してください。";
    }

    if (values.holidayHourlyWage) {
      const holidayHourlyWage = Number(values.holidayHourlyWage);
      if (
        Number.isFinite(holidayHourlyWage) === false ||
        holidayHourlyWage <= 0
      ) {
        errors.holidayHourlyWage = "休日時給は正の数で入力してください。";
      }
    }

    const nightMultiplier = Number(values.nightMultiplier);
    if (!values.nightMultiplier || Number.isFinite(nightMultiplier) === false) {
      errors.nightMultiplier = "深夜割増率は必須です。";
    } else if (nightMultiplier < 1) {
      errors.nightMultiplier = "深夜割増率は1.0以上で入力してください。";
    }

    const overtimeMultiplier = Number(values.overtimeMultiplier);
    if (
      !values.overtimeMultiplier ||
      Number.isFinite(overtimeMultiplier) === false
    ) {
      errors.overtimeMultiplier = "残業割増率は必須です。";
    } else if (overtimeMultiplier < 1) {
      errors.overtimeMultiplier = "残業割増率は1.0以上で入力してください。";
    }

    const threshold = Number(values.dailyOvertimeThreshold);
    if (
      !values.dailyOvertimeThreshold ||
      Number.isFinite(threshold) === false
    ) {
      errors.dailyOvertimeThreshold = "1日所定時間は必須です。";
    } else if (threshold <= 0) {
      errors.dailyOvertimeThreshold = "1日所定時間は正の数で入力してください。";
    }

    if (timeRegex.test(values.nightStart) === false) {
      errors.nightStart = "深夜開始時刻はHH:MM形式で入力してください。";
    }
    if (timeRegex.test(values.nightEnd) === false) {
      errors.nightEnd = "深夜終了時刻はHH:MM形式で入力してください。";
    }
  }

  return errors;
}

export function PayrollRuleForm({
  mode,
  workplaceId,
  ruleId,
}: PayrollRuleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [workplace, setWorkplace] = useState<{
    id: string;
    name: string;
    type: WorkplaceType;
  } | null>(null);
  const [values, setValues] = useState<FormValues>({
    startDate: "",
    endDate: "",
    baseHourlyWage: "1000",
    perLessonWage: "",
    holidayHourlyWage: "",
    nightMultiplier: "1.25",
    overtimeMultiplier: "1.25",
    dailyOvertimeThreshold: "8",
    nightStart: "22:00",
    nightEnd: "05:00",
    holidayType: "NONE",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const listHref = `/my/workplaces/${workplaceId}/payroll-rules`;
  const pageTitle = useMemo(
    () => (isEdit ? "給与ルール編集" : "給与ルール作成"),
    [isEdit],
  );

  useEffect(() => {
    if (isEdit && !ruleId) {
      setIsLoading(false);
      setErrors({
        form: "編集対象の給与ルールIDが指定されていません。",
      });
      return;
    }

    const abortController = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setErrors({});

      try {
        const workplacePromise = fetch(`/api/workplaces/${workplaceId}`, {
          cache: "no-store",
          signal: abortController.signal,
        });

        const rulePromise =
          isEdit && ruleId
            ? fetch(`/api/workplaces/${workplaceId}/payroll-rules/${ruleId}`, {
                cache: "no-store",
                signal: abortController.signal,
              })
            : Promise.resolve(null);

        const [workplaceResponse, ruleResponse] = await Promise.all([
          workplacePromise,
          rulePromise,
        ]);

        if (workplaceResponse.ok === false) {
          throw new Error(
            (
              await parseApiError(
                workplaceResponse,
                "勤務先情報の取得に失敗しました。",
              )
            ).message,
          );
        }

        const parsedWorkplace = workplaceResponseSchema.safeParse(
          (await workplaceResponse.json()) as unknown,
        );
        if (parsedWorkplace.success === false) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }
        setWorkplace(parsedWorkplace.data.data);

        if (ruleResponse) {
          if (ruleResponse.ok === false) {
            throw new Error(
              (
                await parseApiError(
                  ruleResponse,
                  "給与ルールの取得に失敗しました。",
                )
              ).message,
            );
          }

          const parsedRule = payrollRuleResponseSchema.safeParse(
            (await ruleResponse.json()) as unknown,
          );
          if (parsedRule.success === false) {
            throw new Error("給与ルールレスポンスの形式が不正です。");
          }

          const rule = parsedRule.data.data;
          setValues({
            startDate: dateKeyFromApiDate(rule.startDate),
            endDate: rule.endDate ? dateKeyFromApiDate(rule.endDate) : "",
            baseHourlyWage: toNumberString(rule.baseHourlyWage),
            perLessonWage: toNumberString(rule.perLessonWage),
            holidayHourlyWage: toNumberString(rule.holidayHourlyWage),
            nightMultiplier: toNumberString(rule.nightMultiplier),
            overtimeMultiplier: toNumberString(rule.overtimeMultiplier),
            dailyOvertimeThreshold: toNumberString(rule.dailyOvertimeThreshold),
            nightStart: toTimeOnly(rule.nightStart),
            nightEnd: toTimeOnly(rule.nightEnd),
            holidayType: rule.holidayType,
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch payroll rule form data", error);
        setErrors({
          form:
            error instanceof Error
              ? error.message
              : "給与ルール情報の取得に失敗しました。",
        });
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      abortController.abort();
    };
  }, [isEdit, ruleId, workplaceId]);

  const handleSubmit = async () => {
    const workplaceType = workplace?.type ?? "GENERAL";
    const validationErrors = validate(values, workplaceType);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const payload = {
      startDate: values.startDate,
      endDate: values.endDate ? values.endDate : null,
      baseHourlyWage:
        workplaceType === "CRAM_SCHOOL" ? 1 : Number(values.baseHourlyWage),
      perLessonWage:
        workplaceType === "CRAM_SCHOOL" ? Number(values.perLessonWage) : null,
      holidayHourlyWage:
        workplaceType === "CRAM_SCHOOL"
          ? null
          : values.holidayHourlyWage
            ? Number(values.holidayHourlyWage)
            : null,
      nightMultiplier:
        workplaceType === "CRAM_SCHOOL" ? 1 : Number(values.nightMultiplier),
      overtimeMultiplier:
        workplaceType === "CRAM_SCHOOL" ? 1 : Number(values.overtimeMultiplier),
      dailyOvertimeThreshold:
        workplaceType === "CRAM_SCHOOL"
          ? 8
          : Number(values.dailyOvertimeThreshold),
      nightStart: workplaceType === "CRAM_SCHOOL" ? "22:00" : values.nightStart,
      nightEnd: workplaceType === "CRAM_SCHOOL" ? "05:00" : values.nightEnd,
      holidayType:
        workplaceType === "CRAM_SCHOOL" ? "NONE" : values.holidayType,
    } as const;

    try {
      const response = await fetch(
        isEdit
          ? `/api/workplaces/${workplaceId}/payroll-rules/${ruleId}`
          : `/api/workplaces/${workplaceId}/payroll-rules`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok === false) {
        const parsedError = await parseApiError(
          response,
          isEdit
            ? "給与ルールの更新に失敗しました。"
            : "給与ルールの作成に失敗しました。",
        );

        setErrors((current) => ({
          ...current,
          ...parsedError.fieldErrors,
          form: parsedError.message,
        }));
        return;
      }

      const parsedResponse = upsertResponseSchema.safeParse(
        (await response.json()) as unknown,
      );
      const warningMessage =
        parsedResponse.success && parsedResponse.data.warning
          ? parsedResponse.data.warning.message
          : null;

      if (warningMessage) {
        const params = new URLSearchParams({ warning: warningMessage });
        router.push(`${listHref}?${params.toString()}`);
      } else {
        router.push(listHref);
      }
      router.refresh();
    } catch (error) {
      console.error("failed to submit payroll rule form", error);
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : isEdit
              ? "給与ルールの更新に失敗しました。"
              : "給与ルールの作成に失敗しました。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{pageTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {workplace
            ? `${workplace.name} (${workplace.type}) の給与ルールを設定します。`
            : "勤務先ごとの給与ルールを設定します。"}
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">読み込み中です...</p>
      ) : (
        <Form
          className="max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <Field data-invalid={Boolean(errors.startDate)}>
            <FieldLabel htmlFor="start-date">開始日</FieldLabel>
            <FieldContent>
              <Input
                id="start-date"
                type="date"
                value={values.startDate}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    startDate: event.currentTarget.value,
                  }));
                }}
              />
              <FormErrorMessage message={errors.startDate} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.endDate)}>
            <FieldLabel htmlFor="end-date">終了日</FieldLabel>
            <FieldContent>
              <Input
                id="end-date"
                type="date"
                value={values.endDate}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    endDate: event.currentTarget.value,
                  }));
                }}
              />
              <FieldDescription>
                空欄の場合は現在有効として扱います。
              </FieldDescription>
              <FormErrorMessage message={errors.endDate} />
            </FieldContent>
          </Field>

          {workplace?.type === "CRAM_SCHOOL" ? (
            <Field data-invalid={Boolean(errors.perLessonWage)}>
              <FieldLabel htmlFor="per-lesson-wage">コマ給</FieldLabel>
              <FieldContent>
                <Input
                  id="per-lesson-wage"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.perLessonWage}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      perLessonWage: event.currentTarget.value,
                    }));
                  }}
                />
                <FormErrorMessage message={errors.perLessonWage} />
              </FieldContent>
            </Field>
          ) : (
            <>
              <Field data-invalid={Boolean(errors.baseHourlyWage)}>
                <FieldLabel htmlFor="base-hourly-wage">基本時給</FieldLabel>
                <FieldContent>
                  <Input
                    id="base-hourly-wage"
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.baseHourlyWage}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        baseHourlyWage: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FormErrorMessage message={errors.baseHourlyWage} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.holidayHourlyWage)}>
                <FieldLabel htmlFor="holiday-hourly-wage">休日時給</FieldLabel>
                <FieldContent>
                  <Input
                    id="holiday-hourly-wage"
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.holidayHourlyWage}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        holidayHourlyWage: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FieldDescription>
                    空欄の場合、基本時給と同等として扱います。
                  </FieldDescription>
                  <FormErrorMessage message={errors.holidayHourlyWage} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.nightMultiplier)}>
                <FieldLabel htmlFor="night-multiplier">深夜割増率</FieldLabel>
                <FieldContent>
                  <Input
                    id="night-multiplier"
                    type="number"
                    min="1"
                    step="0.01"
                    value={values.nightMultiplier}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        nightMultiplier: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FormErrorMessage message={errors.nightMultiplier} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.overtimeMultiplier)}>
                <FieldLabel htmlFor="overtime-multiplier">
                  残業割増率
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="overtime-multiplier"
                    type="number"
                    min="1"
                    step="0.01"
                    value={values.overtimeMultiplier}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        overtimeMultiplier: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FormErrorMessage message={errors.overtimeMultiplier} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.dailyOvertimeThreshold)}>
                <FieldLabel htmlFor="daily-overtime-threshold">
                  1日所定時間
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="daily-overtime-threshold"
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.dailyOvertimeThreshold}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        dailyOvertimeThreshold: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FormErrorMessage message={errors.dailyOvertimeThreshold} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.nightStart)}>
                <FieldLabel htmlFor="night-start">深夜開始時刻</FieldLabel>
                <FieldContent>
                  <Input
                    id="night-start"
                    type="time"
                    value={values.nightStart}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        nightStart: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FormErrorMessage message={errors.nightStart} />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(errors.nightEnd)}>
                <FieldLabel htmlFor="night-end">深夜終了時刻</FieldLabel>
                <FieldContent>
                  <Input
                    id="night-end"
                    type="time"
                    value={values.nightEnd}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        nightEnd: event.currentTarget.value,
                      }));
                    }}
                  />
                  <FormErrorMessage message={errors.nightEnd} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>休日判定</FieldLabel>
                <FieldContent>
                  <RadioGroup
                    value={values.holidayType}
                    onValueChange={(value) => {
                      setValues((current) => ({
                        ...current,
                        holidayType: value as HolidayType,
                      }));
                    }}
                  >
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="holiday-type-none">NONE</FieldLabel>
                      <RadioGroupItem id="holiday-type-none" value="NONE" />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="holiday-type-weekend">
                        WEEKEND
                      </FieldLabel>
                      <RadioGroupItem
                        id="holiday-type-weekend"
                        value="WEEKEND"
                      />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="holiday-type-holiday">
                        HOLIDAY
                      </FieldLabel>
                      <RadioGroupItem
                        id="holiday-type-holiday"
                        value="HOLIDAY"
                      />
                    </Field>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="holiday-type-weekend-holiday">
                        WEEKEND_HOLIDAY
                      </FieldLabel>
                      <RadioGroupItem
                        id="holiday-type-weekend-holiday"
                        value="WEEKEND_HOLIDAY"
                      />
                    </Field>
                  </RadioGroup>
                </FieldContent>
              </Field>
            </>
          )}

          {workplace?.type === "CRAM_SCHOOL" ? (
            <Field>
              <FieldLabel>補足</FieldLabel>
              <FieldContent>
                <FieldDescription>
                  CRAM_SCHOOL
                  はコマ給のみ必須です。GENERAL向け項目は固定値で保存されます。
                </FieldDescription>
              </FieldContent>
            </Field>
          ) : null}

          <FormErrorMessage message={errors.form} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : isEdit ? "保存" : "作成"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                router.push(listHref);
              }}
            >
              キャンセル
            </Button>
          </div>
        </Form>
      )}
    </section>
  );
}

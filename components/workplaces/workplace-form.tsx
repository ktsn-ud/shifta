"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toDateOnlyString } from "@/lib/calendar/date";
import { formatHolidayType, formatWorkplaceType } from "@/lib/enum-labels";
import { messages, toErrorMessage } from "@/lib/messages";

const colorRegex = /^#[0-9A-Fa-f]{6}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
type WorkplaceFormMode = "create" | "edit";

type WorkplaceFormProps = {
  mode: WorkplaceFormMode;
  workplaceId?: string;
};

type FormValues = {
  name: string;
  type: WorkplaceType;
  color: string;
};

type InitialRuleValues = {
  startDate: string;
  endDate: string;
  baseHourlyWage: string;
  holidayHourlyWage: string;
  nightMultiplier: string;
  overtimeMultiplier: string;
  dailyOvertimeThreshold: string;
  nightStart: string;
  nightEnd: string;
  holidayType: HolidayType;
};

type FormErrorKey = keyof FormValues | keyof InitialRuleValues | "form";
type FormErrors = Partial<Record<FormErrorKey, string>>;
type WorkplaceDetail = {
  id: string;
  name: string;
  type: WorkplaceType;
  color: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkplaceType(value: unknown): value is WorkplaceType {
  return value === "GENERAL" || value === "CRAM_SCHOOL";
}

function parseWorkplaceDetailResponse(
  payload: unknown,
): WorkplaceDetail | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    !isWorkplaceType(data.type) ||
    typeof data.color !== "string"
  ) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    color: data.color,
  };
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

function validate(
  values: FormValues,
  isEdit: boolean,
  createInitialRule: boolean,
  initialRuleValues: InitialRuleValues,
): FormErrors {
  const errors: FormErrors = {};
  const trimmedName = values.name.trim();

  if (trimmedName.length === 0) {
    errors.name = "勤務先名は必須です。";
  } else if (trimmedName.length > 50) {
    errors.name = "勤務先名は50文字以内で入力してください。";
  }

  if (colorRegex.test(values.color) === false) {
    errors.color = "色はHEX形式(#RRGGBB)で入力してください。";
  }

  if (isEdit || createInitialRule === false) {
    return errors;
  }

  if (!initialRuleValues.startDate) {
    errors.startDate = "適用開始日は必須です。";
  }

  if (
    initialRuleValues.endDate &&
    initialRuleValues.startDate &&
    initialRuleValues.endDate <= initialRuleValues.startDate
  ) {
    errors.endDate = "適用終了日は開始日より後の日付を指定してください。";
  }

  const baseHourlyWage = Number(initialRuleValues.baseHourlyWage);
  if (
    !initialRuleValues.baseHourlyWage ||
    Number.isFinite(baseHourlyWage) === false
  ) {
    errors.baseHourlyWage = "基本時給は必須です。";
  } else if (baseHourlyWage <= 0) {
    errors.baseHourlyWage = "基本時給は正の数で入力してください。";
  }

  if (initialRuleValues.holidayHourlyWage) {
    const holidayHourlyWage = Number(initialRuleValues.holidayHourlyWage);
    if (
      Number.isFinite(holidayHourlyWage) === false ||
      holidayHourlyWage <= 0
    ) {
      errors.holidayHourlyWage = "休日時給は正の数で入力してください。";
    }
  }

  const nightMultiplier = Number(initialRuleValues.nightMultiplier);
  if (
    !initialRuleValues.nightMultiplier ||
    Number.isFinite(nightMultiplier) === false
  ) {
    errors.nightMultiplier = "深夜割増率は必須です。";
  } else if (nightMultiplier < 1) {
    errors.nightMultiplier = "深夜割増率は1.0以上で入力してください。";
  }

  const overtimeMultiplier = Number(initialRuleValues.overtimeMultiplier);
  if (
    !initialRuleValues.overtimeMultiplier ||
    Number.isFinite(overtimeMultiplier) === false
  ) {
    errors.overtimeMultiplier = "残業割増率は必須です。";
  } else if (overtimeMultiplier < 1) {
    errors.overtimeMultiplier = "残業割増率は1.0以上で入力してください。";
  }

  const threshold = Number(initialRuleValues.dailyOvertimeThreshold);
  if (
    !initialRuleValues.dailyOvertimeThreshold ||
    Number.isFinite(threshold) === false
  ) {
    errors.dailyOvertimeThreshold = "1日所定時間は必須です。";
  } else if (threshold <= 0) {
    errors.dailyOvertimeThreshold = "1日所定時間は正の数で入力してください。";
  }

  if (timeRegex.test(initialRuleValues.nightStart) === false) {
    errors.nightStart = "深夜開始時刻はHH:MM形式で入力してください。";
  }

  if (timeRegex.test(initialRuleValues.nightEnd) === false) {
    errors.nightEnd = "深夜終了時刻はHH:MM形式で入力してください。";
  }

  return errors;
}

export function WorkplaceForm({ mode, workplaceId }: WorkplaceFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [values, setValues] = useState<FormValues>({
    name: "",
    type: "GENERAL",
    color: "#3B82F6",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createInitialRule, setCreateInitialRule] = useState(true);
  const [initialRuleValues, setInitialRuleValues] = useState<InitialRuleValues>(
    () => ({
      startDate: toDateOnlyString(new Date()),
      endDate: "",
      baseHourlyWage: "1000",
      holidayHourlyWage: "",
      nightMultiplier: "1.25",
      overtimeMultiplier: "1.25",
      dailyOvertimeThreshold: "8",
      nightStart: "22:00",
      nightEnd: "05:00",
      holidayType: "NONE",
    }),
  );

  const pageTitle = useMemo(
    () => (isEdit ? "勤務先編集" : "勤務先作成"),
    [isEdit],
  );

  useEffect(() => {
    if (!isEdit) {
      setIsLoading(false);
      return;
    }

    if (!workplaceId) {
      setIsLoading(false);
      setErrors({ form: "編集対象の勤務先IDが指定されていません。" });
      return;
    }

    const abortController = new AbortController();

    async function fetchWorkplace() {
      setIsLoading(true);
      setErrors({});

      try {
        const response = await fetch(`/api/workplaces/${workplaceId}`, {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (response.ok === false) {
          throw new Error(
            await readApiErrorMessage(response, "勤務先の取得に失敗しました。"),
          );
        }

        const workplace = parseWorkplaceDetailResponse(
          (await response.json()) as unknown,
        );
        if (!workplace) {
          throw new Error("勤務先データの形式が不正です。");
        }

        setValues({
          name: workplace.name,
          type: workplace.type,
          color: workplace.color,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplace", error);
        setErrors({
          form:
            error instanceof Error
              ? error.message
              : "勤務先の取得に失敗しました。",
        });
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchWorkplace();

    return () => {
      abortController.abort();
    };
  }, [isEdit, workplaceId]);

  const handleSubmit = async () => {
    const validationErrors = validate(
      values,
      isEdit,
      createInitialRule,
      initialRuleValues,
    );
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      const firstValidationMessage = Object.values(validationErrors).find(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );
      toast.error(messages.error.validation, {
        description: firstValidationMessage,
        duration: 6000,
      });
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    const loadingToastId = toast.loading("勤務先を保存中です...");

    try {
      const payload: {
        name: string;
        type: WorkplaceType;
        color: string;
        initialPayrollRule?: {
          startDate: string;
          endDate: string | null;
          baseHourlyWage: number;
          holidayHourlyWage: number | null;
          nightMultiplier: number;
          overtimeMultiplier: number;
          nightStart: string;
          nightEnd: string;
          dailyOvertimeThreshold: number;
          holidayType: HolidayType;
        };
      } = {
        name: values.name.trim(),
        type: values.type,
        color: values.color.toUpperCase(),
      };

      if (!isEdit && createInitialRule) {
        payload.initialPayrollRule = {
          startDate: initialRuleValues.startDate,
          endDate: initialRuleValues.endDate ? initialRuleValues.endDate : null,
          baseHourlyWage: Number(initialRuleValues.baseHourlyWage),
          holidayHourlyWage: initialRuleValues.holidayHourlyWage
            ? Number(initialRuleValues.holidayHourlyWage)
            : null,
          nightMultiplier: Number(initialRuleValues.nightMultiplier),
          overtimeMultiplier: Number(initialRuleValues.overtimeMultiplier),
          nightStart: initialRuleValues.nightStart,
          nightEnd: initialRuleValues.nightEnd,
          dailyOvertimeThreshold: Number(
            initialRuleValues.dailyOvertimeThreshold,
          ),
          holidayType: initialRuleValues.holidayType,
        };
      }

      const response = await fetch(
        isEdit ? `/api/workplaces/${workplaceId}` : "/api/workplaces",
        {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(
            response,
            isEdit
              ? "勤務先の更新に失敗しました。"
              : "勤務先の作成に失敗しました。",
          ),
        );
      }

      const responsePayload = (await response.json()) as {
        data?: {
          id?: string;
          type?: WorkplaceType;
        };
      };

      if (
        !isEdit &&
        responsePayload.data?.type === "CRAM_SCHOOL" &&
        responsePayload.data.id
      ) {
        toast.success(messages.success.workplaceCreated, {
          id: loadingToastId,
          description: payload.name,
        });
        router.push(`/my/workplaces/${responsePayload.data.id}/timetables/new`);
      } else {
        toast.success(
          isEdit
            ? messages.success.workplaceUpdated
            : messages.success.workplaceCreated,
          {
            id: loadingToastId,
            description: payload.name,
          },
        );
        router.push("/my/workplaces");
      }
    } catch (error) {
      console.error("failed to submit workplace form", error);
      const message = toErrorMessage(error, messages.error.workplaceSaveFailed);
      setErrors({
        form: message,
      });
      toast.error(messages.error.workplaceSaveFailed, {
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
        <h2 className="text-xl font-semibold">{pageTitle}</h2>
        <p className="text-sm text-muted-foreground">
          勤務先名・タイプ・表示色を設定します。
        </p>
      </header>

      {isLoading ? (
        <FormLoadingSkeleton />
      ) : (
        <Form
          className="max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="workplace-name">勤務先名</FieldLabel>
            <FieldContent>
              <Input
                id="workplace-name"
                value={values.name}
                maxLength={50}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setValues((current) => ({ ...current, name: next }));
                }}
                className="max-w-50"
              />
              <FieldDescription>1〜50文字で入力してください。</FieldDescription>
              <FormErrorMessage message={errors.name} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.type)}>
            <FieldLabel>タイプ</FieldLabel>
            <FieldContent>
              <RadioGroup
                value={values.type}
                onValueChange={(value) => {
                  setValues((current) => ({
                    ...current,
                    type: value as WorkplaceType,
                  }));
                }}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem id="workplace-type-general" value="GENERAL" />
                  <FieldLabel htmlFor="workplace-type-general">
                    {formatWorkplaceType("GENERAL")}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem
                    id="workplace-type-cram"
                    value="CRAM_SCHOOL"
                  />
                  <FieldLabel htmlFor="workplace-type-cram">
                    {formatWorkplaceType("CRAM_SCHOOL")}
                  </FieldLabel>
                </Field>
              </RadioGroup>
              <FormErrorMessage message={errors.type} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.color)}>
            <FieldLabel htmlFor="workplace-color">色</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-3">
                <Input
                  id="workplace-color"
                  type="color"
                  value={values.color}
                  className="h-10 w-16 p-1"
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setValues((current) => ({ ...current, color: next }));
                  }}
                />
                <Input
                  value={values.color}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setValues((current) => ({ ...current, color: next }));
                  }}
                  className="max-w-50"
                />
              </div>
              <FieldDescription>HEX形式（例: #3B82F6）</FieldDescription>
              <FormErrorMessage message={errors.color} />
            </FieldContent>
          </Field>

          {!isEdit ? (
            <>
              <Field orientation="horizontal">
                <Checkbox
                  checked={createInitialRule}
                  onCheckedChange={(checked) => {
                    setCreateInitialRule(Boolean(checked));
                  }}
                  disabled={isSubmitting}
                />
                <FieldContent>
                  <FieldLabel htmlFor="create-initial-rule">
                    初期給与ルールを同時に作成する
                  </FieldLabel>
                  <FieldDescription>
                    勤務先作成と同時に、最初の給与ルールを作成します。
                  </FieldDescription>
                </FieldContent>
              </Field>

              {createInitialRule ? (
                <>
                  <Field data-invalid={Boolean(errors.startDate)}>
                    <FieldLabel htmlFor="initial-rule-start-date">
                      適用開始日
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="initial-rule-start-date"
                        type="date"
                        value={initialRuleValues.startDate}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setInitialRuleValues((current) => ({
                            ...current,
                            startDate: nextValue,
                          }));
                        }}
                        className="max-w-40"
                      />
                      <FormErrorMessage message={errors.startDate} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.endDate)}>
                    <FieldLabel htmlFor="initial-rule-end-date">
                      適用終了日
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="initial-rule-end-date"
                        type="date"
                        value={initialRuleValues.endDate}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setInitialRuleValues((current) => ({
                            ...current,
                            endDate: nextValue,
                          }));
                        }}
                        className="max-w-40"
                      />
                      <FieldDescription>
                        空欄の場合は現在有効として扱います。
                      </FieldDescription>
                      <FormErrorMessage message={errors.endDate} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.baseHourlyWage)}>
                    <FieldLabel htmlFor="initial-rule-base-hourly-wage">
                      基本時給
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center gap-2">
                        <Input
                          id="initial-rule-base-hourly-wage"
                          type="number"
                          min="0"
                          step="10"
                          value={initialRuleValues.baseHourlyWage}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              baseHourlyWage: nextValue,
                            }));
                          }}
                          className="max-w-20"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">
                          円/時
                        </span>
                      </div>
                      <FormErrorMessage message={errors.baseHourlyWage} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.holidayHourlyWage)}>
                    <FieldLabel htmlFor="initial-rule-holiday-hourly-wage">
                      休日時給
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center gap-2">
                        <Input
                          id="initial-rule-holiday-hourly-wage"
                          type="number"
                          min="0"
                          step="10"
                          value={initialRuleValues.holidayHourlyWage}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              holidayHourlyWage: nextValue,
                            }));
                          }}
                          className="max-w-20"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">
                          円/時
                        </span>
                      </div>
                      <FieldDescription>
                        空欄の場合、基本時給と同等として扱います。
                      </FieldDescription>
                      <FormErrorMessage message={errors.holidayHourlyWage} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.nightMultiplier)}>
                    <FieldLabel htmlFor="initial-rule-night-multiplier">
                      深夜割増率
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center gap-2">
                        <Input
                          id="initial-rule-night-multiplier"
                          type="number"
                          min="1"
                          step="0.01"
                          value={initialRuleValues.nightMultiplier}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              nightMultiplier: nextValue,
                            }));
                          }}
                          className="max-w-20"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">
                          倍
                        </span>
                      </div>
                      <FormErrorMessage message={errors.nightMultiplier} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.overtimeMultiplier)}>
                    <FieldLabel htmlFor="initial-rule-overtime-multiplier">
                      残業割増率
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center gap-2">
                        <Input
                          id="initial-rule-overtime-multiplier"
                          type="number"
                          min="1"
                          step="0.01"
                          value={initialRuleValues.overtimeMultiplier}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              overtimeMultiplier: nextValue,
                            }));
                          }}
                          className="max-w-20"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">
                          倍
                        </span>
                      </div>
                      <FormErrorMessage message={errors.overtimeMultiplier} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.dailyOvertimeThreshold)}>
                    <FieldLabel htmlFor="initial-rule-daily-threshold">
                      1日所定時間
                    </FieldLabel>
                    <FieldContent>
                      <div className="flex items-center gap-2">
                        <Input
                          id="initial-rule-daily-threshold"
                          type="number"
                          min="0"
                          step="0.01"
                          value={initialRuleValues.dailyOvertimeThreshold}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              dailyOvertimeThreshold: nextValue,
                            }));
                          }}
                          className="max-w-16"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">
                          時間
                        </span>
                      </div>
                      <FormErrorMessage
                        message={errors.dailyOvertimeThreshold}
                      />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.nightStart)}>
                    <FieldLabel htmlFor="initial-rule-night-start">
                      深夜開始時刻
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="initial-rule-night-start"
                        type="time"
                        value={initialRuleValues.nightStart}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setInitialRuleValues((current) => ({
                            ...current,
                            nightStart: nextValue,
                          }));
                        }}
                        className="max-w-24"
                      />
                      <FormErrorMessage message={errors.nightStart} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.nightEnd)}>
                    <FieldLabel htmlFor="initial-rule-night-end">
                      深夜終了時刻
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="initial-rule-night-end"
                        type="time"
                        value={initialRuleValues.nightEnd}
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setInitialRuleValues((current) => ({
                            ...current,
                            nightEnd: nextValue,
                          }));
                        }}
                        className="max-w-24"
                      />
                      <FormErrorMessage message={errors.nightEnd} />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(errors.holidayType)}>
                    <FieldLabel>休日判定</FieldLabel>
                    <FieldContent>
                      <RadioGroup
                        value={initialRuleValues.holidayType}
                        onValueChange={(value) => {
                          setInitialRuleValues((current) => ({
                            ...current,
                            holidayType: value as HolidayType,
                          }));
                        }}
                      >
                        <Field orientation="horizontal">
                          <RadioGroupItem
                            id="initial-rule-holiday-type-none"
                            value="NONE"
                          />
                          <FieldLabel htmlFor="initial-rule-holiday-type-none">
                            {formatHolidayType("NONE")}
                          </FieldLabel>
                        </Field>
                        <Field orientation="horizontal">
                          <RadioGroupItem
                            id="initial-rule-holiday-type-weekend"
                            value="WEEKEND"
                          />
                          <FieldLabel htmlFor="initial-rule-holiday-type-weekend">
                            {formatHolidayType("WEEKEND")}
                          </FieldLabel>
                        </Field>
                        <Field orientation="horizontal">
                          <RadioGroupItem
                            id="initial-rule-holiday-type-holiday"
                            value="HOLIDAY"
                          />
                          <FieldLabel htmlFor="initial-rule-holiday-type-holiday">
                            {formatHolidayType("HOLIDAY")}
                          </FieldLabel>
                        </Field>
                        <Field orientation="horizontal">
                          <RadioGroupItem
                            id="initial-rule-holiday-type-weekend-holiday"
                            value="WEEKEND_HOLIDAY"
                          />
                          <FieldLabel htmlFor="initial-rule-holiday-type-weekend-holiday">
                            {formatHolidayType("WEEKEND_HOLIDAY")}
                          </FieldLabel>
                        </Field>
                      </RadioGroup>
                      <FormErrorMessage message={errors.holidayType} />
                    </FieldContent>
                  </Field>
                </>
              ) : null}
            </>
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
                router.push("/my/workplaces");
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { FormLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { dateKeyFromApiDate } from "@/lib/calendar/date";
import { formatHolidayType, formatWorkplaceType } from "@/lib/enum-labels";
import { messages, toErrorMessage } from "@/lib/messages";
import {
  buildActionableErrorMessage,
  classifyApiErrorKind,
} from "@/lib/user-facing-error";

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
  holidayHourlyWage: string;
  nightMultiplier: string;
  overtimeMultiplier: string;
  dailyOvertimeThreshold: string;
  nightStart: string;
  nightEnd: string;
  holidayType: HolidayType;
};

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;
type NumericValue = string | number;

type WorkplaceSummary = {
  id: string;
  name: string;
  type: WorkplaceType;
};

type PayrollRuleDetail = {
  id: string;
  workplaceId: string;
  startDate: string;
  endDate: string | null;
  baseHourlyWage: NumericValue;
  holidayHourlyWage: NumericValue | null;
  nightMultiplier: NumericValue;
  overtimeMultiplier: NumericValue;
  nightStart: string;
  nightEnd: string;
  dailyOvertimeThreshold: NumericValue;
  holidayType: HolidayType;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkplaceType(value: unknown): value is WorkplaceType {
  return value === "GENERAL" || value === "CRAM_SCHOOL";
}

function isHolidayType(value: unknown): value is HolidayType {
  return (
    value === "NONE" ||
    value === "WEEKEND" ||
    value === "HOLIDAY" ||
    value === "WEEKEND_HOLIDAY"
  );
}

function isNumericValue(value: unknown): value is NumericValue {
  return typeof value === "number" || typeof value === "string";
}

function parseWorkplaceResponse(payload: unknown): WorkplaceSummary | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    !isWorkplaceType(data.type)
  ) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
  };
}

function parsePayrollRuleResponse(payload: unknown): PayrollRuleDetail | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.workplaceId !== "string" ||
    typeof data.startDate !== "string" ||
    (typeof data.endDate !== "string" && data.endDate !== null) ||
    !isNumericValue(data.baseHourlyWage) ||
    (!isNumericValue(data.holidayHourlyWage) &&
      data.holidayHourlyWage !== null) ||
    !isNumericValue(data.nightMultiplier) ||
    !isNumericValue(data.overtimeMultiplier) ||
    typeof data.nightStart !== "string" ||
    typeof data.nightEnd !== "string" ||
    !isNumericValue(data.dailyOvertimeThreshold) ||
    !isHolidayType(data.holidayType)
  ) {
    return null;
  }

  return {
    id: data.id,
    workplaceId: data.workplaceId,
    startDate: data.startDate,
    endDate: data.endDate,
    baseHourlyWage: data.baseHourlyWage,
    holidayHourlyWage: data.holidayHourlyWage,
    nightMultiplier: data.nightMultiplier,
    overtimeMultiplier: data.overtimeMultiplier,
    nightStart: data.nightStart,
    nightEnd: data.nightEnd,
    dailyOvertimeThreshold: data.dailyOvertimeThreshold,
    holidayType: data.holidayType,
  };
}

function parseUpsertWarningMessage(payload: unknown): string | null {
  if (!isRecord(payload) || payload.warning == null) {
    return null;
  }

  if (
    !isRecord(payload.warning) ||
    typeof payload.warning.message !== "string"
  ) {
    return null;
  }

  return payload.warning.message;
}

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

function shiftDateKeyByDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (
    Number.isInteger(year) === false ||
    Number.isInteger(month) === false ||
    Number.isInteger(day) === false
  ) {
    return value;
  }

  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

type ParsedApiError = {
  message: string;
  fieldErrors: Record<string, string>;
};

async function parseApiError(
  response: Response,
  fallback: string,
): Promise<ParsedApiError> {
  let fieldErrors: Record<string, string> = {};
  let code: string | null = null;
  let requiresCalendarSetup = false;

  try {
    const payload = (await response.json()) as {
      details?: unknown;
    };

    if (
      payload.details &&
      typeof payload.details === "object" &&
      "fieldErrors" in payload.details
    ) {
      const rawFieldErrors = (payload.details as { fieldErrors?: unknown })
        .fieldErrors;
      if (rawFieldErrors && typeof rawFieldErrors === "object") {
        Object.entries(rawFieldErrors).forEach(([field, detail]) => {
          if (Array.isArray(detail) === false) {
            return;
          }

          const firstMessage = detail.find(
            (message): message is string =>
              typeof message === "string" && message.length > 0,
          );
          if (firstMessage) {
            fieldErrors[field] = firstMessage;
          }
        });
      }
    }
    if (payload.details && typeof payload.details === "object") {
      const detailsRecord = payload.details as Record<string, unknown>;
      if (typeof detailsRecord.code === "string") {
        code = detailsRecord.code;
      }
      if (detailsRecord.requiresCalendarSetup === true) {
        requiresCalendarSetup = true;
      }
    }
  } catch {
    fieldErrors = {};
  }

  const kind = classifyApiErrorKind({
    status: response.status,
    code,
    requiresCalendarSetup,
  });

  return {
    message: buildActionableErrorMessage(fallback, kind),
    fieldErrors,
  };
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.startDate) {
    errors.startDate = "開始日は必須です。";
  }

  if (values.endDate && values.startDate && values.endDate < values.startDate) {
    errors.endDate = "終了日は開始日以降の日付を指定してください。";
  }

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
  if (!values.dailyOvertimeThreshold || Number.isFinite(threshold) === false) {
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

  return errors;
}

export function PayrollRuleForm({
  mode,
  workplaceId,
  ruleId,
}: PayrollRuleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [workplace, setWorkplace] = useState<WorkplaceSummary | null>(null);
  const [values, setValues] = useState<FormValues>({
    startDate: "",
    endDate: "",
    baseHourlyWage: "1000",
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

        const workplacePayload = parseWorkplaceResponse(
          (await workplaceResponse.json()) as unknown,
        );
        if (!workplacePayload) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }
        setWorkplace(workplacePayload);

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

          const rule = parsePayrollRuleResponse(
            (await ruleResponse.json()) as unknown,
          );
          if (!rule) {
            throw new Error("給与ルールレスポンスの形式が不正です。");
          }
          setValues({
            startDate: dateKeyFromApiDate(rule.startDate),
            endDate: rule.endDate
              ? shiftDateKeyByDays(dateKeyFromApiDate(rule.endDate), -1)
              : "",
            baseHourlyWage: toNumberString(rule.baseHourlyWage),
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
          form: toErrorMessage(error, "給与ルール情報の取得に失敗しました。"),
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
    const validationErrors = validate(values);
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
    const loadingToastId = toast.loading("給与ルールを保存中です...");

    const payload = {
      startDate: values.startDate,
      endDate: values.endDate ? shiftDateKeyByDays(values.endDate, 1) : null,
      baseHourlyWage: Number(values.baseHourlyWage),
      holidayHourlyWage: values.holidayHourlyWage
        ? Number(values.holidayHourlyWage)
        : null,
      nightMultiplier: Number(values.nightMultiplier),
      overtimeMultiplier: Number(values.overtimeMultiplier),
      dailyOvertimeThreshold: Number(values.dailyOvertimeThreshold),
      nightStart: values.nightStart,
      nightEnd: values.nightEnd,
      holidayType: values.holidayType,
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
        toast.error(messages.error.payrollRuleSaveFailed, {
          id: loadingToastId,
          description: parsedError.message,
          duration: 6000,
        });
        return;
      }

      const warningMessage = parseUpsertWarningMessage(
        (await response.json()) as unknown,
      );

      if (warningMessage) {
        toast.warning(messages.warning.payrollRuleOverlap, {
          id: loadingToastId,
          description: warningMessage,
          duration: 6000,
        });
        router.push(listHref);
      } else {
        toast.success(
          isEdit
            ? messages.success.payrollRuleUpdated
            : messages.success.payrollRuleCreated,
          {
            id: loadingToastId,
          },
        );
        router.push(listHref);
      }
    } catch (error) {
      console.error("failed to submit payroll rule form", error);
      const message = toErrorMessage(
        error,
        messages.error.payrollRuleSaveFailed,
      );
      setErrors({
        form: message,
      });
      toast.error(messages.error.payrollRuleSaveFailed, {
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
          {workplace
            ? `${workplace.name}（${formatWorkplaceType(workplace.type)}）の給与ルールを設定します。`
            : "勤務先ごとの給与ルールを設定します。"}
        </p>
      </header>

      {isLoading ? (
        <FormLoadingSkeleton />
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
                  const nextValue = event.currentTarget.value;
                  setValues((current) => ({
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
            <FieldLabel htmlFor="end-date">終了日</FieldLabel>
            <FieldContent>
              <Input
                id="end-date"
                type="date"
                value={values.endDate}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setValues((current) => ({
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
            <FieldLabel htmlFor="base-hourly-wage">基本時給</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="base-hourly-wage"
                  type="number"
                  min="0"
                  step="10"
                  value={values.baseHourlyWage}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      baseHourlyWage: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  円/時
                </span>
              </div>
              <FormErrorMessage message={errors.baseHourlyWage} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.holidayHourlyWage)}>
            <FieldLabel htmlFor="holiday-hourly-wage">休日時給</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="holiday-hourly-wage"
                  type="number"
                  min="0"
                  step="10"
                  value={values.holidayHourlyWage}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      holidayHourlyWage: nextValue,
                    }));
                  }}
                  className="max-w-24"
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
            <FieldLabel htmlFor="night-multiplier">深夜割増率</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="night-multiplier"
                  type="number"
                  min="1"
                  step="0.01"
                  value={values.nightMultiplier}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      nightMultiplier: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  倍
                </span>
              </div>
              <FormErrorMessage message={errors.nightMultiplier} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.overtimeMultiplier)}>
            <FieldLabel htmlFor="overtime-multiplier">残業割増率</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="overtime-multiplier"
                  type="number"
                  min="1"
                  step="0.01"
                  value={values.overtimeMultiplier}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      overtimeMultiplier: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  倍
                </span>
              </div>
              <FormErrorMessage message={errors.overtimeMultiplier} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.dailyOvertimeThreshold)}>
            <FieldLabel htmlFor="daily-overtime-threshold">
              1日所定時間
            </FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="daily-overtime-threshold"
                  type="number"
                  min="0"
                  step="0.25"
                  value={values.dailyOvertimeThreshold}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      dailyOvertimeThreshold: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  時間
                </span>
              </div>
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
                  const nextValue = event.currentTarget.value;
                  setValues((current) => ({
                    ...current,
                    nightStart: nextValue,
                  }));
                }}
                className="max-w-32"
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
                  const nextValue = event.currentTarget.value;
                  setValues((current) => ({
                    ...current,
                    nightEnd: nextValue,
                  }));
                }}
                className="max-w-32"
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
                  <RadioGroupItem id="holiday-type-none" value="NONE" />
                  <FieldLabel htmlFor="holiday-type-none">
                    {formatHolidayType("NONE")}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="holiday-type-weekend" value="WEEKEND" />
                  <FieldLabel htmlFor="holiday-type-weekend">
                    {formatHolidayType("WEEKEND")}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="holiday-type-holiday" value="HOLIDAY" />
                  <FieldLabel htmlFor="holiday-type-holiday">
                    {formatHolidayType("HOLIDAY")}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem
                    id="holiday-type-weekend-holiday"
                    value="WEEKEND_HOLIDAY"
                  />
                  <FieldLabel htmlFor="holiday-type-weekend-holiday">
                    {formatHolidayType("WEEKEND_HOLIDAY")}
                  </FieldLabel>
                </Field>
              </RadioGroup>
            </FieldContent>
          </Field>

          {workplace?.type === "CRAM_SCHOOL" ? (
            <Field>
              <FieldLabel>補足</FieldLabel>
              <FieldContent>
                <FieldDescription>
                  塾タイプでも通常シフトと同様に時給・割増設定を使用します。
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

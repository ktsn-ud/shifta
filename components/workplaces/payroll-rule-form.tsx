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
  holidayAllowanceHourly: string;
  nightPremiumRate: string;
  overtimePremiumRate: string;
  dailyOvertimeThreshold: string;
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
  holidayAllowanceHourly: NumericValue | null;
  nightPremiumRate: NumericValue;
  overtimePremiumRate: NumericValue;
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
    (!isNumericValue(data.holidayAllowanceHourly) &&
      data.holidayAllowanceHourly !== null) ||
    !isNumericValue(data.nightPremiumRate) ||
    !isNumericValue(data.overtimePremiumRate) ||
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
    holidayAllowanceHourly: data.holidayAllowanceHourly,
    nightPremiumRate: data.nightPremiumRate,
    overtimePremiumRate: data.overtimePremiumRate,
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

  if (values.holidayAllowanceHourly) {
    const holidayAllowanceHourly = Number(values.holidayAllowanceHourly);
    if (
      Number.isFinite(holidayAllowanceHourly) === false ||
      holidayAllowanceHourly < 0
    ) {
      errors.holidayAllowanceHourly =
        "休日手当（円/時）は0以上で入力してください。";
    }
  }

  const nightPremiumRate = Number(values.nightPremiumRate);
  if (!values.nightPremiumRate || Number.isFinite(nightPremiumRate) === false) {
    errors.nightPremiumRate = "深夜割増率は必須です。";
  } else if (nightPremiumRate < 0) {
    errors.nightPremiumRate = "深夜割増率は0以上で入力してください。";
  }

  const overtimePremiumRate = Number(values.overtimePremiumRate);
  if (
    !values.overtimePremiumRate ||
    Number.isFinite(overtimePremiumRate) === false
  ) {
    errors.overtimePremiumRate = "残業割増率は必須です。";
  } else if (overtimePremiumRate < 0) {
    errors.overtimePremiumRate = "残業割増率は0以上で入力してください。";
  }

  const threshold = Number(values.dailyOvertimeThreshold);
  if (!values.dailyOvertimeThreshold || Number.isFinite(threshold) === false) {
    errors.dailyOvertimeThreshold = "1日所定時間は必須です。";
  } else if (threshold <= 0) {
    errors.dailyOvertimeThreshold = "1日所定時間は正の数で入力してください。";
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
    holidayAllowanceHourly: "0",
    nightPremiumRate: "0.25",
    overtimePremiumRate: "0.25",
    dailyOvertimeThreshold: "8",
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
            holidayAllowanceHourly: toNumberString(rule.holidayAllowanceHourly),
            nightPremiumRate: toNumberString(rule.nightPremiumRate),
            overtimePremiumRate: toNumberString(rule.overtimePremiumRate),
            dailyOvertimeThreshold: toNumberString(rule.dailyOvertimeThreshold),
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
      holidayAllowanceHourly: values.holidayAllowanceHourly
        ? Number(values.holidayAllowanceHourly)
        : 0,
      nightPremiumRate: Number(values.nightPremiumRate),
      overtimePremiumRate: Number(values.overtimePremiumRate),
      dailyOvertimeThreshold: Number(values.dailyOvertimeThreshold),
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

          <Field data-invalid={Boolean(errors.holidayAllowanceHourly)}>
            <FieldLabel htmlFor="holiday-allowance-hourly">
              休日手当（時間あたり）
            </FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="holiday-allowance-hourly"
                  type="number"
                  min="0"
                  step="10"
                  value={values.holidayAllowanceHourly}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      holidayAllowanceHourly: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  円/時
                </span>
              </div>
              <FieldDescription>
                休日勤務時間に対して加算する手当です。
              </FieldDescription>
              <FormErrorMessage message={errors.holidayAllowanceHourly} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.nightPremiumRate)}>
            <FieldLabel htmlFor="night-premium-rate">深夜割増率</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="night-premium-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.nightPremiumRate}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      nightPremiumRate: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  率
                </span>
              </div>
              <FieldDescription>例: 0.25 = 25%</FieldDescription>
              <FormErrorMessage message={errors.nightPremiumRate} />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(errors.overtimePremiumRate)}>
            <FieldLabel htmlFor="overtime-premium-rate">
              所定時間外割増率（保留）
            </FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="overtime-premium-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.overtimePremiumRate}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setValues((current) => ({
                      ...current,
                      overtimePremiumRate: nextValue,
                    }));
                  }}
                  className="max-w-24"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  率
                </span>
              </div>
              <FieldDescription>
                将来拡張のため保持します（現時点の計算では未使用）。
              </FieldDescription>
              <FormErrorMessage message={errors.overtimePremiumRate} />
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

          <Field>
            <FieldLabel>深夜時間帯</FieldLabel>
            <FieldContent>
              <FieldDescription>
                深夜時間帯は 22:00〜05:00 で固定です。
              </FieldDescription>
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

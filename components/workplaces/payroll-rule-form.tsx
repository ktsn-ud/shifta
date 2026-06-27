"use client";

import { useCallback, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useResetOnRouteHidden } from "@/hooks/use-reset-on-route-hidden";
import { dateKeyFromApiDate } from "@/lib/calendar/date";
import { formatHolidayType, formatWorkplaceType } from "@/lib/enum-labels";
import { parseGoogleSyncStateFromPayload } from "@/lib/google-calendar/clientSync";
import { messages, toErrorMessage } from "@/lib/messages";
import { fetchJson } from "@/lib/query/fetch-json";
import { invalidateAfterPayrollRuleMutation } from "@/lib/query/invalidation";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  buildActionableErrorMessage,
  classifyApiErrorKind,
  toUserFacingMessage,
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

type ParsedApiError = {
  message: string;
  fieldErrors: Record<string, string>;
};

type PayrollRuleFormState = {
  values: FormValues;
  errors: FormErrors;
  isSubmitting: boolean;
};

type PayrollRuleFormAction =
  | { type: "reset"; initialValues: FormValues | null }
  | {
      type: "updateField";
      key: keyof FormValues;
      value: FormValues[keyof FormValues];
    }
  | { type: "setErrors"; errors: FormErrors }
  | { type: "setFormError"; message: string }
  | { type: "startSubmit" }
  | { type: "setSubmitting"; isSubmitting: boolean };

type PayrollRuleEditorFormProps = {
  mode: PayrollRuleFormMode;
  workplaceId: string;
  ruleId?: string;
  workplace?: WorkplaceSummary | null;
  initialValues: FormValues | null;
  listHref: string;
  externalFormError?: string;
};

type PayrollRuleEditorController = {
  isEdit: boolean;
  pageTitle: string;
  values: FormValues;
  errors: FormErrors;
  isSubmitting: boolean;
  formErrorMessage?: string;
  updateField: <Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) => void;
  submit: () => Promise<void>;
  cancel: () => void;
};

type PayrollRuleDateFieldsProps = Pick<
  PayrollRuleEditorController,
  "values" | "errors" | "updateField"
>;

type PayrollRuleValueFieldsProps = Pick<
  PayrollRuleEditorController,
  "values" | "errors" | "updateField"
>;

type PayrollRuleHolidayTypeFieldProps = Pick<
  PayrollRuleEditorController,
  "values" | "updateField"
>;

const FORM_VALUE_KEYS = [
  "startDate",
  "endDate",
  "baseHourlyWage",
  "holidayAllowanceHourly",
  "nightPremiumRate",
  "overtimePremiumRate",
  "dailyOvertimeThreshold",
  "holidayType",
] as const satisfies ReadonlyArray<keyof FormValues>;

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

function createInitialPayrollRuleValues(): FormValues {
  return {
    startDate: "",
    endDate: "",
    baseHourlyWage: "1000",
    holidayAllowanceHourly: "0",
    nightPremiumRate: "0.25",
    overtimePremiumRate: "0.25",
    dailyOvertimeThreshold: "8",
    holidayType: "NONE",
  };
}

function createFormValuesFromPayrollRule(rule: PayrollRuleDetail): FormValues {
  return {
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
  };
}

function createPayrollRuleFormState(
  initialValues: FormValues | null,
): PayrollRuleFormState {
  return {
    values: initialValues ?? createInitialPayrollRuleValues(),
    errors: {},
    isSubmitting: false,
  };
}

function clearFieldError(
  currentErrors: FormErrors,
  key: keyof FormValues,
): FormErrors {
  if (!currentErrors[key]) {
    return currentErrors;
  }

  const nextErrors = { ...currentErrors };
  delete nextErrors[key];
  return nextErrors;
}

async function parseApiError(
  response: Response,
  fallback: string,
): Promise<ParsedApiError> {
  let fieldErrors: Record<string, string> = {};
  let code: string | null = null;
  let requiresCalendarSetup = false;
  let requiresSignOut = false;

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
      if (detailsRecord.requiresSignOut === true) {
        requiresSignOut = true;
      }
    }
  } catch {
    fieldErrors = {};
  }

  const kind = classifyApiErrorKind({
    status: response.status,
    code,
    requiresCalendarSetup,
    requiresSignOut,
  });

  return {
    message: buildActionableErrorMessage(fallback, kind),
    fieldErrors,
  };
}

function toFormErrors(fieldErrors: Record<string, string>): FormErrors {
  const nextErrors: FormErrors = {};

  for (const key of FORM_VALUE_KEYS) {
    const message = fieldErrors[key];
    if (typeof message === "string" && message.length > 0) {
      nextErrors[key] = message;
    }
  }

  return nextErrors;
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

function findFirstValidationMessage(errors: FormErrors): string | undefined {
  return Object.values(errors).find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function payrollRuleFormReducer(
  state: PayrollRuleFormState,
  action: PayrollRuleFormAction,
): PayrollRuleFormState {
  switch (action.type) {
    case "reset":
      return createPayrollRuleFormState(action.initialValues);
    case "updateField":
      return {
        ...state,
        values: {
          ...state.values,
          [action.key]: action.value,
        },
        errors: clearFieldError(state.errors, action.key),
      };
    case "setErrors":
      return {
        ...state,
        errors: action.errors,
      };
    case "setFormError":
      return {
        ...state,
        errors: {
          ...state.errors,
          form: action.message,
        },
      };
    case "startSubmit":
      return {
        ...state,
        errors: {},
        isSubmitting: true,
      };
    case "setSubmitting":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
  }
}

function PayrollRuleDateFields({
  values,
  errors,
  updateField,
}: PayrollRuleDateFieldsProps) {
  return (
    <>
      <Field data-invalid={Boolean(errors.startDate)}>
        <FieldLabel htmlFor="start-date">開始日</FieldLabel>
        <FieldContent>
          <Input
            id="start-date"
            type="date"
            value={values.startDate}
            onChange={(event) =>
              updateField("startDate", event.currentTarget.value)
            }
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
            onChange={(event) =>
              updateField("endDate", event.currentTarget.value)
            }
            className="max-w-40"
          />
          <FieldDescription>
            空欄の場合は現在有効として扱います。
          </FieldDescription>
          <FormErrorMessage message={errors.endDate} />
        </FieldContent>
      </Field>
    </>
  );
}

function PayrollRuleValueFields({
  values,
  errors,
  updateField,
}: PayrollRuleValueFieldsProps) {
  return (
    <>
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
              onChange={(event) =>
                updateField("baseHourlyWage", event.currentTarget.value)
              }
              className="max-w-24"
            />
            <span className="shrink-0 text-sm text-muted-foreground">
              円/時
            </span>
          </div>
          <FormErrorMessage message={errors.baseHourlyWage} />
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
              onChange={(event) =>
                updateField("nightPremiumRate", event.currentTarget.value)
              }
              className="max-w-24"
            />
            <span className="shrink-0 text-sm text-muted-foreground">率</span>
          </div>
          <FieldDescription>例: 0.25 = 25%</FieldDescription>
          <FormErrorMessage message={errors.nightPremiumRate} />
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
              onChange={(event) =>
                updateField("holidayAllowanceHourly", event.currentTarget.value)
              }
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
              onChange={(event) =>
                updateField("overtimePremiumRate", event.currentTarget.value)
              }
              className="max-w-24"
            />
            <span className="shrink-0 text-sm text-muted-foreground">率</span>
          </div>
          <FieldDescription>
            将来拡張のため保持します（現時点の計算では未使用）。
          </FieldDescription>
          <FormErrorMessage message={errors.overtimePremiumRate} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.dailyOvertimeThreshold)}>
        <FieldLabel htmlFor="daily-overtime-threshold">1日所定時間</FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="daily-overtime-threshold"
              type="number"
              min="0"
              step="0.25"
              value={values.dailyOvertimeThreshold}
              onChange={(event) =>
                updateField("dailyOvertimeThreshold", event.currentTarget.value)
              }
              className="max-w-24"
            />
            <span className="shrink-0 text-sm text-muted-foreground">時間</span>
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
    </>
  );
}

function PayrollRuleHolidayTypeField({
  values,
  updateField,
}: PayrollRuleHolidayTypeFieldProps) {
  return (
    <Field>
      <FieldLabel>休日判定</FieldLabel>
      <FieldContent>
        <RadioGroup
          value={values.holidayType}
          onValueChange={(value) => {
            if (isHolidayType(value)) {
              updateField("holidayType", value);
            }
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
  );
}

function usePayrollRuleEditorController({
  mode,
  workplaceId,
  ruleId,
  initialValues,
  listHref,
  externalFormError,
}: PayrollRuleEditorFormProps): PayrollRuleEditorController {
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "給与ルール編集" : "給与ルール作成";
  const [state, dispatch] = useReducer(
    payrollRuleFormReducer,
    initialValues,
    createPayrollRuleFormState,
  );
  const resetFormState = useCallback(() => {
    dispatch({
      type: "reset",
      initialValues,
    });
  }, [initialValues]);
  const { markForResetOnRouteHidden } = useResetOnRouteHidden(resetFormState);

  async function submit() {
    const validationErrors = validate(state.values);
    if (Object.keys(validationErrors).length > 0) {
      dispatch({
        type: "setErrors",
        errors: validationErrors,
      });
      const firstValidationMessage =
        findFirstValidationMessage(validationErrors);
      toast.error(messages.error.validation, {
        description: firstValidationMessage,
        duration: 6000,
      });
      return;
    }

    dispatch({ type: "startSubmit" });
    const loadingToastId = toast.loading("給与ルールを保存中です...");

    const payload = {
      startDate: state.values.startDate,
      endDate: state.values.endDate
        ? shiftDateKeyByDays(state.values.endDate, 1)
        : null,
      baseHourlyWage: Number(state.values.baseHourlyWage),
      holidayAllowanceHourly: state.values.holidayAllowanceHourly
        ? Number(state.values.holidayAllowanceHourly)
        : 0,
      nightPremiumRate: Number(state.values.nightPremiumRate),
      overtimePremiumRate: Number(state.values.overtimePremiumRate),
      dailyOvertimeThreshold: Number(state.values.dailyOvertimeThreshold),
      holidayType: state.values.holidayType,
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

        dispatch({
          type: "setErrors",
          errors: {
            ...toFormErrors(parsedError.fieldErrors),
            form: parsedError.message,
          },
        });
        toast.error(messages.error.payrollRuleSaveFailed, {
          id: loadingToastId,
          description: parsedError.message,
          duration: 6000,
        });
        return;
      }

      const responsePayload = (await response.json()) as unknown;
      const syncState = parseGoogleSyncStateFromPayload(
        responsePayload,
        messages.error.calendarSyncFailed,
      );
      await invalidateAfterPayrollRuleMutation(queryClient, workplaceId);
      const warningMessage = parseUpsertWarningMessage(responsePayload);

      if (warningMessage) {
        toast.warning(messages.warning.payrollRuleOverlap, {
          id: loadingToastId,
          description: warningMessage,
          duration: 6000,
        });
        markForResetOnRouteHidden();
        router.push(listHref);
        return;
      }

      toast.success(
        isEdit
          ? messages.success.payrollRuleUpdated
          : messages.success.payrollRuleCreated,
        {
          id: loadingToastId,
          description: buildMutationSuccessDescription({
            syncPending: syncState.pending,
          }),
        },
      );
      markForResetOnRouteHidden();
      router.push(listHref);
    } catch (error) {
      console.error("failed to submit payroll rule form", error);
      const message = toErrorMessage(
        error,
        messages.error.payrollRuleSaveFailed,
      );
      dispatch({
        type: "setFormError",
        message,
      });
      toast.error(messages.error.payrollRuleSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      dispatch({ type: "setSubmitting", isSubmitting: false });
    }
  }

  return {
    isEdit,
    pageTitle,
    values: state.values,
    errors: state.errors,
    isSubmitting: state.isSubmitting,
    formErrorMessage: state.errors.form ?? externalFormError,
    updateField: (key, value) => {
      dispatch({
        type: "updateField",
        key,
        value,
      });
    },
    submit,
    cancel: () => {
      markForResetOnRouteHidden();
      router.push(listHref);
    },
  };
}

function PayrollRuleEditorForm({
  mode,
  workplaceId,
  ruleId,
  workplace,
  initialValues,
  listHref,
  externalFormError,
}: PayrollRuleEditorFormProps) {
  const controller = usePayrollRuleEditorController({
    mode,
    workplaceId,
    ruleId,
    workplace,
    initialValues,
    listHref,
    externalFormError,
  });

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{controller.pageTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {workplace
            ? `${workplace.name}（${formatWorkplaceType(workplace.type)}）の給与ルールを設定します。`
            : "勤務先ごとの給与ルールを設定します。"}
        </p>
      </header>

      <Form
        className="max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.submit();
        }}
      >
        <PayrollRuleDateFields
          values={controller.values}
          errors={controller.errors}
          updateField={controller.updateField}
        />

        <PayrollRuleValueFields
          values={controller.values}
          errors={controller.errors}
          updateField={controller.updateField}
        />

        <PayrollRuleHolidayTypeField
          values={controller.values}
          updateField={controller.updateField}
        />

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

        <FormErrorMessage message={controller.formErrorMessage} />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={controller.isSubmitting}>
            {controller.isSubmitting
              ? "保存中..."
              : controller.isEdit
                ? "保存"
                : "作成"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={controller.isSubmitting}
            onClick={controller.cancel}
          >
            キャンセル
          </Button>
        </div>
      </Form>
    </section>
  );
}

export function PayrollRuleForm({
  mode,
  workplaceId,
  ruleId,
}: PayrollRuleFormProps) {
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "給与ルール編集" : "給与ルール作成";
  const {
    data: workplaceData,
    error: workplaceError,
    isPending: isWorkplacePending,
  } = useQuery({
    queryKey: queryKeys.workplaces.detailSummary({
      workplaceId,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "勤務先情報の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseWorkplaceResponse(payload);
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
  const workplace = workplaceData ?? null;
  const {
    data: payrollRuleData,
    error: payrollRuleError,
    isPending: isPayrollRulePending,
  } = useQuery({
    queryKey: queryKeys.workplaces.payrollRuleDetail({
      workplaceId,
      ruleId: ruleId ?? "",
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}/payroll-rules/${ruleId}`, {
        init: { signal, cache: "no-store" },
        fallbackMessage: "給与ルールの取得に失敗しました。",
        parse: (payload) => {
          const parsed = parsePayrollRuleResponse(payload);
          if (!parsed) {
            throw new Error("PAYROLL_RULE_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled: isEdit && Boolean(ruleId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const isLoading =
    isWorkplacePending || (isEdit && Boolean(ruleId) && isPayrollRulePending);
  const externalFormError =
    isEdit && !ruleId
      ? "編集対象の給与ルールIDが指定されていません。"
      : payrollRuleError
        ? toUserFacingMessage(
            payrollRuleError,
            "給与ルール情報の取得に失敗しました。",
          )
        : workplaceError
          ? toUserFacingMessage(
              workplaceError,
              "勤務先情報の取得に失敗しました。",
            )
          : undefined;

  if (isLoading) {
    return (
      <section className="space-y-6 p-4 md:p-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">
            勤務先ごとの給与ルールを設定します。
          </p>
        </header>
        <FormLoadingSkeleton />
      </section>
    );
  }

  return (
    <PayrollRuleEditorForm
      key={ruleId ?? `create-${workplaceId}`}
      mode={mode}
      workplaceId={workplaceId}
      ruleId={ruleId}
      workplace={workplace}
      initialValues={
        payrollRuleData
          ? createFormValuesFromPayrollRule(payrollRuleData)
          : null
      }
      listHref={`/my/workplaces/${workplaceId}/payroll-rules`}
      externalFormError={externalFormError}
    />
  );
}

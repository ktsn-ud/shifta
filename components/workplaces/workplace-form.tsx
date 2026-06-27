"use client";
import { useCallback, useReducer } from "react";
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
import { formatHolidayType, formatWorkplaceType } from "@/lib/enum-labels";
import { parseGoogleSyncStateFromPayload } from "@/lib/google-calendar/clientSync";
import { messages, toErrorMessage } from "@/lib/messages";
import { invalidateAfterWorkplaceMutation } from "@/lib/query/invalidation";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import {
  type WorkplaceEditDetailItem,
  useWorkplaceEditDetailQuery,
} from "@/lib/query/queries/workplaces";
import {
  resolveUserFacingErrorFromResponse,
  toUserFacingMessage,
} from "@/lib/user-facing-error";
import { useResetOnRouteHidden } from "@/hooks/use-reset-on-route-hidden";

const colorRegex = /^#[0-9A-Fa-f]{6}$/;
const PAYROLL_DAY_MIN = 1;
const PAYROLL_DAY_MAX = 31;

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
type ClosingDayType = "DAY_OF_MONTH" | "END_OF_MONTH";
type CreateWorkplaceFormProps = {
  mode: "create";
  initialRuleStartDate: string;
};

type EditWorkplaceFormProps = {
  mode: "edit";
  workplaceId: string;
};

type WorkplaceFormProps = CreateWorkplaceFormProps | EditWorkplaceFormProps;

type FormValues = {
  name: string;
  type: WorkplaceType;
  color: string;
  closingDayType: ClosingDayType;
  closingDay: string;
  payday: string;
};

type InitialRuleValues = {
  startDate: string;
  endDate: string;
  baseHourlyWage: string;
  holidayAllowanceHourly: string;
  nightPremiumRate: string;
  overtimePremiumRate: string;
  dailyOvertimeThreshold: string;
  holidayType: HolidayType;
};

type FormErrorKey = keyof FormValues | keyof InitialRuleValues | "form";
type FormErrors = Partial<Record<FormErrorKey, string>>;
type WorkplaceFormSeed = {
  values: FormValues;
  createInitialRule: boolean;
  initialRuleValues: InitialRuleValues;
};

type WorkplaceFormState = WorkplaceFormSeed & {
  errors: FormErrors;
  isSubmitting: boolean;
};

type WorkplaceFormAction =
  | { type: "reset"; seed: WorkplaceFormSeed }
  | { type: "updateValues"; patch: Partial<FormValues> }
  | { type: "updateInitialRuleValues"; patch: Partial<InitialRuleValues> }
  | { type: "setCreateInitialRule"; value: boolean }
  | { type: "setErrors"; errors: FormErrors }
  | { type: "setFormError"; message: string }
  | { type: "startSubmit" }
  | { type: "setSubmitting"; isSubmitting: boolean };

type WorkplaceEditorFormProps = {
  mode: "create" | "edit";
  workplaceId?: string;
  initialSeed: WorkplaceFormSeed;
  externalFormError?: string;
};

type WorkplaceFormValueChange = (patch: Partial<FormValues>) => void;
type WorkplaceInitialRuleValueChange = (
  patch: Partial<InitialRuleValues>,
) => void;

type WorkplaceBasicFieldsSectionProps = {
  values: Pick<FormValues, "name" | "type" | "color">;
  errors: Pick<FormErrors, "name" | "type" | "color">;
  onChange: WorkplaceFormValueChange;
};

type WorkplaceClosingDaySectionProps = {
  values: Pick<FormValues, "closingDayType" | "closingDay">;
  errors: Pick<FormErrors, "closingDayType" | "closingDay">;
  onChange: WorkplaceFormValueChange;
};

type WorkplacePaydayFieldProps = {
  payday: string;
  error?: string;
  onChange: (value: string) => void;
};

type InitialPayrollRuleToggleSectionProps = {
  enabled: boolean;
  state: {
    isSubmitting: boolean;
  };
  onChange: (value: boolean) => void;
};

type InitialPayrollRuleFieldsSectionProps = {
  values: InitialRuleValues;
  errors: Pick<
    FormErrors,
    | "startDate"
    | "endDate"
    | "baseHourlyWage"
    | "nightPremiumRate"
    | "holidayAllowanceHourly"
    | "overtimePremiumRate"
    | "dailyOvertimeThreshold"
    | "holidayType"
  >;
  onChange: WorkplaceInitialRuleValueChange;
};

type WorkplaceEditorActionsProps = {
  submitLabel: string;
  state: {
    isSubmitting: boolean;
  };
  onCancel: () => void;
};

function createInitialWorkplaceValues(): FormValues {
  return {
    name: "",
    type: "GENERAL",
    color: "#3B82F6",
    closingDayType: "END_OF_MONTH",
    closingDay: "",
    payday: "25",
  };
}

function createInitialRuleValues(startDate: string): InitialRuleValues {
  return {
    startDate,
    endDate: "",
    baseHourlyWage: "1000",
    holidayAllowanceHourly: "0",
    nightPremiumRate: "0.25",
    overtimePremiumRate: "0.25",
    dailyOvertimeThreshold: "8",
    holidayType: "NONE",
  };
}

function createFormValuesFromWorkplaceDetail(
  detail: WorkplaceEditDetailItem,
): FormValues {
  return {
    name: detail.name,
    type: detail.type,
    color: detail.color,
    closingDayType: detail.closingDayType,
    closingDay: detail.closingDay === null ? "" : String(detail.closingDay),
    payday: String(detail.payday),
  };
}

function createCreateWorkplaceFormSeed(
  initialRuleStartDate: string,
): WorkplaceFormSeed {
  return {
    values: createInitialWorkplaceValues(),
    createInitialRule: true,
    initialRuleValues: createInitialRuleValues(initialRuleStartDate),
  };
}

function createEditWorkplaceFormSeed(
  initialRuleStartDate: string,
  detail?: WorkplaceEditDetailItem | null,
): WorkplaceFormSeed {
  return {
    values: detail
      ? createFormValuesFromWorkplaceDetail(detail)
      : createInitialWorkplaceValues(),
    createInitialRule: false,
    initialRuleValues: createInitialRuleValues(initialRuleStartDate),
  };
}

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const resolved = await resolveUserFacingErrorFromResponse(response, fallback);
  return resolved.message;
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

  const payday = Number(values.payday);
  if (
    values.payday.length === 0 ||
    Number.isInteger(payday) === false ||
    payday < PAYROLL_DAY_MIN ||
    payday > PAYROLL_DAY_MAX
  ) {
    errors.payday = "給料日は1〜31の整数で入力してください。";
  }

  if (values.closingDayType === "DAY_OF_MONTH") {
    const closingDay = Number(values.closingDay);

    if (
      values.closingDay.length === 0 ||
      Number.isInteger(closingDay) === false ||
      closingDay < PAYROLL_DAY_MIN ||
      closingDay > PAYROLL_DAY_MAX
    ) {
      errors.closingDay = "締日は1〜31の整数で入力してください。";
    } else if (
      errors.payday === undefined &&
      Number.isInteger(payday) &&
      closingDay === payday
    ) {
      errors.closingDay = "締日と給料日は同日に設定できません。";
    }
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

  if (initialRuleValues.holidayAllowanceHourly) {
    const holidayAllowanceHourly = Number(
      initialRuleValues.holidayAllowanceHourly,
    );
    if (
      Number.isFinite(holidayAllowanceHourly) === false ||
      holidayAllowanceHourly < 0
    ) {
      errors.holidayAllowanceHourly =
        "休日手当（円/時）は0以上で入力してください。";
    }
  }

  const nightPremiumRate = Number(initialRuleValues.nightPremiumRate);
  if (
    !initialRuleValues.nightPremiumRate ||
    Number.isFinite(nightPremiumRate) === false
  ) {
    errors.nightPremiumRate = "深夜割増率は必須です。";
  } else if (nightPremiumRate < 0) {
    errors.nightPremiumRate = "深夜割増率は0以上で入力してください。";
  }

  const overtimePremiumRate = Number(initialRuleValues.overtimePremiumRate);
  if (
    !initialRuleValues.overtimePremiumRate ||
    Number.isFinite(overtimePremiumRate) === false
  ) {
    errors.overtimePremiumRate = "残業割増率は必須です。";
  } else if (overtimePremiumRate < 0) {
    errors.overtimePremiumRate = "残業割増率は0以上で入力してください。";
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

  return errors;
}

function clearErrorsForKeys(
  currentErrors: FormErrors,
  keys: readonly FormErrorKey[],
): FormErrors {
  let nextErrors = currentErrors;

  for (const key of keys) {
    if (!nextErrors[key]) {
      continue;
    }

    if (nextErrors === currentErrors) {
      nextErrors = { ...currentErrors };
    }
    delete nextErrors[key];
  }

  return nextErrors;
}

function createWorkplaceFormState(seed: WorkplaceFormSeed): WorkplaceFormState {
  return {
    ...seed,
    errors: {},
    isSubmitting: false,
  };
}

function workplaceFormReducer(
  state: WorkplaceFormState,
  action: WorkplaceFormAction,
): WorkplaceFormState {
  switch (action.type) {
    case "reset":
      return createWorkplaceFormState(action.seed);
    case "updateValues": {
      const keys = Object.keys(action.patch) as Array<keyof FormValues>;
      return {
        ...state,
        values: {
          ...state.values,
          ...action.patch,
        },
        errors: clearErrorsForKeys(state.errors, keys),
      };
    }
    case "updateInitialRuleValues": {
      const keys = Object.keys(action.patch) as Array<keyof InitialRuleValues>;
      return {
        ...state,
        initialRuleValues: {
          ...state.initialRuleValues,
          ...action.patch,
        },
        errors: clearErrorsForKeys(state.errors, keys),
      };
    }
    case "setCreateInitialRule":
      return {
        ...state,
        createInitialRule: action.value,
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

function findFirstValidationMessage(errors: FormErrors): string | undefined {
  return Object.values(errors).find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function WorkplaceEditorHeader({ pageTitle }: { pageTitle: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-xl font-semibold">{pageTitle}</h2>
      <p className="text-sm text-muted-foreground">
        勤務先名・タイプ・表示色・締日・給料日を設定します。
      </p>
    </header>
  );
}

function WorkplaceBasicFieldsSection({
  values,
  errors,
  onChange,
}: WorkplaceBasicFieldsSectionProps) {
  return (
    <>
      <Field data-invalid={Boolean(errors.name)}>
        <FieldLabel htmlFor="workplace-name">勤務先名</FieldLabel>
        <FieldContent>
          <Input
            id="workplace-name"
            value={values.name}
            maxLength={50}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
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
              onChange({ type: value as WorkplaceType });
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem id="workplace-type-general" value="GENERAL" />
              <FieldLabel htmlFor="workplace-type-general">
                {formatWorkplaceType("GENERAL")}
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id="workplace-type-cram" value="CRAM_SCHOOL" />
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
                onChange({ color: event.currentTarget.value });
              }}
            />
            <Input
              value={values.color}
              onChange={(event) => {
                onChange({ color: event.currentTarget.value });
              }}
              className="max-w-50"
            />
          </div>
          <FieldDescription>HEX形式（例: #3B82F6）</FieldDescription>
          <FormErrorMessage message={errors.color} />
        </FieldContent>
      </Field>
    </>
  );
}

function WorkplaceClosingDaySection({
  values,
  errors,
  onChange,
}: WorkplaceClosingDaySectionProps) {
  return (
    <>
      <Field data-invalid={Boolean(errors.closingDayType)}>
        <FieldLabel>締日設定</FieldLabel>
        <FieldContent>
          <RadioGroup
            value={values.closingDayType}
            onValueChange={(value) => {
              onChange({
                closingDayType: value as ClosingDayType,
                closingDay: value === "END_OF_MONTH" ? "" : values.closingDay,
              });
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem
                id="workplace-closing-day-end"
                value="END_OF_MONTH"
              />
              <FieldLabel htmlFor="workplace-closing-day-end">
                月末締め
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem
                id="workplace-closing-day-day"
                value="DAY_OF_MONTH"
              />
              <FieldLabel htmlFor="workplace-closing-day-day">
                日付指定
              </FieldLabel>
            </Field>
          </RadioGroup>
          <FieldDescription>
            月末締めを選択すると、締日は毎月の末日になります。
          </FieldDescription>
          <FormErrorMessage message={errors.closingDayType} />
        </FieldContent>
      </Field>

      {values.closingDayType === "DAY_OF_MONTH" ? (
        <Field data-invalid={Boolean(errors.closingDay)}>
          <FieldLabel htmlFor="workplace-closing-day">締日</FieldLabel>
          <FieldContent>
            <div className="flex items-center gap-2">
              <Input
                id="workplace-closing-day"
                type="number"
                min={PAYROLL_DAY_MIN}
                max={PAYROLL_DAY_MAX}
                step="1"
                value={values.closingDay}
                onChange={(event) => {
                  onChange({ closingDay: event.currentTarget.value });
                }}
                className="max-w-20"
              />
              <span className="shrink-0 text-sm text-muted-foreground">日</span>
            </div>
            <FieldDescription>1〜31の整数で入力してください。</FieldDescription>
            <FormErrorMessage message={errors.closingDay} />
          </FieldContent>
        </Field>
      ) : null}
    </>
  );
}

function WorkplacePaydayField({
  payday,
  error,
  onChange,
}: WorkplacePaydayFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="workplace-payday">給料日</FieldLabel>
      <FieldContent>
        <div className="flex items-center gap-2">
          <Input
            id="workplace-payday"
            type="number"
            min={PAYROLL_DAY_MIN}
            max={PAYROLL_DAY_MAX}
            step="1"
            value={payday}
            onChange={(event) => {
              onChange(event.currentTarget.value);
            }}
            className="max-w-20"
          />
          <span className="shrink-0 text-sm text-muted-foreground">日</span>
        </div>
        <FieldDescription>1〜31の整数で入力してください。</FieldDescription>
        <FormErrorMessage message={error} />
      </FieldContent>
    </Field>
  );
}

function InitialPayrollRuleToggleSection({
  enabled,
  state,
  onChange,
}: InitialPayrollRuleToggleSectionProps) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id="create-initial-rule"
        checked={enabled}
        onCheckedChange={(checked) => {
          onChange(Boolean(checked));
        }}
        disabled={state.isSubmitting}
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
  );
}

function InitialPayrollRuleFieldsSection({
  values,
  errors,
  onChange,
}: InitialPayrollRuleFieldsSectionProps) {
  return (
    <>
      <Field data-invalid={Boolean(errors.startDate)}>
        <FieldLabel htmlFor="initial-rule-start-date">適用開始日</FieldLabel>
        <FieldContent>
          <Input
            id="initial-rule-start-date"
            type="date"
            value={values.startDate}
            onChange={(event) => {
              onChange({ startDate: event.currentTarget.value });
            }}
            className="max-w-40"
          />
          <FormErrorMessage message={errors.startDate} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.endDate)}>
        <FieldLabel htmlFor="initial-rule-end-date">適用終了日</FieldLabel>
        <FieldContent>
          <Input
            id="initial-rule-end-date"
            type="date"
            value={values.endDate}
            onChange={(event) => {
              onChange({ endDate: event.currentTarget.value });
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
              value={values.baseHourlyWage}
              onChange={(event) => {
                onChange({ baseHourlyWage: event.currentTarget.value });
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

      <Field data-invalid={Boolean(errors.nightPremiumRate)}>
        <FieldLabel htmlFor="initial-rule-night-multiplier">
          深夜割増率
        </FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="initial-rule-night-multiplier"
              type="number"
              min="0"
              step="0.01"
              value={values.nightPremiumRate}
              onChange={(event) => {
                onChange({ nightPremiumRate: event.currentTarget.value });
              }}
              className="max-w-20"
            />
            <span className="shrink-0 text-sm text-muted-foreground">率</span>
          </div>
          <FieldDescription>例: 0.25 = 25%</FieldDescription>
          <FormErrorMessage message={errors.nightPremiumRate} />
        </FieldContent>
      </Field>

      <Field data-invalid={Boolean(errors.holidayAllowanceHourly)}>
        <FieldLabel htmlFor="initial-rule-holiday-hourly-wage">
          休日手当（時間あたり）
        </FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="initial-rule-holiday-hourly-wage"
              type="number"
              min="0"
              step="10"
              value={values.holidayAllowanceHourly}
              onChange={(event) => {
                onChange({
                  holidayAllowanceHourly: event.currentTarget.value,
                });
              }}
              className="max-w-20"
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
        <FieldLabel htmlFor="initial-rule-overtime-multiplier">
          所定時間外割増率（保留）
        </FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="initial-rule-overtime-multiplier"
              type="number"
              min="0"
              step="0.01"
              value={values.overtimePremiumRate}
              onChange={(event) => {
                onChange({ overtimePremiumRate: event.currentTarget.value });
              }}
              className="max-w-20"
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
              value={values.dailyOvertimeThreshold}
              onChange={(event) => {
                onChange({ dailyOvertimeThreshold: event.currentTarget.value });
              }}
              className="max-w-16"
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

      <Field data-invalid={Boolean(errors.holidayType)}>
        <FieldLabel>休日判定</FieldLabel>
        <FieldContent>
          <RadioGroup
            value={values.holidayType}
            onValueChange={(value) => {
              onChange({ holidayType: value as HolidayType });
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
  );
}

function WorkplaceEditorActions({
  submitLabel,
  state,
  onCancel,
}: WorkplaceEditorActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={state.isSubmitting}>
        {state.isSubmitting ? "保存中..." : submitLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={state.isSubmitting}
        onClick={onCancel}
      >
        キャンセル
      </Button>
    </div>
  );
}

function WorkplaceEditorForm({
  mode,
  workplaceId,
  initialSeed,
  externalFormError,
}: WorkplaceEditorFormProps) {
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "勤務先編集" : "勤務先作成";
  const [state, dispatch] = useReducer(
    workplaceFormReducer,
    initialSeed,
    createWorkplaceFormState,
  );
  const resetFormState = useCallback(() => {
    dispatch({
      type: "reset",
      seed: initialSeed,
    });
  }, [initialSeed]);
  const { markForResetOnRouteHidden } = useResetOnRouteHidden(resetFormState);
  const { values, errors, isSubmitting, createInitialRule, initialRuleValues } =
    state;

  const handleSubmit = async () => {
    if (isEdit && !workplaceId) {
      dispatch({
        type: "setFormError",
        message: "編集対象の勤務先IDが指定されていません。",
      });
      return;
    }

    const validationErrors = validate(
      values,
      isEdit,
      createInitialRule,
      initialRuleValues,
    );
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
    const loadingToastId = toast.loading("勤務先を保存中です...");

    try {
      const payload: {
        name: string;
        type: WorkplaceType;
        color: string;
        closingDayType: ClosingDayType;
        closingDay: number | null;
        payday: number;
        initialPayrollRule?: {
          startDate: string;
          endDate: string | null;
          baseHourlyWage: number;
          holidayAllowanceHourly: number;
          nightPremiumRate: number;
          overtimePremiumRate: number;
          dailyOvertimeThreshold: number;
          holidayType: HolidayType;
        };
      } = {
        name: values.name.trim(),
        type: values.type,
        color: values.color.toUpperCase(),
        closingDayType: values.closingDayType,
        closingDay:
          values.closingDayType === "END_OF_MONTH"
            ? null
            : Number(values.closingDay),
        payday: Number(values.payday),
      };

      if (!isEdit && createInitialRule) {
        payload.initialPayrollRule = {
          startDate: initialRuleValues.startDate,
          endDate: initialRuleValues.endDate ? initialRuleValues.endDate : null,
          baseHourlyWage: Number(initialRuleValues.baseHourlyWage),
          holidayAllowanceHourly: initialRuleValues.holidayAllowanceHourly
            ? Number(initialRuleValues.holidayAllowanceHourly)
            : 0,
          nightPremiumRate: Number(initialRuleValues.nightPremiumRate),
          overtimePremiumRate: Number(initialRuleValues.overtimePremiumRate),
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
      const syncState = parseGoogleSyncStateFromPayload(
        responsePayload,
        messages.error.calendarSyncFailed,
      );
      await invalidateAfterWorkplaceMutation(queryClient);

      if (
        !isEdit &&
        responsePayload.data?.type === "CRAM_SCHOOL" &&
        responsePayload.data.id
      ) {
        toast.success(messages.success.workplaceCreated, {
          id: loadingToastId,
          description: buildMutationSuccessDescription({
            baseDescription: payload.name,
            syncPending: syncState.pending,
          }),
        });
        markForResetOnRouteHidden();
        router.push(`/my/workplaces/${responsePayload.data.id}/timetables/new`);
      } else {
        toast.success(
          isEdit
            ? messages.success.workplaceUpdated
            : messages.success.workplaceCreated,
          {
            id: loadingToastId,
            description: buildMutationSuccessDescription({
              baseDescription: payload.name,
              syncPending: syncState.pending,
            }),
          },
        );
        markForResetOnRouteHidden();
        router.push("/my/workplaces");
      }
    } catch (error) {
      console.error("failed to submit workplace form", error);
      const message = toErrorMessage(error, messages.error.workplaceSaveFailed);
      dispatch({
        type: "setFormError",
        message,
      });
      toast.error(messages.error.workplaceSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      dispatch({ type: "setSubmitting", isSubmitting: false });
    }
  };

  const formErrorMessage = errors.form ?? externalFormError;
  const submitLabel = isEdit ? "保存" : "作成";
  const handleValueChange: WorkplaceFormValueChange = (patch) => {
    dispatch({
      type: "updateValues",
      patch,
    });
  };
  const handleInitialRuleValueChange: WorkplaceInitialRuleValueChange = (
    patch,
  ) => {
    dispatch({
      type: "updateInitialRuleValues",
      patch,
    });
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <WorkplaceEditorHeader pageTitle={pageTitle} />

      <Form
        className="max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <WorkplaceBasicFieldsSection
          values={{
            name: values.name,
            type: values.type,
            color: values.color,
          }}
          errors={{
            name: errors.name,
            type: errors.type,
            color: errors.color,
          }}
          onChange={handleValueChange}
        />
        <WorkplaceClosingDaySection
          values={{
            closingDayType: values.closingDayType,
            closingDay: values.closingDay,
          }}
          errors={{
            closingDayType: errors.closingDayType,
            closingDay: errors.closingDay,
          }}
          onChange={handleValueChange}
        />
        <WorkplacePaydayField
          payday={values.payday}
          error={errors.payday}
          onChange={(payday) => {
            handleValueChange({ payday });
          }}
        />

        {!isEdit ? (
          <>
            <InitialPayrollRuleToggleSection
              enabled={createInitialRule}
              state={{ isSubmitting }}
              onChange={(value) => {
                dispatch({
                  type: "setCreateInitialRule",
                  value,
                });
              }}
            />

            {createInitialRule ? (
              <InitialPayrollRuleFieldsSection
                values={initialRuleValues}
                errors={{
                  startDate: errors.startDate,
                  endDate: errors.endDate,
                  baseHourlyWage: errors.baseHourlyWage,
                  nightPremiumRate: errors.nightPremiumRate,
                  holidayAllowanceHourly: errors.holidayAllowanceHourly,
                  overtimePremiumRate: errors.overtimePremiumRate,
                  dailyOvertimeThreshold: errors.dailyOvertimeThreshold,
                  holidayType: errors.holidayType,
                }}
                onChange={handleInitialRuleValueChange}
              />
            ) : null}
          </>
        ) : null}

        <FormErrorMessage message={formErrorMessage} />

        <WorkplaceEditorActions
          submitLabel={submitLabel}
          state={{ isSubmitting }}
          onCancel={() => {
            markForResetOnRouteHidden();
            router.push("/my/workplaces");
          }}
        />
      </Form>
    </section>
  );
}

export function WorkplaceForm(props: WorkplaceFormProps) {
  const { mode } = props;
  const workplaceId = mode === "edit" ? props.workplaceId : undefined;
  const initialRuleStartDate =
    mode === "create" ? props.initialRuleStartDate : "";
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "勤務先編集" : "勤務先作成";

  const workplaceQuery = useWorkplaceEditDetailQuery({
    workplaceId: workplaceId ?? "",
    enabled: isEdit && Boolean(workplaceId),
  });

  const isLoading = isEdit && Boolean(workplaceId) && workplaceQuery.isPending;
  const externalFormError =
    isEdit && !workplaceId
      ? "編集対象の勤務先IDが指定されていません。"
      : workplaceQuery.error
        ? toUserFacingMessage(
            workplaceQuery.error,
            "勤務先の取得に失敗しました。",
          )
        : undefined;

  if (isLoading) {
    return (
      <section className="space-y-6 p-4 md:p-6">
        <WorkplaceEditorHeader pageTitle={pageTitle} />
        <FormLoadingSkeleton />
      </section>
    );
  }

  const initialSeed = isEdit
    ? createEditWorkplaceFormSeed(initialRuleStartDate, workplaceQuery.data)
    : createCreateWorkplaceFormSeed(initialRuleStartDate);

  return (
    <WorkplaceEditorForm
      key={
        isEdit
          ? workplaceQuery.data
            ? `edit-${workplaceQuery.data.id}`
            : `edit-${workplaceId ?? "unknown"}-empty`
          : `create-${initialRuleStartDate}`
      }
      mode={mode}
      workplaceId={workplaceId}
      initialSeed={initialSeed}
      externalFormError={externalFormError}
    />
  );
}

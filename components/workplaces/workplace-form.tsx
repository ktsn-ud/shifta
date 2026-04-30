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
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

const colorRegex = /^#[0-9A-Fa-f]{6}$/;
const PAYROLL_DAY_MIN = 1;
const PAYROLL_DAY_MAX = 31;

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
type ClosingDayType = "DAY_OF_MONTH" | "END_OF_MONTH";
type WorkplaceFormMode = "create" | "edit";

type WorkplaceFormProps = {
  mode: WorkplaceFormMode;
  workplaceId?: string;
};

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
type WorkplaceDetail = {
  id: string;
  name: string;
  type: WorkplaceType;
  color: string;
  closingDayType: ClosingDayType;
  closingDay: number | null;
  payday: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkplaceType(value: unknown): value is WorkplaceType {
  return value === "GENERAL" || value === "CRAM_SCHOOL";
}

function isClosingDayType(value: unknown): value is ClosingDayType {
  return value === "DAY_OF_MONTH" || value === "END_OF_MONTH";
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
    typeof data.color !== "string" ||
    !isClosingDayType(data.closingDayType) ||
    (typeof data.closingDay !== "number" && data.closingDay !== null) ||
    typeof data.payday !== "number"
  ) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    color: data.color,
    closingDayType: data.closingDayType,
    closingDay: data.closingDay,
    payday: data.payday,
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

export function WorkplaceForm({ mode, workplaceId }: WorkplaceFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [values, setValues] = useState<FormValues>({
    name: "",
    type: "GENERAL",
    color: "#3B82F6",
    closingDayType: "END_OF_MONTH",
    closingDay: "",
    payday: "25",
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
      holidayAllowanceHourly: "0",
      nightPremiumRate: "0.25",
      overtimePremiumRate: "0.25",
      dailyOvertimeThreshold: "8",
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
          closingDayType: workplace.closingDayType,
          closingDay:
            workplace.closingDay === null ? "" : String(workplace.closingDay),
          payday: String(workplace.payday),
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplace", error);
        setErrors({
          form: toErrorMessage(error, "勤務先の取得に失敗しました。"),
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
          勤務先名・タイプ・表示色・締日・給料日を設定します。
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

          <Field data-invalid={Boolean(errors.closingDayType)}>
            <FieldLabel>締日設定</FieldLabel>
            <FieldContent>
              <RadioGroup
                value={values.closingDayType}
                onValueChange={(value) => {
                  setValues((current) => ({
                    ...current,
                    closingDayType: value as ClosingDayType,
                    closingDay:
                      value === "END_OF_MONTH" ? "" : current.closingDay,
                  }));
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
                      const next = event.currentTarget.value;
                      setValues((current) => ({
                        ...current,
                        closingDay: next,
                      }));
                    }}
                    className="max-w-20"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">
                    日
                  </span>
                </div>
                <FieldDescription>
                  1〜31の整数で入力してください。
                </FieldDescription>
                <FormErrorMessage message={errors.closingDay} />
              </FieldContent>
            </Field>
          ) : null}

          <Field data-invalid={Boolean(errors.payday)}>
            <FieldLabel htmlFor="workplace-payday">給料日</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="workplace-payday"
                  type="number"
                  min={PAYROLL_DAY_MIN}
                  max={PAYROLL_DAY_MAX}
                  step="1"
                  value={values.payday}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setValues((current) => ({ ...current, payday: next }));
                  }}
                  className="max-w-20"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  日
                </span>
              </div>
              <FieldDescription>
                1〜31の整数で入力してください。
              </FieldDescription>
              <FormErrorMessage message={errors.payday} />
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
                          value={initialRuleValues.holidayAllowanceHourly}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              holidayAllowanceHourly: nextValue,
                            }));
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
                      <FormErrorMessage
                        message={errors.holidayAllowanceHourly}
                      />
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
                          value={initialRuleValues.nightPremiumRate}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              nightPremiumRate: nextValue,
                            }));
                          }}
                          className="max-w-20"
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
                          value={initialRuleValues.overtimePremiumRate}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setInitialRuleValues((current) => ({
                              ...current,
                              overtimePremiumRate: nextValue,
                            }));
                          }}
                          className="max-w-20"
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

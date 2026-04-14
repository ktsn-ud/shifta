"use client";

import { useCallback, useMemo, useState } from "react";

type FieldErrors<T extends Record<string, unknown>> = Partial<
  Record<keyof T, string>
>;

type ValidationIssue = {
  path: Array<string | number>;
  message: string;
};

type ValidationResult<TValues> =
  | { success: true; data: TValues }
  | { success: false; issues: ValidationIssue[] };

type FormValidator<TValues extends Record<string, unknown>> = (
  values: TValues,
) => ValidationResult<TValues>;

type FormOptions<TValues extends Record<string, unknown>> = {
  validator: FormValidator<TValues>;
  initialValues: TValues;
};

export function useFormWithValidation<TValues extends Record<string, unknown>>({
  validator,
  initialValues,
}: FormOptions<TValues>) {
  type Values = TValues;
  type FormValues = Values;

  const [values, setValues] = useState<Values>(initialValues);
  const [errors, setErrors] = useState<FieldErrors<FormValues>>({});

  const setFieldValue = useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!prev[key as keyof FormValues]) {
          return prev;
        }

        const next = { ...prev };
        delete next[key as keyof FormValues];
        return next;
      });
    },
    [],
  );

  const validate = useCallback(() => {
    const parsed = validator(values);

    if (parsed.success) {
      setErrors({});
      return { success: true as const, data: parsed.data };
    }

    const nextErrors: FieldErrors<FormValues> = {};
    for (const issue of parsed.issues) {
      const field = issue.path[0];
      if (typeof field === "string") {
        const nextErrorsRecord = nextErrors as Record<string, string>;
        if (!nextErrorsRecord[field]) {
          nextErrorsRecord[field] = issue.message;
        }
      }
    }

    setErrors(nextErrors);
    return { success: false as const, errors: nextErrors };
  }, [validator, values]);

  const handleSubmit = useCallback(
    (
      onValid: (data: Values) => void | Promise<void>,
      onInvalid?: (currentErrors: FieldErrors<FormValues>) => void,
    ) => {
      return async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const result = validate();

        if (result.success) {
          await onValid(result.data);
          return;
        }

        onInvalid?.(result.errors);
      };
    },
    [validate],
  );

  const reset = useCallback(
    (nextValues?: Values) => {
      setValues(nextValues ?? initialValues);
      setErrors({});
    },
    [initialValues],
  );

  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  return {
    values,
    errors,
    isValid,
    setFieldValue,
    setValues,
    validate,
    handleSubmit,
    reset,
  };
}

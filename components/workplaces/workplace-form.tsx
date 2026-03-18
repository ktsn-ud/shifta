"use client";

import Link from "next/link";
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

const colorRegex = /^#[0-9A-Fa-f]{6}$/;

const workplaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
  color: z.string(),
});

const workplaceDetailResponseSchema = z.object({
  data: workplaceSchema,
});

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
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

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

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

function validate(values: FormValues): FormErrors {
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

        const parsed = workplaceDetailResponseSchema.safeParse(
          (await response.json()) as unknown,
        );
        if (parsed.success === false) {
          throw new Error("勤務先データの形式が不正です。");
        }

        setValues({
          name: parsed.data.data.name,
          type: parsed.data.data.type,
          color: parsed.data.data.color,
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
    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const response = await fetch(
        isEdit ? `/api/workplaces/${workplaceId}` : "/api/workplaces",
        {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: values.name.trim(),
            type: values.type,
            color: values.color.toUpperCase(),
          }),
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

      router.push("/my/workplaces");
      router.refresh();
    } catch (error) {
      console.error("failed to submit workplace form", error);
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : isEdit
              ? "勤務先の更新に失敗しました。"
              : "勤務先の作成に失敗しました。",
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
        <p className="text-sm text-muted-foreground">読み込み中です...</p>
      ) : (
        <Form
          className="max-w-xl"
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
                  <FieldLabel htmlFor="workplace-type-general">
                    GENERAL
                  </FieldLabel>
                  <RadioGroupItem id="workplace-type-general" value="GENERAL" />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="workplace-type-cram">
                    CRAM_SCHOOL
                  </FieldLabel>
                  <RadioGroupItem
                    id="workplace-type-cram"
                    value="CRAM_SCHOOL"
                  />
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
                />
              </div>
              <FieldDescription>HEX形式（例: #3B82F6）</FieldDescription>
              <FormErrorMessage message={errors.color} />
            </FieldContent>
          </Field>

          <FormErrorMessage message={errors.form} />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : isEdit ? "保存" : "作成"}
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              disabled={isSubmitting}
            >
              <Link href="/my/workplaces">キャンセル</Link>
            </Button>
          </div>
        </Form>
      )}
    </section>
  );
}

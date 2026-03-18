"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
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
  FieldDescription,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const workplaceResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
  }),
});

const timetableSchema = z.object({
  id: z.string(),
  workplaceId: z.string(),
  type: z.enum(["NORMAL", "INTENSIVE"]),
  period: z.number().int().positive(),
  startTime: z.string(),
  endTime: z.string(),
});

const timetableListResponseSchema = z.object({
  data: z.array(timetableSchema),
});

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

type TimetableFormMode = "create" | "edit";
type TimetableType = "NORMAL" | "INTENSIVE";

type TimetableFormProps = {
  mode: TimetableFormMode;
  workplaceId: string;
  timetableId?: string;
};

type FormValues = {
  type: TimetableType;
  period: string;
  startTime: string;
  endTime: string;
};

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

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
  const period = Number(values.period);

  if (!values.period || Number.isInteger(period) === false) {
    errors.period = "コマ番号は整数で入力してください。";
  } else if (period <= 0) {
    errors.period = "コマ番号は1以上で入力してください。";
  }

  if (timeRegex.test(values.startTime) === false) {
    errors.startTime = "開始時刻はHH:MM形式で入力してください。";
  }

  if (timeRegex.test(values.endTime) === false) {
    errors.endTime = "終了時刻はHH:MM形式で入力してください。";
  }

  if (
    timeRegex.test(values.startTime) &&
    timeRegex.test(values.endTime) &&
    toMinutes(values.startTime) >= toMinutes(values.endTime)
  ) {
    errors.endTime = "終了時刻は開始時刻より後にしてください。";
  }

  return errors;
}

export function TimetableForm({
  mode,
  workplaceId,
  timetableId,
}: TimetableFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [workplace, setWorkplace] = useState<{
    id: string;
    name: string;
    type: "GENERAL" | "CRAM_SCHOOL";
  } | null>(null);
  const [values, setValues] = useState<FormValues>({
    type: "NORMAL",
    period: "",
    startTime: "",
    endTime: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const listHref = `/my/workplaces/${workplaceId}/timetables`;
  const pageTitle = useMemo(
    () => (isEdit ? "時間割編集" : "時間割作成"),
    [isEdit],
  );

  useEffect(() => {
    if (isEdit && !timetableId) {
      setIsLoading(false);
      setErrors({
        form: "編集対象の時間割IDが指定されていません。",
      });
      return;
    }

    const abortController = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setErrors({});

      try {
        const workplaceResponse = await fetch(
          `/api/workplaces/${workplaceId}`,
          {
            cache: "no-store",
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

        const parsedWorkplace = workplaceResponseSchema.safeParse(
          (await workplaceResponse.json()) as unknown,
        );
        if (parsedWorkplace.success === false) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }

        setWorkplace(parsedWorkplace.data.data);

        if (parsedWorkplace.data.data.type !== "CRAM_SCHOOL") {
          return;
        }

        if (isEdit && timetableId) {
          const timetablesResponse = await fetch(
            `/api/workplaces/${workplaceId}/timetables`,
            {
              cache: "no-store",
              signal: abortController.signal,
            },
          );
          if (timetablesResponse.ok === false) {
            throw new Error(
              await readApiErrorMessage(
                timetablesResponse,
                "時間割の取得に失敗しました。",
              ),
            );
          }

          const parsedTimetables = timetableListResponseSchema.safeParse(
            (await timetablesResponse.json()) as unknown,
          );
          if (parsedTimetables.success === false) {
            throw new Error("時間割レスポンスの形式が不正です。");
          }

          const target = parsedTimetables.data.data.find(
            (timetable) => timetable.id === timetableId,
          );
          if (!target) {
            throw new Error("編集対象の時間割が見つかりません。");
          }

          setValues({
            type: target.type,
            period: String(target.period),
            startTime: toTimeOnly(target.startTime),
            endTime: toTimeOnly(target.endTime),
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetable form data", error);
        setErrors({
          form:
            error instanceof Error
              ? error.message
              : "時間割情報の取得に失敗しました。",
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
  }, [isEdit, timetableId, workplaceId]);

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
        isEdit
          ? `/api/workplaces/${workplaceId}/timetables/${timetableId}`
          : `/api/workplaces/${workplaceId}/timetables`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: values.type,
            period: Number(values.period),
            startTime: values.startTime,
            endTime: values.endTime,
          }),
        },
      );

      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(
            response,
            isEdit
              ? "時間割の更新に失敗しました。"
              : "時間割の作成に失敗しました。",
          ),
        );
      }

      router.push(listHref);
      router.refresh();
    } catch (error) {
      console.error("failed to submit timetable form", error);
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : isEdit
              ? "時間割の更新に失敗しました。"
              : "時間割の作成に失敗しました。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-6 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">読み込み中です...</p>
      </section>
    );
  }

  if (workplace?.type !== "CRAM_SCHOOL") {
    return (
      <section className="space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>操作対象外の勤務先です</CardTitle>
            <CardDescription>
              時間割は CRAM_SCHOOL 勤務先でのみ操作できます。
            </CardDescription>
          </CardHeader>
        </Card>
        <Button
          variant="outline"
          onClick={() => {
            router.push(listHref);
          }}
        >
          一覧へ戻る
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
            ? `${workplace.name} の授業コマ設定を行います。`
            : "授業コマ設定を行います。"}
        </p>
      </header>

      <Form
        className="max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Field>
          <FieldLabel>コマ種別</FieldLabel>
          <FieldContent>
            <RadioGroup
              value={values.type}
              onValueChange={(value) => {
                setValues((current) => ({
                  ...current,
                  type: value as TimetableType,
                }));
              }}
            >
              <Field orientation="horizontal">
                <FieldLabel htmlFor="timetable-type-normal">NORMAL</FieldLabel>
                <RadioGroupItem id="timetable-type-normal" value="NORMAL" />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="timetable-type-intensive">
                  INTENSIVE
                </FieldLabel>
                <RadioGroupItem
                  id="timetable-type-intensive"
                  value="INTENSIVE"
                />
              </Field>
            </RadioGroup>
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(errors.period)}>
          <FieldLabel htmlFor="period">コマ番号</FieldLabel>
          <FieldContent>
            <Input
              id="period"
              type="number"
              min="1"
              step="1"
              value={values.period}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setValues((current) => ({
                  ...current,
                  period: nextValue,
                }));
              }}
            />
            <FieldDescription>
              type 内で一意の番号を指定してください（例: 通常期1限）。
            </FieldDescription>
            <FormErrorMessage message={errors.period} />
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(errors.startTime)}>
          <FieldLabel htmlFor="start-time">開始時刻</FieldLabel>
          <FieldContent>
            <Input
              id="start-time"
              type="time"
              value={values.startTime}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setValues((current) => ({
                  ...current,
                  startTime: nextValue,
                }));
              }}
            />
            <FormErrorMessage message={errors.startTime} />
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(errors.endTime)}>
          <FieldLabel htmlFor="end-time">終了時刻</FieldLabel>
          <FieldContent>
            <Input
              id="end-time"
              type="time"
              value={values.endTime}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setValues((current) => ({
                  ...current,
                  endTime: nextValue,
                }));
              }}
            />
            <FormErrorMessage message={errors.endTime} />
          </FieldContent>
        </Field>

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
    </section>
  );
}

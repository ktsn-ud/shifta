"use client";

import { useState } from "react";
import { z } from "zod";

import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { useFormWithValidation } from "@/hooks/use-form-with-validation";

const settingsSchema = z.object({
  displayName: z.string().min(1, "表示名を入力してください"),
  workplaceType: z.enum(["GENERAL", "CRAM_SCHOOL"]),
  shiftType: z.enum(["NORMAL", "LESSON", "OTHER"]),
  preferredDate: z.string().min(1, "日付を選択してください"),
  preferredTime: z.string().min(1, "時刻を選択してください"),
  notifyByEmail: z.boolean(),
});

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const form = useFormWithValidation({
    schema: settingsSchema,
    initialValues: {
      displayName: "",
      workplaceType: "GENERAL",
      shiftType: "NORMAL",
      preferredDate: "",
      preferredTime: "",
      notifyByEmail: false,
    },
  });

  return (
    <section className="p-4 md:p-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        共通フォームコンポーネントの動作確認用フォームです。
      </p>

      <Form
        className="mt-6 max-w-2xl"
        onSubmit={form.handleSubmit(async () => {
          setSaved(true);
        })}
      >
        <FieldGroup>
          <Field data-invalid={!!form.errors.displayName}>
            <FieldLabel htmlFor="displayName">表示名</FieldLabel>
            <FieldContent>
              <Input
                id="displayName"
                value={form.values.displayName}
                aria-invalid={!!form.errors.displayName}
                onChange={(event) =>
                  form.setFieldValue("displayName", event.currentTarget.value)
                }
              />
              <FieldDescription>
                画面上に表示されるユーザー名です。
              </FieldDescription>
              <FormErrorMessage message={form.errors.displayName} />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>勤務先タイプ</FieldLabel>
            <FieldContent>
              <Select
                value={form.values.workplaceType}
                onValueChange={(value) =>
                  form.setFieldValue(
                    "workplaceType",
                    value as "GENERAL" | "CRAM_SCHOOL",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="勤務先タイプを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="GENERAL">GENERAL</SelectItem>
                    <SelectItem value="CRAM_SCHOOL">CRAM_SCHOOL</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>シフトタイプ</FieldLabel>
            <FieldContent>
              <RadioGroup
                value={form.values.shiftType}
                onValueChange={(value) =>
                  form.setFieldValue(
                    "shiftType",
                    value as "NORMAL" | "LESSON" | "OTHER",
                  )
                }
              >
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-normal">NORMAL</FieldLabel>
                  <RadioGroupItem id="shift-normal" value="NORMAL" />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-lesson">LESSON</FieldLabel>
                  <RadioGroupItem id="shift-lesson" value="LESSON" />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shift-other">OTHER</FieldLabel>
                  <RadioGroupItem id="shift-other" value="OTHER" />
                </Field>
              </RadioGroup>
            </FieldContent>
          </Field>

          <Field data-invalid={!!form.errors.preferredDate}>
            <FieldLabel htmlFor="preferredDate">日付</FieldLabel>
            <FieldContent>
              <DatePicker
                id="preferredDate"
                value={form.values.preferredDate}
                aria-invalid={!!form.errors.preferredDate}
                onValueChange={(value) =>
                  form.setFieldValue("preferredDate", value)
                }
              />
              <FormErrorMessage message={form.errors.preferredDate} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!form.errors.preferredTime}>
            <FieldLabel htmlFor="preferredTime">時刻</FieldLabel>
            <FieldContent>
              <TimePicker
                id="preferredTime"
                value={form.values.preferredTime}
                aria-invalid={!!form.errors.preferredTime}
                onValueChange={(value) =>
                  form.setFieldValue("preferredTime", value)
                }
              />
              <FormErrorMessage message={form.errors.preferredTime} />
            </FieldContent>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              checked={form.values.notifyByEmail}
              onCheckedChange={(checked) =>
                form.setFieldValue("notifyByEmail", Boolean(checked))
              }
            />
            <FieldContent>
              <FieldLabel htmlFor="notifyByEmail">
                メール通知を有効にする
              </FieldLabel>
            </FieldContent>
          </Field>
        </FieldGroup>

        <div className="flex gap-2">
          <Button type="submit">保存</Button>
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            リセット
          </Button>
        </div>

        {saved && (
          <p className="text-sm text-muted-foreground">
            保存処理を受け付けました（デモ表示）。
          </p>
        )}
      </Form>
    </section>
  );
}

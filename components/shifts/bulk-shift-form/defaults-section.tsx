"use client";

import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import type { ShiftType } from "@/components/shifts/bulk-shift-form/types";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { MAX_TRANSPORTATION_ALLOWANCE } from "@/lib/shifts/transportation-allowance";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import {
  formatEventNamePreview,
  formatShiftTypeForWorkplace,
  getLessonSelectionValues,
  MAX_BREAK_MINUTES,
} from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftDefaultsSection(
  props: Pick<
    BulkShiftFormController,
    | "defaults"
    | "selectedWorkplace"
    | "selectedDateCount"
    | "lessonPeriodsBySetId"
    | "timetableSetOptions"
    | "timetableSetNameById"
    | "handleDefaultShiftTypeChange"
    | "handleUpdateDefaults"
    | "handleApplyDefaultsToRows"
    | "handleResetDefaults"
  >,
) {
  const {
    defaults,
    selectedWorkplace,
    selectedDateCount,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    handleDefaultShiftTypeChange,
    handleUpdateDefaults,
    handleApplyDefaultsToRows,
    handleResetDefaults,
  } = props;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="text-base font-semibold">3. デフォルト値設定</h3>
      <DefaultGeneralFields
        defaults={defaults}
        selectedWorkplace={selectedWorkplace}
        handleDefaultShiftTypeChange={handleDefaultShiftTypeChange}
        handleUpdateDefaults={handleUpdateDefaults}
      />
      <DefaultScheduleFields
        defaults={defaults}
        lessonPeriodsBySetId={lessonPeriodsBySetId}
        timetableSetOptions={timetableSetOptions}
        timetableSetNameById={timetableSetNameById}
        handleUpdateDefaults={handleUpdateDefaults}
      />
      <DefaultActions
        selectedDateCount={selectedDateCount}
        handleApplyDefaultsToRows={handleApplyDefaultsToRows}
        handleResetDefaults={handleResetDefaults}
      />
      {defaults.shiftType === "LESSON" &&
      selectedWorkplace?.type === "CRAM_SCHOOL" &&
      (lessonPeriodsBySetId[defaults.timetableSetId] ?? []).length === 0 ? (
        <FormErrorMessage message="塾の授業は時間割が登録されていません。" />
      ) : null}
    </section>
  );
}

type DefaultGeneralFieldsProps = Pick<
  BulkShiftFormController,
  | "defaults"
  | "selectedWorkplace"
  | "handleDefaultShiftTypeChange"
  | "handleUpdateDefaults"
>;

function DefaultGeneralFields({
  defaults,
  selectedWorkplace,
  handleDefaultShiftTypeChange,
  handleUpdateDefaults,
}: DefaultGeneralFieldsProps) {
  return (
    <>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>デフォルトシフトタイプ</FieldLabel>
          <FieldContent>
            <RadioGroup
              value={defaults.shiftType}
              onValueChange={(value) =>
                handleDefaultShiftTypeChange(value as ShiftType)
              }
            >
              {selectedWorkplace?.type === "CRAM_SCHOOL" ? (
                <>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="LESSON" id="default-shift-lesson" />
                    <FieldLabel htmlFor="default-shift-lesson">
                      {formatShiftTypeForWorkplace(
                        "LESSON",
                        selectedWorkplace?.type,
                      )}
                    </FieldLabel>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="NORMAL" id="default-shift-normal" />
                    <FieldLabel htmlFor="default-shift-normal">
                      {formatShiftTypeForWorkplace(
                        "NORMAL",
                        selectedWorkplace?.type,
                      )}
                    </FieldLabel>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="NORMAL" id="default-shift-normal" />
                  <FieldLabel htmlFor="default-shift-normal">
                    {formatShiftTypeForWorkplace(
                      "NORMAL",
                      selectedWorkplace?.type,
                    )}
                  </FieldLabel>
                </div>
              )}
            </RadioGroup>
          </FieldContent>
        </Field>
        {defaults.shiftType === "LESSON" ? null : (
          <Field>
            <FieldLabel htmlFor="default-break">デフォルト休憩時間</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="default-break"
                  type="number"
                  min={0}
                  max={MAX_BREAK_MINUTES}
                  value={defaults.breakMinutes}
                  onChange={(event) =>
                    handleUpdateDefaults({
                      breakMinutes: event.currentTarget.value,
                    })
                  }
                  className="max-w-16"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  分
                </span>
              </div>
            </FieldContent>
          </Field>
        )}
      </FieldGroup>

      <Field>
        <FieldLabel htmlFor="default-transportation-allowance">
          デフォルト交通費
        </FieldLabel>
        <FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="default-transportation-allowance"
              type="number"
              min={0}
              max={MAX_TRANSPORTATION_ALLOWANCE}
              step={1}
              value={defaults.transportationAllowance}
              onChange={(event) =>
                handleUpdateDefaults({
                  transportationAllowance: event.currentTarget.value,
                })
              }
              className="max-w-28"
            />
            <span className="text-sm text-muted-foreground">円</span>
          </div>
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="default-comment">デフォルトコメント</FieldLabel>
        <FieldContent>
          <Input
            id="default-comment"
            value={defaults.comment}
            onChange={(event) =>
              handleUpdateDefaults({
                comment: event.currentTarget.value,
              })
            }
            maxLength={100}
            placeholder="例: 事務、授業補助、研修"
          />
          <FieldDescription>
            {formatEventNamePreview(selectedWorkplace?.name, defaults.comment)}
          </FieldDescription>
        </FieldContent>
      </Field>
    </>
  );
}

type DefaultScheduleFieldsProps = Pick<
  BulkShiftFormController,
  | "defaults"
  | "lessonPeriodsBySetId"
  | "timetableSetOptions"
  | "timetableSetNameById"
  | "handleUpdateDefaults"
>;

function DefaultScheduleFields({
  defaults,
  lessonPeriodsBySetId,
  timetableSetOptions,
  timetableSetNameById,
  handleUpdateDefaults,
}: DefaultScheduleFieldsProps) {
  return defaults.shiftType === "LESSON" ? (
    <FieldGroup className="grid gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel>デフォルト時間割セット</FieldLabel>
        <FieldContent>
          <Select
            value={defaults.timetableSetId}
            onValueChange={(value) => {
              if (value !== null) {
                const lessonSelectionValues = getLessonSelectionValues(
                  value,
                  lessonPeriodsBySetId,
                  value,
                );
                handleUpdateDefaults(lessonSelectionValues);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="時間割セットを選択">
                {timetableSetNameById[defaults.timetableSetId]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {timetableSetOptions.map((set) => (
                  <SelectItem key={set.id} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>デフォルト開始コマ</FieldLabel>
        <FieldContent>
          <Select
            value={defaults.startPeriod}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateDefaults({
                  startPeriod: value,
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="開始コマ" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(lessonPeriodsBySetId[defaults.timetableSetId] ?? []).map(
                  (period) => (
                    <SelectItem
                      key={`default-start-${period}`}
                      value={String(period)}
                    >
                      {period}限
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>デフォルト終了コマ</FieldLabel>
        <FieldContent>
          <Select
            value={defaults.endPeriod}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateDefaults({
                  endPeriod: value,
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="終了コマ" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(lessonPeriodsBySetId[defaults.timetableSetId] ?? []).map(
                  (period) => (
                    <SelectItem
                      key={`default-end-${period}`}
                      value={String(period)}
                    >
                      {period}限
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>
    </FieldGroup>
  ) : (
    <FieldGroup className="grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="default-start-time">デフォルト開始時刻</FieldLabel>
        <FieldContent>
          <Input
            id="default-start-time"
            type="time"
            value={defaults.startTime}
            onChange={(event) =>
              handleUpdateDefaults({
                startTime: event.currentTarget.value,
              })
            }
          />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor="default-end-time">デフォルト終了時刻</FieldLabel>
        <FieldContent>
          <Input
            id="default-end-time"
            type="time"
            value={defaults.endTime}
            onChange={(event) =>
              handleUpdateDefaults({
                endTime: event.currentTarget.value,
              })
            }
          />
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}

type DefaultActionsProps = Pick<
  BulkShiftFormController,
  "selectedDateCount" | "handleApplyDefaultsToRows" | "handleResetDefaults"
>;

function DefaultActions({
  selectedDateCount,
  handleApplyDefaultsToRows,
  handleResetDefaults,
}: DefaultActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <p className="w-full text-sm text-muted-foreground">
        選択中の{selectedDateCount}日分へデフォルト値を反映します。
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={handleApplyDefaultsToRows}
        disabled={selectedDateCount === 0}
      >
        選択中の{selectedDateCount}日分に適用
      </Button>
      <Button type="button" variant="ghost" onClick={handleResetDefaults}>
        リセット
      </Button>
    </div>
  );
}

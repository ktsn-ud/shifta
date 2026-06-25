"use client";

import type {
  BulkShiftFormController,
  BulkShiftRow,
  RowErrors,
} from "@/components/shifts/BulkShiftForm";
import { FormErrorMessage } from "@/components/form/form-error-message";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLessonSelectionValues } from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftRowLessonFields(props: {
  row: BulkShiftRow;
  rowErrors: RowErrors;
  lessonPeriodsBySetId: BulkShiftFormController["lessonPeriodsBySetId"];
  timetableSetOptions: BulkShiftFormController["timetableSetOptions"];
  timetableSetNameById: BulkShiftFormController["timetableSetNameById"];
  handleUpdateRow: BulkShiftFormController["handleUpdateRow"];
}) {
  const {
    row,
    rowErrors,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    handleUpdateRow,
  } = props;
  const lessonPeriods = lessonPeriodsBySetId[row.timetableSetId] ?? [];

  return (
    <FieldGroup className="mt-4 grid gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel>時間割セット</FieldLabel>
        <FieldContent>
          <Select
            value={row.timetableSetId}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateRow(row.date, {
                  ...getLessonSelectionValues(
                    value,
                    lessonPeriodsBySetId,
                    value,
                  ),
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="時間割セットを選択">
                {timetableSetNameById[row.timetableSetId]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {timetableSetOptions.map((set) => (
                  <SelectItem key={`${row.date}-set-${set.id}`} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormErrorMessage message={rowErrors.timetableSetId} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>開始コマ</FieldLabel>
        <FieldContent>
          <Select
            value={row.startPeriod}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateRow(row.date, {
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
                {lessonPeriods.map((period) => (
                  <SelectItem
                    key={`${row.date}-start-${period}`}
                    value={String(period)}
                  >
                    {period}限
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormErrorMessage message={rowErrors.startPeriod} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>終了コマ</FieldLabel>
        <FieldContent>
          <Select
            value={row.endPeriod}
            onValueChange={(value) => {
              if (value !== null) {
                handleUpdateRow(row.date, {
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
                {lessonPeriods.map((period) => (
                  <SelectItem
                    key={`${row.date}-end-${period}`}
                    value={String(period)}
                  >
                    {period}限
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormErrorMessage message={rowErrors.endPeriod} />
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}

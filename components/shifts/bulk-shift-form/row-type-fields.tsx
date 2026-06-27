"use client";

import type {
  BulkShiftFormController,
  BulkShiftRow,
  RowErrors,
  ShiftType,
  Workplace,
} from "@/components/shifts/BulkShiftForm";
import { FormErrorMessage } from "@/components/form/form-error-message";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  formatShiftTypeForWorkplace,
  MAX_BREAK_MINUTES,
} from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftRowTypeFields(props: {
  row: BulkShiftRow;
  rowErrors: RowErrors;
  selectedWorkplace: Workplace | undefined;
  handleRowShiftTypeChange: BulkShiftFormController["handleRowShiftTypeChange"];
  handleUpdateRow: BulkShiftFormController["handleUpdateRow"];
}) {
  const {
    row,
    rowErrors,
    selectedWorkplace,
    handleRowShiftTypeChange,
    handleUpdateRow,
  } = props;

  return (
    <FieldGroup className="mt-3 grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel>シフトタイプ</FieldLabel>
        <FieldContent>
          <RadioGroup
            value={row.shiftType}
            onValueChange={(value) =>
              handleRowShiftTypeChange(row.date, value as ShiftType)
            }
          >
            {selectedWorkplace?.type === "CRAM_SCHOOL" ? (
              <>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="LESSON"
                    id={`${row.date}-shift-lesson`}
                  />
                  <FieldLabel htmlFor={`${row.date}-shift-lesson`}>
                    {formatShiftTypeForWorkplace(
                      "LESSON",
                      selectedWorkplace?.type,
                    )}
                  </FieldLabel>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="NORMAL"
                    id={`${row.date}-shift-normal`}
                  />
                  <FieldLabel htmlFor={`${row.date}-shift-normal`}>
                    {formatShiftTypeForWorkplace(
                      "NORMAL",
                      selectedWorkplace?.type,
                    )}
                  </FieldLabel>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="NORMAL"
                  id={`${row.date}-shift-normal`}
                />
                <FieldLabel htmlFor={`${row.date}-shift-normal`}>
                  {formatShiftTypeForWorkplace(
                    "NORMAL",
                    selectedWorkplace?.type,
                  )}
                </FieldLabel>
              </div>
            )}
          </RadioGroup>
          <FormErrorMessage message={rowErrors.shiftType} />
        </FieldContent>
      </Field>

      {row.shiftType === "LESSON" ? null : (
        <Field>
          <FieldLabel htmlFor={`${row.date}-break`}>休憩時間（分）</FieldLabel>
          <FieldContent>
            <div className="flex items-center gap-2">
              <Input
                id={`${row.date}-break`}
                type="number"
                min={0}
                max={MAX_BREAK_MINUTES}
                className="max-w-16"
                value={row.breakMinutes}
                onChange={(event) =>
                  handleUpdateRow(row.date, {
                    breakMinutes: event.currentTarget.value,
                  })
                }
              />
              <span className="shrink-0 text-sm text-muted-foreground">分</span>
            </div>
            <FormErrorMessage message={rowErrors.breakMinutes} />
          </FieldContent>
        </Field>
      )}
    </FieldGroup>
  );
}

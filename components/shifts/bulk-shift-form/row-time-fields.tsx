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
import { Input } from "@/components/ui/input";

export function BulkShiftRowTimeFields(props: {
  row: BulkShiftRow;
  rowErrors: RowErrors;
  handleUpdateRow: BulkShiftFormController["handleUpdateRow"];
}) {
  const { row, rowErrors, handleUpdateRow } = props;

  return (
    <FieldGroup className="mt-4 grid gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${row.date}-start-time`}>開始時刻</FieldLabel>
        <FieldContent>
          <Input
            id={`${row.date}-start-time`}
            type="time"
            value={row.startTime}
            onChange={(event) =>
              handleUpdateRow(row.date, {
                startTime: event.currentTarget.value,
              })
            }
          />
          <FormErrorMessage message={rowErrors.startTime} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${row.date}-end-time`}>終了時刻</FieldLabel>
        <FieldContent>
          <Input
            id={`${row.date}-end-time`}
            type="time"
            value={row.endTime}
            onChange={(event) =>
              handleUpdateRow(row.date, {
                endTime: event.currentTarget.value,
              })
            }
          />
          <FormErrorMessage message={rowErrors.endTime} />
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}

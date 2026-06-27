"use client";

import type {
  BulkShiftFormController,
  BulkShiftRow,
  RowErrors,
  Workplace,
} from "@/components/shifts/BulkShiftForm";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { formatEventNamePreview } from "@/components/shifts/bulk-shift-form/view-helpers";

export function BulkShiftRowCommentField(props: {
  row: BulkShiftRow;
  rowErrors: RowErrors;
  selectedWorkplace: Workplace | undefined;
  handleUpdateRow: BulkShiftFormController["handleUpdateRow"];
}) {
  const { row, rowErrors, selectedWorkplace, handleUpdateRow } = props;

  return (
    <Field className="mt-4" data-invalid={Boolean(rowErrors.comment)}>
      <FieldLabel htmlFor={`${row.date}-comment`}>コメント</FieldLabel>
      <FieldContent>
        <Input
          id={`${row.date}-comment`}
          value={row.comment}
          onChange={(event) =>
            handleUpdateRow(row.date, {
              comment: event.currentTarget.value,
            })
          }
          maxLength={100}
          placeholder="例: 事務、授業補助、研修"
        />
        <FieldDescription>
          {formatEventNamePreview(selectedWorkplace?.name, row.comment)}
        </FieldDescription>
        <FormErrorMessage message={rowErrors.comment} />
      </FieldContent>
    </Field>
  );
}

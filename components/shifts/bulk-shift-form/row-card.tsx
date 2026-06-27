"use client";

import type {
  BulkShiftFormController,
  BulkShiftRow,
  RowErrors,
} from "@/components/shifts/BulkShiftForm";
import { BulkShiftGoogleEventsSummary } from "@/components/shifts/bulk-shift-form/google-events-summary";
import { BulkShiftRowCommentField } from "@/components/shifts/bulk-shift-form/row-comment-field";
import { BulkShiftRowHeader } from "@/components/shifts/bulk-shift-form/row-header";
import { BulkShiftRowLessonFields } from "@/components/shifts/bulk-shift-form/row-lesson-fields";
import { BulkShiftRowTimeFields } from "@/components/shifts/bulk-shift-form/row-time-fields";
import { BulkShiftRowTypeFields } from "@/components/shifts/bulk-shift-form/row-type-fields";

export function BulkShiftRowCard(
  props: Pick<
    BulkShiftFormController,
    | "selectedWorkplace"
    | "lessonPeriodsBySetId"
    | "timetableSetOptions"
    | "timetableSetNameById"
    | "googleEventsByDate"
    | "handleRemoveRow"
    | "handleRowShiftTypeChange"
    | "handleUpdateRow"
  > & {
    row: BulkShiftRow;
    rowErrors: RowErrors;
  },
) {
  const {
    row,
    rowErrors,
    selectedWorkplace,
    lessonPeriodsBySetId,
    timetableSetOptions,
    timetableSetNameById,
    googleEventsByDate,
    handleRemoveRow,
    handleRowShiftTypeChange,
    handleUpdateRow,
  } = props;

  return (
    <section className="rounded-lg border p-3">
      <BulkShiftRowHeader dateKey={row.date} onRemove={handleRemoveRow} />
      <BulkShiftGoogleEventsSummary
        dateKey={row.date}
        googleEventDay={googleEventsByDate[row.date]}
      />
      <BulkShiftRowTypeFields
        row={row}
        rowErrors={rowErrors}
        selectedWorkplace={selectedWorkplace}
        handleRowShiftTypeChange={handleRowShiftTypeChange}
        handleUpdateRow={handleUpdateRow}
      />
      <BulkShiftRowCommentField
        row={row}
        rowErrors={rowErrors}
        selectedWorkplace={selectedWorkplace}
        handleUpdateRow={handleUpdateRow}
      />
      {row.shiftType === "LESSON" ? (
        <BulkShiftRowLessonFields
          row={row}
          rowErrors={rowErrors}
          lessonPeriodsBySetId={lessonPeriodsBySetId}
          timetableSetOptions={timetableSetOptions}
          timetableSetNameById={timetableSetNameById}
          handleUpdateRow={handleUpdateRow}
        />
      ) : (
        <BulkShiftRowTimeFields
          row={row}
          rowErrors={rowErrors}
          handleUpdateRow={handleUpdateRow}
        />
      )}
    </section>
  );
}

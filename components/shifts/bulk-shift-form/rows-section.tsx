"use client";

import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import { SpinnerPanel } from "@/components/ui/spinner";
import { BulkShiftRowCard } from "@/components/shifts/bulk-shift-form/row-card";

export function BulkShiftRowsSection(
  props: Pick<
    BulkShiftFormController,
    | "isTimetableLoading"
    | "selectedRows"
    | "errors"
    | "selectedWorkplace"
    | "lessonPeriodsBySetId"
    | "timetableSetOptions"
    | "timetableSetNameById"
    | "googleEventsByDate"
    | "handleRemoveRow"
    | "handleRowShiftTypeChange"
    | "handleUpdateRow"
  >,
) {
  const {
    isTimetableLoading,
    selectedRows,
    errors,
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
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="text-base font-semibold">4. 選択日の詳細入力</h3>

      {isTimetableLoading ? (
        <SpinnerPanel
          className="min-h-[220px]"
          label="時間割データを読み込み中..."
        />
      ) : selectedRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          カレンダーから日付を選択してください。
        </p>
      ) : (
        <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
          {selectedRows.map((row) => (
            <BulkShiftRowCard
              key={row.date}
              row={row}
              rowErrors={errors.rows?.[row.date] ?? {}}
              selectedWorkplace={selectedWorkplace}
              lessonPeriodsBySetId={lessonPeriodsBySetId}
              timetableSetOptions={timetableSetOptions}
              timetableSetNameById={timetableSetNameById}
              googleEventsByDate={googleEventsByDate}
              handleRemoveRow={handleRemoveRow}
              handleRowShiftTypeChange={handleRowShiftTypeChange}
              handleUpdateRow={handleUpdateRow}
            />
          ))}
        </div>
      )}
    </section>
  );
}

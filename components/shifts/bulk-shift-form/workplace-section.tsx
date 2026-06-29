"use client";

import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import { FormErrorMessage } from "@/components/form/form-error-message";
import {
  Field,
  FieldContent,
  FieldDescription,
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
import { SpinnerPanel } from "@/components/ui/spinner";

export function BulkShiftWorkplaceSection(
  props: Pick<
    BulkShiftFormController,
    | "isWorkplaceLoading"
    | "workplaces"
    | "selectedWorkplace"
    | "selectedWorkplaceId"
    | "errors"
    | "handleWorkplaceChange"
  >,
) {
  const {
    isWorkplaceLoading,
    workplaces,
    selectedWorkplace,
    selectedWorkplaceId,
    errors,
    handleWorkplaceChange,
  } = props;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h3 className="text-base font-semibold">1. 勤務先選択</h3>

      {isWorkplaceLoading ? (
        <SpinnerPanel
          className="min-h-[120px] max-w-md"
          label="勤務先情報を読み込み中..."
        />
      ) : (
        <Field>
          <FieldLabel htmlFor="bulk-workplace">勤務先</FieldLabel>
          <FieldContent>
            <Select
              value={selectedWorkplaceId}
              onValueChange={(value) => {
                if (value !== null) {
                  handleWorkplaceChange(value);
                }
              }}
              disabled={workplaces.length === 0}
            >
              <SelectTrigger
                aria-label="勤務先"
                id="bulk-workplace"
                className="max-w-50 w-full md:w-72"
              >
                <SelectValue placeholder="勤務先を選択">
                  {selectedWorkplace?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {workplaces.map((workplace) => (
                    <SelectItem key={workplace.id} value={workplace.id}>
                      {workplace.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              前回選択した勤務先を初期表示します。
            </FieldDescription>
            <FormErrorMessage message={errors.workplaceId} />
          </FieldContent>
        </Field>
      )}
    </section>
  );
}

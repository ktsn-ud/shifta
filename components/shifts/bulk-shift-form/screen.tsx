"use client";

import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import { ShiftPayrollPreviewFloating } from "@/components/shifts/ShiftPayrollPreviewFloating";
import { Form } from "@/components/ui/form";
import { BulkShiftCalendarSection } from "@/components/shifts/bulk-shift-form/calendar-section";
import { BulkShiftDefaultsSection } from "@/components/shifts/bulk-shift-form/defaults-section";
import { BulkShiftFormFooter } from "@/components/shifts/bulk-shift-form/footer";
import { BulkShiftHeader } from "@/components/shifts/bulk-shift-form/header";
import { BulkShiftOvernightDialog } from "@/components/shifts/bulk-shift-form/overnight-dialog";
import { BulkShiftRowsSection } from "@/components/shifts/bulk-shift-form/rows-section";
import { BulkShiftWorkplaceSection } from "@/components/shifts/bulk-shift-form/workplace-section";

export function BulkShiftFormScreen(props: {
  controller: BulkShiftFormController;
}) {
  const { controller } = props;

  return (
    <section className="space-y-6 p-4 pb-32 md:p-6 md:pb-6">
      <BulkShiftHeader />

      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void controller.handleSubmit();
        }}
      >
        <BulkShiftWorkplaceSection {...controller} />
        <BulkShiftCalendarSection {...controller} />
        <BulkShiftDefaultsSection {...controller} />
        <BulkShiftRowsSection {...controller} />
        <BulkShiftFormFooter {...controller} />
      </Form>

      <ShiftPayrollPreviewFloating
        months={controller.previewMonths}
        unresolvedCount={controller.previewUnresolvedCount}
        emptyMessage={controller.previewEmptyMessage}
        baselineErrorMessage={controller.previewBaselineErrorMessage}
      />

      <BulkShiftOvernightDialog {...controller} />
    </section>
  );
}

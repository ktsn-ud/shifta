"use client";

import { useMemo } from "react";
import { BulkShiftEditPayrollPreviewFloating } from "@/components/shifts/BulkShiftEditPayrollPreviewFloating";
import { createBulkEditPreviewShiftInputs } from "@/components/shifts/bulk-shift-edit-helpers";
import type {
  BulkShiftEditPageClientProps,
  Draft,
} from "@/components/shifts/bulk-shift-edit-types";
import { useBulkShiftEditPayrollPreview } from "@/components/shifts/use-bulk-shift-edit-payroll-preview";
import type { MonthShift } from "@/hooks/use-month-shifts";

export function BulkShiftEditPayrollPreview(props: {
  currentUserId: string;
  shifts: MonthShift[];
  drafts: Map<string, Draft>;
  timetableSets: BulkShiftEditPageClientProps["timetableSets"];
  workplaces: BulkShiftEditPageClientProps["previewWorkplaces"];
  payrollRules: BulkShiftEditPageClientProps["previewPayrollRules"];
}) {
  const previewShiftInputs = useMemo(
    () => createBulkEditPreviewShiftInputs(props.shifts, props.drafts),
    [props.drafts, props.shifts],
  );
  const previewTimetableSets = useMemo(
    () =>
      props.timetableSets.map((set) => ({
        id: set.id,
        workplaceId: set.workplaceId,
        items: set.periods.map((period) => ({
          timetableSetId: set.id,
          period: period.period,
          startTime: period.startTime.slice(11, 16),
          endTime: period.endTime.slice(11, 16),
        })),
      })),
    [props.timetableSets],
  );
  const payrollPreview = useBulkShiftEditPayrollPreview({
    userId: props.currentUserId,
    beforeShifts: previewShiftInputs.beforeShifts,
    afterShifts: previewShiftInputs.afterShifts,
    workplaces: props.workplaces,
    payrollRules: props.payrollRules,
    timetableSets: previewTimetableSets,
  });

  return (
    <BulkShiftEditPayrollPreviewFloating
      months={payrollPreview.months}
      years={payrollPreview.years}
      unresolvedCount={payrollPreview.unresolvedCount}
      isBaselineLoading={payrollPreview.isBaselineLoading}
      baselineErrorMessage={payrollPreview.baselineErrorMessage}
      isAnnualLoading={payrollPreview.isAnnualLoading}
      annualErrorMessage={payrollPreview.annualErrorMessage}
      isAnnualResponseIncomplete={payrollPreview.isAnnualResponseIncomplete}
    />
  );
}

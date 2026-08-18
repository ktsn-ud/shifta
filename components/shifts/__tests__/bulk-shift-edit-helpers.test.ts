import { createBulkEditPreviewShiftInputs } from "@/components/shifts/bulk-shift-edit-helpers";
import type { Draft } from "@/components/shifts/bulk-shift-edit-types";
import type { MonthShift } from "@/hooks/use-month-shifts";
import { calculateBulkEditPayrollPreview } from "@/lib/payroll/bulk-edit-preview";

function createShift(): MonthShift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: "2026-03-20T00:00:00.000Z",
    startTime: "1970-01-01T09:00:00.000Z",
    endTime: "1970-01-01T18:00:00.000Z",
    breakMinutes: 60,
    transportationAllowance: 480,
    shiftType: "NORMAL",
    comment: null,
    googleSyncStatus: "SUCCESS",
    googleSyncError: null,
    googleSyncedAt: null,
    workedMinutes: 480,
    estimatedPay: 8000,
    workplace: {
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
    },
    lessonRange: null,
  };
}

describe("createBulkEditPreviewShiftInputs", () => {
  it("空の休憩時間と交通費を保存仕様どおり0としてプレビュー計算できる", () => {
    const shift = createShift();
    const draft: Draft = {
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: "",
      transportationAllowance: "",
      comment: "",
      timetableSetId: "",
      startPeriod: "",
      endPeriod: "",
    };
    const previewInput = createBulkEditPreviewShiftInputs(
      [shift],
      new Map([[shift.id, draft]]),
    );

    expect(previewInput.afterShifts).toEqual([
      expect.objectContaining({
        breakMinutes: 0,
        transportationAllowance: 0,
      }),
    ]);
    expect(
      calculateBulkEditPayrollPreview({
        ...previewInput,
        workplaces: [
          {
            id: "workplace-1",
            closingDayType: "END_OF_MONTH",
            closingDay: null,
            payday: 25,
          },
        ],
        payrollRules: [
          {
            workplaceId: "workplace-1",
            startDate: "2020-01-01",
            endDate: null,
            baseHourlyWage: 1000,
            nightPremiumRate: 0,
            dailyOvertimeThreshold: 8,
            holidayType: "NONE",
          },
        ],
        timetableSets: [],
      }).unresolvedCount,
    ).toBe(0);
  });
});

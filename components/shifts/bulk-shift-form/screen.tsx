"use client";

import {
  getBulkShiftValidationErrorSummary,
  type BulkShiftFormController,
} from "@/components/shifts/BulkShiftForm";
import { ShiftPayrollPreviewFloating } from "@/components/shifts/ShiftPayrollPreviewFloating";
import { AsyncStateNotice } from "@/components/ui/async-state-notice";
import { Form } from "@/components/ui/form";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
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
  const validationErrorSummary = getBulkShiftValidationErrorSummary(
    controller.errors,
  );

  return (
    <section className="space-y-6 p-4 pb-32 md:p-6 md:pb-6">
      <BulkShiftHeader />

      {controller.isWorkplaceRefreshing ? (
        <AsyncStateNotice
          variant={controller.isStaleWorkplaceContext ? "stale" : "refresh"}
          title={
            controller.isStaleWorkplaceContext
              ? "勤務先に紐づく補助データを切り替え中です。"
              : "勤務先に紐づく補助データを更新中です。"
          }
          description={
            controller.isStaleWorkplaceContext
              ? "給与ルールや時間割は前の勤務先の内容を一時表示しています。切り替え完了まで入力は停止します。"
              : "給与ルールと時間割の最新状態を確認しています。"
          }
        />
      ) : null}

      <LoadingOverlay
        isLoading={controller.isSubmitting}
        label="シフトを一括登録中..."
        className="rounded-xl"
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void controller.handleSubmit();
          }}
        >
          {validationErrorSummary ? (
            <section
              className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm"
              role="alert"
              aria-labelledby="bulk-validation-summary-title"
            >
              <h2 id="bulk-validation-summary-title" className="font-semibold">
                {validationErrorSummary.errorCount}件の入力エラーがあります
              </h2>
              {validationErrorSummary.failedDateKeys.length > 0 ? (
                <p className="mt-1 text-muted-foreground">
                  修正が必要な日付:{" "}
                  {validationErrorSummary.failedDateKeys.join("、")}
                </p>
              ) : null}
              <p className="mt-2">
                最初の修正対象: {validationErrorSummary.firstErrorMessage}
              </p>
            </section>
          ) : null}
          <BulkShiftWorkplaceSection {...controller} />
          <BulkShiftCalendarSection {...controller} />
          <BulkShiftDefaultsSection {...controller} />
          <BulkShiftRowsSection {...controller} />
          <BulkShiftFormFooter {...controller} />
        </Form>
      </LoadingOverlay>

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

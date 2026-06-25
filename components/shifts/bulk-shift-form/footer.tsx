"use client";

import type { BulkShiftFormController } from "@/components/shifts/BulkShiftForm";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import { Field, FieldContent } from "@/components/ui/form";

export function BulkShiftFormFooter(
  props: Pick<
    BulkShiftFormController,
    | "formErrorMessage"
    | "isSubmitting"
    | "isSignOutScheduled"
    | "isWorkplaceLoading"
    | "handleCancel"
  >,
) {
  const {
    formErrorMessage,
    isSubmitting,
    isSignOutScheduled,
    isWorkplaceLoading,
    handleCancel,
  } = props;

  return (
    <>
      <Field>
        <FieldContent>
          <FormErrorMessage message={formErrorMessage} />
        </FieldContent>
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={isSubmitting || isSignOutScheduled}
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isSignOutScheduled || isWorkplaceLoading}
        >
          {isSubmitting ? "登録中..." : "確定"}
        </Button>
      </div>
    </>
  );
}

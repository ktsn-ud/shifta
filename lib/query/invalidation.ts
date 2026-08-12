import { type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";

type InvalidateAfterShiftMutationOptions = {
  mode?: "all" | "background";
  refetchType?: "active" | "none";
};

export async function invalidateAfterShiftMutation(
  queryClient: QueryClient,
  options?: InvalidateAfterShiftMutationOptions,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.shifts.all(),
    refetchType: options?.refetchType,
  });

  const relatedInvalidation = Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.summaryScope(),
      refetchType: options?.refetchType,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.actualScope(),
      refetchType: options?.refetchType,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.previewBaselineScope(),
      refetchType: options?.refetchType,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.detailsScope(),
      refetchType: options?.refetchType,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.all(),
      refetchType: options?.refetchType,
    }),
  ]);

  if (options?.mode === "background") {
    void relatedInvalidation.catch((error) => {
      console.error(
        "failed to invalidate related queries after shift mutation",
        {
          error,
        },
      );
    });
    return;
  }

  await relatedInvalidation;
}

export async function invalidateAfterWorkplaceMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.workplaces.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts.all() }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.actualScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.summaryScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.previewBaselineScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.detailsScope(),
    }),
  ]);
}

export async function invalidateAfterPayrollRuleMutation(
  queryClient: QueryClient,
  workplaceId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.detailSummary({ workplaceId }),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.editDetail({ workplaceId }),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.payrollRules({ workplaceId }),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.shiftFormBootstrapScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.payrollRuleDetailScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.actualScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.summaryScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.previewBaselineScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.detailsScope(),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts.all() }),
  ]);
}

export async function invalidateAfterTimetableMutation(
  queryClient: QueryClient,
  workplaceId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.timetables({ workplaceId }),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.detailSummary({ workplaceId }),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.editDetail({ workplaceId }),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.workplaces.shiftFormBootstrapScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.actualScope(),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.shifts.all() }),
  ]);
}

export async function invalidateAfterActualPayrollMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.actualScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.summaryScope(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.payroll.detailsScope(),
    }),
  ]);
}

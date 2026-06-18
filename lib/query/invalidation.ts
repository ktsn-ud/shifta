import { type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";

type InvalidateAfterShiftMutationOptions = {
  mode?: "all" | "background";
};

export async function invalidateAfterShiftMutation(
  queryClient: QueryClient,
  options?: InvalidateAfterShiftMutationOptions,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["shifts"] });

  const relatedInvalidation = Promise.all([
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "actual"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "previewBaseline"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "details"] }),
    queryClient.invalidateQueries({ queryKey: ["workplaces"] }),
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
    queryClient.invalidateQueries({ queryKey: ["workplaces"] }),
    queryClient.invalidateQueries({ queryKey: ["shifts"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "actual"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "previewBaseline"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "details"] }),
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
      queryKey: ["workplaces", "payrollRuleDetail"],
    }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "actual"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "previewBaseline"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "details"] }),
    queryClient.invalidateQueries({ queryKey: ["shifts"] }),
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
    queryClient.invalidateQueries({ queryKey: ["payroll", "actual"] }),
    queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  ]);
}

export async function invalidateAfterActualPayrollMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["payroll", "actual"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "details"] }),
  ]);
}

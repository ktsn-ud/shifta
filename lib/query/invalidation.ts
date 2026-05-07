import { type QueryClient } from "@tanstack/react-query";

export async function invalidateAfterShiftMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["shifts"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "details"] }),
    queryClient.invalidateQueries({ queryKey: ["workplaces"] }),
  ]);
}

export async function invalidateAfterWorkplaceMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["workplaces"] }),
    queryClient.invalidateQueries({ queryKey: ["shifts"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "details"] }),
  ]);
}

export async function invalidateAfterPayrollRuleMutation(
  queryClient: QueryClient,
  workplaceId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["workplaces", "detail", { workplaceId }],
    }),
    queryClient.invalidateQueries({ queryKey: ["payroll", "summary"] }),
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
      queryKey: ["workplaces", "timetables", { workplaceId }],
    }),
    queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  ]);
}

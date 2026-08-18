import { QueryClient } from "@tanstack/react-query";
import {
  invalidateAfterActualPayrollMutation,
  invalidateAfterPayrollRuleMutation,
  invalidateAfterShiftMutation,
  invalidateAfterTimetableMutation,
  invalidateAfterWorkplaceMutation,
} from "@/lib/query/invalidation";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function invalidatedFilters(
  invalidateQueries: jest.SpiedFunction<QueryClient["invalidateQueries"]>,
) {
  return invalidateQueries.mock.calls.map(([filters]) => filters);
}

describe("query invalidation keys", () => {
  it("シフト更新後は既存のドメインprefixを同じrefetch設定で無効化する", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAfterShiftMutation(queryClient, { refetchType: "none" });

    expect(invalidatedFilters(invalidateQueries)).toEqual([
      { queryKey: ["shifts"], refetchType: "none" },
      { queryKey: ["payroll", "summary"], refetchType: "none" },
      { queryKey: ["payroll", "actual"], refetchType: "none" },
      { queryKey: ["payroll", "previewBaseline"], refetchType: "none" },
      { queryKey: ["payroll", "previewAnnual"], refetchType: "none" },
      { queryKey: ["payroll", "details"], refetchType: "none" },
      { queryKey: ["workplaces"], refetchType: "none" },
    ]);
  });

  it("勤務先更新後は既存の全ドメインprefixを無効化する", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAfterWorkplaceMutation(queryClient);

    expect(invalidatedFilters(invalidateQueries)).toEqual([
      { queryKey: ["workplaces"] },
      { queryKey: ["shifts"] },
      { queryKey: ["payroll", "actual"] },
      { queryKey: ["payroll", "summary"] },
      { queryKey: ["payroll", "previewBaseline"] },
      { queryKey: ["payroll", "previewAnnual"] },
      { queryKey: ["payroll", "details"] },
    ]);
  });

  it("給与ルール更新後は勤務先の対象leafと関連prefixを無効化する", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAfterPayrollRuleMutation(queryClient, "wp-1");

    expect(invalidatedFilters(invalidateQueries)).toEqual([
      {
        queryKey: ["workplaces", "detailSummary", { workplaceId: "wp-1" }],
      },
      {
        queryKey: ["workplaces", "editDetail", { workplaceId: "wp-1" }],
      },
      {
        queryKey: ["workplaces", "payrollRules", { workplaceId: "wp-1" }],
      },
      { queryKey: ["workplaces", "shiftFormBootstrap"] },
      { queryKey: ["workplaces", "payrollRuleDetail"] },
      { queryKey: ["payroll", "actual"] },
      { queryKey: ["payroll", "summary"] },
      { queryKey: ["payroll", "previewBaseline"] },
      { queryKey: ["payroll", "previewAnnual"] },
      { queryKey: ["payroll", "details"] },
      { queryKey: ["shifts"] },
    ]);
  });

  it("時間割更新後は勤務先の対象leafと既存関連prefixを無効化する", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAfterTimetableMutation(queryClient, "wp-1");

    expect(invalidatedFilters(invalidateQueries)).toEqual([
      { queryKey: ["workplaces", "timetables", { workplaceId: "wp-1" }] },
      {
        queryKey: ["workplaces", "detailSummary", { workplaceId: "wp-1" }],
      },
      {
        queryKey: ["workplaces", "editDetail", { workplaceId: "wp-1" }],
      },
      { queryKey: ["workplaces", "shiftFormBootstrap"] },
      { queryKey: ["payroll", "actual"] },
      { queryKey: ["shifts"] },
    ]);
  });

  it("実給与更新後は給与の既存prefixだけを無効化する", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = jest
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateAfterActualPayrollMutation(queryClient);

    expect(invalidatedFilters(invalidateQueries)).toEqual([
      { queryKey: ["payroll", "actual"] },
      { queryKey: ["payroll", "summary"] },
      { queryKey: ["payroll", "previewAnnual"] },
      { queryKey: ["payroll", "details"] },
    ]);
  });
});

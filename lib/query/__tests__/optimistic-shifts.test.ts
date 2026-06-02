import { QueryClient } from "@tanstack/react-query";
import { removeShiftsFromMonthCachesOptimistically } from "@/lib/query/optimistic-shifts";

type ShiftRow = {
  id: string;
  label: string;
};

describe("removeShiftsFromMonthCachesOptimistically", () => {
  function createQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  }

  it("月次シフトキャッシュから対象IDのみを即時除外し、rollbackで元に戻せる", () => {
    const queryClient = createQueryClient();

    const juneKey = [
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        includeEstimate: false,
      },
    ] as const;
    const juneEstimateKey = [
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        includeEstimate: true,
      },
    ] as const;
    const unrelatedKey = ["shifts", "detail", { shiftId: "shift-2" }] as const;

    queryClient.setQueryData<ShiftRow[]>(juneKey, [
      { id: "shift-1", label: "A" },
      { id: "shift-2", label: "B" },
    ]);
    queryClient.setQueryData<ShiftRow[]>(juneEstimateKey, [
      { id: "shift-2", label: "B-est" },
      { id: "shift-3", label: "C-est" },
    ]);
    queryClient.setQueryData(unrelatedKey, { id: "shift-2" });

    const rollback = removeShiftsFromMonthCachesOptimistically(queryClient, [
      "shift-2",
    ]);

    expect(queryClient.getQueryData(juneKey)).toEqual([
      { id: "shift-1", label: "A" },
    ]);
    expect(queryClient.getQueryData(juneEstimateKey)).toEqual([
      { id: "shift-3", label: "C-est" },
    ]);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual({ id: "shift-2" });

    rollback();

    expect(queryClient.getQueryData(juneKey)).toEqual([
      { id: "shift-1", label: "A" },
      { id: "shift-2", label: "B" },
    ]);
    expect(queryClient.getQueryData(juneEstimateKey)).toEqual([
      { id: "shift-2", label: "B-est" },
      { id: "shift-3", label: "C-est" },
    ]);
  });

  it("配列以外のキャッシュ値は変更しない", () => {
    const queryClient = createQueryClient();

    const monthKey = ["shifts", "month", { userId: "user-1" }] as const;
    queryClient.setQueryData(monthKey, {
      meta: "not-array",
    });

    const rollback = removeShiftsFromMonthCachesOptimistically(queryClient, [
      "shift-1",
    ]);

    expect(queryClient.getQueryData(monthKey)).toEqual({
      meta: "not-array",
    });

    rollback();

    expect(queryClient.getQueryData(monthKey)).toEqual({
      meta: "not-array",
    });
  });
});

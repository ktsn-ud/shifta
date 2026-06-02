import { QueryClient } from "@tanstack/react-query";
import type { MonthShift } from "@/hooks/use-month-shifts";
import {
  removeShiftsFromMonthCachesOptimistically,
  updateShiftInMonthCachesOptimistically,
  upsertMonthShiftInCachesOptimistically,
  upsertMonthShiftsInCachesOptimistically,
} from "@/lib/query/optimistic-shifts";

function createMonthShift(overrides: Partial<MonthShift> = {}): MonthShift {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    date: "2026-06-10T00:00:00.000Z",
    startTime: "1970-01-01T09:00:00.000Z",
    endTime: "1970-01-01T17:00:00.000Z",
    breakMinutes: 60,
    shiftType: "NORMAL",
    comment: null,
    googleSyncStatus: "PENDING",
    googleSyncError: null,
    googleSyncedAt: null,
    workedMinutes: 420,
    estimatedPay: null,
    workplace: {
      id: "workplace-1",
      name: "勤務先A",
      color: "#3366FF",
      type: "GENERAL",
    },
    lessonRange: null,
    ...overrides,
  };
}

describe("optimistic month shift cache helpers", () => {
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

    queryClient.setQueryData<MonthShift[]>(juneKey, [
      createMonthShift({ id: "shift-1" }),
      createMonthShift({ id: "shift-2" }),
    ]);
    queryClient.setQueryData<MonthShift[]>(juneEstimateKey, [
      createMonthShift({ id: "shift-2" }),
      createMonthShift({ id: "shift-3" }),
    ]);
    queryClient.setQueryData(unrelatedKey, { id: "shift-2" });

    const rollback = removeShiftsFromMonthCachesOptimistically(queryClient, [
      "shift-2",
    ]);

    expect(
      (queryClient.getQueryData(juneKey) as MonthShift[]).map(
        (shift) => shift.id,
      ),
    ).toEqual(["shift-1"]);
    expect(
      (queryClient.getQueryData(juneEstimateKey) as MonthShift[]).map(
        (shift) => shift.id,
      ),
    ).toEqual(["shift-3"]);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual({ id: "shift-2" });

    rollback();

    expect(
      (queryClient.getQueryData(juneKey) as MonthShift[]).map(
        (shift) => shift.id,
      ),
    ).toEqual(["shift-1", "shift-2"]);
    expect(
      (queryClient.getQueryData(juneEstimateKey) as MonthShift[]).map(
        (shift) => shift.id,
      ),
    ).toEqual(["shift-2", "shift-3"]);
  });

  it("新規シフトを対象月のcacheへ即時追加する", () => {
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
    const mayKey = [
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        includeEstimate: false,
      },
    ] as const;

    queryClient.setQueryData<MonthShift[]>(juneKey, []);
    queryClient.setQueryData<MonthShift[]>(mayKey, []);

    upsertMonthShiftInCachesOptimistically(queryClient, createMonthShift());

    expect(
      (queryClient.getQueryData(juneKey) as MonthShift[]).map(
        (shift) => shift.id,
      ),
    ).toEqual(["shift-1"]);
    expect(queryClient.getQueryData(mayKey)).toEqual([]);
  });

  it("複数シフトを対象月ごとに即時追加し、既存IDは置き換える", () => {
    const queryClient = createQueryClient();
    const marchKey = [
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        includeEstimate: false,
      },
    ] as const;
    const aprilKey = [
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        includeEstimate: false,
      },
    ] as const;

    queryClient.setQueryData<MonthShift[]>(marchKey, [
      createMonthShift({
        id: "shift-1",
        date: "2026-03-20T00:00:00.000Z",
        comment: "旧データ",
      }),
    ]);
    queryClient.setQueryData<MonthShift[]>(aprilKey, []);

    upsertMonthShiftsInCachesOptimistically(queryClient, [
      createMonthShift({
        id: "shift-1",
        date: "2026-03-20T00:00:00.000Z",
        comment: "更新後",
      }),
      createMonthShift({
        id: "shift-2",
        date: "2026-04-02T00:00:00.000Z",
      }),
    ]);

    expect(
      (queryClient.getQueryData(marchKey) as MonthShift[]).map((shift) => ({
        id: shift.id,
        comment: shift.comment,
      })),
    ).toEqual([{ id: "shift-1", comment: "更新後" }]);
    expect(
      (queryClient.getQueryData(aprilKey) as MonthShift[]).map((shift) => ({
        id: shift.id,
        date: shift.date,
      })),
    ).toEqual([{ id: "shift-2", date: "2026-04-02T00:00:00.000Z" }]);
  });

  it("編集で月が変わった場合は旧月から除去して新月へ移す", () => {
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
    const julyKey = [
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        includeEstimate: false,
      },
    ] as const;

    queryClient.setQueryData<MonthShift[]>(juneKey, [createMonthShift()]);
    queryClient.setQueryData<MonthShift[]>(julyKey, []);

    upsertMonthShiftInCachesOptimistically(
      queryClient,
      createMonthShift({
        id: "shift-1",
        date: "2026-07-02T00:00:00.000Z",
      }),
      {
        previousShiftId: "shift-1",
      },
    );

    expect(queryClient.getQueryData(juneKey)).toEqual([]);
    expect(
      (queryClient.getQueryData(julyKey) as MonthShift[]).map(
        (shift) => shift.date,
      ),
    ).toEqual(["2026-07-02T00:00:00.000Z"]);
  });

  it("既存シフトの部分更新を全ての月次cacheへ反映する", () => {
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

    queryClient.setQueryData<MonthShift[]>(juneKey, [createMonthShift()]);

    updateShiftInMonthCachesOptimistically(queryClient, "shift-1", (shift) => ({
      ...shift,
      startTime: "1970-01-01T10:00:00.000Z",
      endTime: "1970-01-01T18:00:00.000Z",
      breakMinutes: 45,
      workedMinutes: 435,
    }));

    expect(queryClient.getQueryData(juneKey)).toEqual([
      createMonthShift({
        startTime: "1970-01-01T10:00:00.000Z",
        endTime: "1970-01-01T18:00:00.000Z",
        breakMinutes: 45,
        workedMinutes: 435,
      }),
    ]);
  });
});

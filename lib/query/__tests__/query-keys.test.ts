import { queryKeys } from "@/lib/query/query-keys";

describe("queryKeys", () => {
  it("月次シフトのキーにユーザー境界と条件を含む", () => {
    expect(
      queryKeys.shifts.month({
        userId: "user-1",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        includeEstimate: false,
      }),
    ).toEqual([
      "shifts",
      "month",
      {
        userId: "user-1",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        includeEstimate: false,
      },
    ]);
  });

  it("給与詳細（月次・勤務先年次）でキーが衝突しない", () => {
    const monthly = queryKeys.payroll.detailsMonthly({
      userId: "user-1",
      month: "2026-05",
    });
    const yearly = queryKeys.payroll.detailsWorkplaceYearly({
      userId: "user-1",
      workplaceId: "wp-1",
      year: 2026,
    });

    expect(monthly).not.toEqual(yearly);
  });

  it("勤務先関連キーは機能ごとに分かれる", () => {
    const list = queryKeys.workplaces.list({
      userId: "user-1",
      includeCounts: true,
    });
    const detail = queryKeys.workplaces.detail({
      workplaceId: "wp-1",
    });
    const payrollRules = queryKeys.workplaces.payrollRules({
      workplaceId: "wp-1",
    });
    const timetables = queryKeys.workplaces.timetables({
      workplaceId: "wp-1",
    });

    expect(list[1]).toBe("list");
    expect(detail[1]).toBe("detail");
    expect(payrollRules[1]).toBe("payrollRules");
    expect(timetables[1]).toBe("timetables");
  });
});

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

  it("給与プレビューbaselineキーは月配列を正規化する", () => {
    expect(
      queryKeys.payroll.previewBaseline({
        userId: "user-1",
        months: ["2026-07", "2026-06", "2026-07"],
      }),
    ).toEqual([
      "payroll",
      "previewBaseline",
      {
        userId: "user-1",
        months: ["2026-06", "2026-07"],
      },
    ]);
  });

  it("勤務先関連キーは機能ごとに分かれる", () => {
    const list = queryKeys.workplaces.list({
      userId: "user-1",
      includeCounts: true,
    });
    const detailSummary = queryKeys.workplaces.detailSummary({
      workplaceId: "wp-1",
    });
    const editDetail = queryKeys.workplaces.editDetail({
      workplaceId: "wp-1",
    });
    const payrollRules = queryKeys.workplaces.payrollRules({
      workplaceId: "wp-1",
    });
    const payrollRuleDetail = queryKeys.workplaces.payrollRuleDetail({
      workplaceId: "wp-1",
      ruleId: "rule-1",
    });
    const timetables = queryKeys.workplaces.timetables({
      workplaceId: "wp-1",
    });

    expect(list[1]).toBe("list");
    expect(detailSummary[1]).toBe("detailSummary");
    expect(editDetail[1]).toBe("editDetail");
    expect(detailSummary).not.toEqual(editDetail);
    expect(payrollRules[1]).toBe("payrollRules");
    expect(payrollRuleDetail[1]).toBe("payrollRuleDetail");
    expect(timetables[1]).toBe("timetables");
  });

  it("シフト詳細キーを分離できる", () => {
    expect(
      queryKeys.shifts.detail({
        shiftId: "shift-1",
      }),
    ).toEqual([
      "shifts",
      "detail",
      {
        shiftId: "shift-1",
      },
    ]);
  });
});

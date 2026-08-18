import { queryKeys } from "@/lib/query/query-keys";

function expectToStartWith(
  leaf: readonly unknown[],
  prefix: readonly unknown[],
): void {
  expect(leaf.slice(0, prefix.length)).toEqual(prefix);
}

describe("queryKeys", () => {
  const monthShifts = {
    userId: "user-1",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    includeEstimate: false,
  };
  const payrollSummary = { userId: "user-1", year: 2026 };
  const payrollMonth = { userId: "user-1", month: "2026-05" };
  const workplace = { workplaceId: "wp-1" };

  it("全てのprefixキーを固定配列で返す", () => {
    expect(queryKeys.shifts.all()).toEqual(["shifts"]);
    expect(queryKeys.shifts.monthScope()).toEqual(["shifts", "month"]);

    expect(queryKeys.payroll.all()).toEqual(["payroll"]);
    expect(queryKeys.payroll.summaryScope()).toEqual(["payroll", "summary"]);
    expect(queryKeys.payroll.actualScope()).toEqual(["payroll", "actual"]);
    expect(queryKeys.payroll.previewBaselineScope()).toEqual([
      "payroll",
      "previewBaseline",
    ]);
    expect(queryKeys.payroll.previewAnnualScope()).toEqual([
      "payroll",
      "previewAnnual",
    ]);
    expect(queryKeys.payroll.detailsScope()).toEqual(["payroll", "details"]);

    expect(queryKeys.workplaces.all()).toEqual(["workplaces"]);
    expect(queryKeys.workplaces.shiftFormBootstrapScope()).toEqual([
      "workplaces",
      "shiftFormBootstrap",
    ]);
    expect(queryKeys.workplaces.payrollRuleDetailScope()).toEqual([
      "workplaces",
      "payrollRuleDetail",
    ]);
  });

  it("全てのleafキーを固定配列で返す", () => {
    expect(queryKeys.users.me()).toEqual(["users", "me"]);

    expect(queryKeys.shifts.month(monthShifts)).toEqual([
      "shifts",
      "month",
      monthShifts,
    ]);
    expect(queryKeys.shifts.detail({ shiftId: "shift-1" })).toEqual([
      "shifts",
      "detail",
      { shiftId: "shift-1" },
    ]);
    expect(
      queryKeys.shifts.unconfirmed({
        userId: "user-1",
        initialDataVersion: "v1",
      }),
    ).toEqual([
      "shifts",
      "unconfirmed",
      { userId: "user-1", initialDataVersion: "v1" },
    ]);
    expect(
      queryKeys.shifts.unconfirmedCount({
        userId: "user-1",
        initialDataVersion: "v1",
      }),
    ).toEqual([
      "shifts",
      "unconfirmedCount",
      { userId: "user-1", initialDataVersion: "v1" },
    ]);

    expect(queryKeys.payroll.summary(payrollSummary)).toEqual([
      "payroll",
      "summary",
      payrollSummary,
    ]);
    expect(queryKeys.payroll.summaryYearContext(payrollMonth)).toEqual([
      "payroll",
      "summary",
      "yearContext",
      payrollMonth,
    ]);
    expect(queryKeys.payroll.summaryAmount(payrollMonth)).toEqual([
      "payroll",
      "summary",
      "amount",
      payrollMonth,
    ]);
    expect(queryKeys.payroll.actual(payrollMonth)).toEqual([
      "payroll",
      "actual",
      payrollMonth,
    ]);
    expect(
      queryKeys.payroll.previewBaseline({
        userId: "user-1",
        months: ["2026-07", "2026-06", "2026-07"],
      }),
    ).toEqual([
      "payroll",
      "previewBaseline",
      { userId: "user-1", months: ["2026-06", "2026-07"] },
    ]);
    expect(
      queryKeys.payroll.previewAnnual({
        userId: "user-1",
        years: [2027, 2026, 2027],
      }),
    ).toEqual([
      "payroll",
      "previewAnnual",
      { userId: "user-1", years: [2026, 2027] },
    ]);
    expect(queryKeys.payroll.detailsMonthly(payrollMonth)).toEqual([
      "payroll",
      "details",
      "monthly",
      payrollMonth,
    ]);
    expect(
      queryKeys.payroll.detailsWorkplaceYearly({
        userId: "user-1",
        workplaceId: "wp-1",
        year: 2026,
      }),
    ).toEqual([
      "payroll",
      "details",
      "workplaceYearly",
      { userId: "user-1", workplaceId: "wp-1", year: 2026 },
    ]);

    expect(
      queryKeys.workplaces.list({ userId: "user-1", includeCounts: true }),
    ).toEqual([
      "workplaces",
      "list",
      { userId: "user-1", includeCounts: true },
    ]);
    expect(queryKeys.workplaces.detailSummary(workplace)).toEqual([
      "workplaces",
      "detailSummary",
      workplace,
    ]);
    expect(queryKeys.workplaces.editDetail(workplace)).toEqual([
      "workplaces",
      "editDetail",
      workplace,
    ]);
    expect(queryKeys.workplaces.payrollRules(workplace)).toEqual([
      "workplaces",
      "payrollRules",
      workplace,
    ]);
    expect(
      queryKeys.workplaces.payrollRuleDetail({
        workplaceId: "wp-1",
        ruleId: "rule-1",
      }),
    ).toEqual([
      "workplaces",
      "payrollRuleDetail",
      { workplaceId: "wp-1", ruleId: "rule-1" },
    ]);
    expect(queryKeys.workplaces.timetables(workplace)).toEqual([
      "workplaces",
      "timetables",
      workplace,
    ]);
    expect(
      queryKeys.workplaces.shiftFormBootstrap({
        userId: "user-1",
        selectedWorkplaceId: null,
      }),
    ).toEqual([
      "workplaces",
      "shiftFormBootstrap",
      { userId: "user-1", selectedWorkplaceId: null },
    ]);
  });

  it("各leafキーは対応するprefixキーから始まる", () => {
    expectToStartWith(
      queryKeys.shifts.month(monthShifts),
      queryKeys.shifts.all(),
    );
    expectToStartWith(
      queryKeys.shifts.month(monthShifts),
      queryKeys.shifts.monthScope(),
    );
    expectToStartWith(
      queryKeys.shifts.detail({ shiftId: "shift-1" }),
      queryKeys.shifts.all(),
    );
    expectToStartWith(
      queryKeys.shifts.unconfirmed({
        userId: "user-1",
        initialDataVersion: "v1",
      }),
      queryKeys.shifts.all(),
    );
    expectToStartWith(
      queryKeys.shifts.unconfirmedCount({
        userId: "user-1",
        initialDataVersion: "v1",
      }),
      queryKeys.shifts.all(),
    );

    expectToStartWith(
      queryKeys.payroll.summary(payrollSummary),
      queryKeys.payroll.summaryScope(),
    );
    expectToStartWith(
      queryKeys.payroll.summaryYearContext(payrollMonth),
      queryKeys.payroll.summaryScope(),
    );
    expectToStartWith(
      queryKeys.payroll.summaryAmount(payrollMonth),
      queryKeys.payroll.summaryScope(),
    );
    expectToStartWith(
      queryKeys.payroll.actual(payrollMonth),
      queryKeys.payroll.actualScope(),
    );
    expectToStartWith(
      queryKeys.payroll.previewBaseline({ userId: "user-1", months: [] }),
      queryKeys.payroll.previewBaselineScope(),
    );
    expectToStartWith(
      queryKeys.payroll.previewAnnual({ userId: "user-1", years: [] }),
      queryKeys.payroll.previewAnnualScope(),
    );
    expectToStartWith(
      queryKeys.payroll.detailsMonthly(payrollMonth),
      queryKeys.payroll.detailsScope(),
    );
    expectToStartWith(
      queryKeys.payroll.detailsWorkplaceYearly({
        userId: "user-1",
        workplaceId: "wp-1",
        year: 2026,
      }),
      queryKeys.payroll.detailsScope(),
    );

    expectToStartWith(
      queryKeys.workplaces.list({ userId: "user-1", includeCounts: true }),
      queryKeys.workplaces.all(),
    );
    expectToStartWith(
      queryKeys.workplaces.detailSummary(workplace),
      queryKeys.workplaces.all(),
    );
    expectToStartWith(
      queryKeys.workplaces.editDetail(workplace),
      queryKeys.workplaces.all(),
    );
    expectToStartWith(
      queryKeys.workplaces.payrollRules(workplace),
      queryKeys.workplaces.all(),
    );
    expectToStartWith(
      queryKeys.workplaces.payrollRuleDetail({
        workplaceId: "wp-1",
        ruleId: "rule-1",
      }),
      queryKeys.workplaces.payrollRuleDetailScope(),
    );
    expectToStartWith(
      queryKeys.workplaces.timetables(workplace),
      queryKeys.workplaces.all(),
    );
    expectToStartWith(
      queryKeys.workplaces.shiftFormBootstrap({
        userId: "user-1",
        selectedWorkplaceId: "wp-1",
      }),
      queryKeys.workplaces.shiftFormBootstrapScope(),
    );
  });

  it("Google Calendarキーは既存のpreimage形状を維持し、custom IDをtrim・重複排除する", () => {
    expect(
      queryKeys.calendar.googleEvents("2026-05", "default", [
        " should-not-appear ",
      ]),
    ).toEqual(["bulk-google-calendar-events", "2026-05", "default", "default"]);
    expect(
      queryKeys.calendar.googleEvents("2026-05", "custom", [
        " primary ",
        "team@example.com",
        "primary",
        "",
        "  ",
        " team@example.com ",
      ]),
    ).toEqual([
      "bulk-google-calendar-events",
      "2026-05",
      "custom",
      "primary,team@example.com",
    ]);
  });
});

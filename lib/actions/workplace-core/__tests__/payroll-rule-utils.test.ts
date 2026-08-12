import {
  buildOverlappingPayrollRuleWhere,
  normalizePayrollRule,
} from "@/lib/actions/workplace-core/payroll-rule-utils";

function normalizeRule(overrides: Record<string, unknown> = {}) {
  return normalizePayrollRule({
    startDate: "2026-04-01",
    endDate: "2026-05-01",
    baseHourlyWage: 1200,
    holidayAllowanceHourly: 0,
    nightPremiumRate: 0.25,
    overtimePremiumRate: 0.5,
    dailyOvertimeThreshold: 8,
    holidayType: "WEEKEND",
    ...overrides,
  });
}

describe("payroll rule utility boundaries", () => {
  it("期間の両端に接するルールを重複から除外する半開区間条件を作る", () => {
    expect(
      buildOverlappingPayrollRuleWhere(
        "workplace-1",
        normalizeRule(),
        "rule-being-edited",
      ),
    ).toEqual({
      workplaceId: "workplace-1",
      id: { not: "rule-being-edited" },
      startDate: { lt: new Date("2026-05-01T00:00:00.000Z") },
      OR: [
        { endDate: null },
        { endDate: { gt: new Date("2026-04-01T00:00:00.000Z") } },
      ],
    });
  });

  it("終了日のないルールには未来側の境界を設けない", () => {
    expect(
      buildOverlappingPayrollRuleWhere(
        "workplace-1",
        normalizeRule({ endDate: null }),
      ),
    ).toEqual({
      workplaceId: "workplace-1",
      OR: [
        { endDate: null },
        { endDate: { gt: new Date("2026-04-01T00:00:00.000Z") } },
      ],
    });
  });
});

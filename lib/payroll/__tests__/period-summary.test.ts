import type { PayrollPeriod } from "@/lib/payroll/pay-period";
import { createPayrollPeriodSummaryGetter } from "@/lib/payroll/period-summary";

function createPeriod(monthKey: string): PayrollPeriod {
  return {
    paymentDate: new Date(`${monthKey}-25T00:00:00.000Z`),
    periodStartDate: new Date(`${monthKey}-01T00:00:00.000Z`),
    periodEndDate: new Date(`${monthKey}-28T00:00:00.000Z`),
  };
}

describe("createPayrollPeriodSummaryGetter", () => {
  it("同じ勤務先・支給月の集計は一度だけ実行して結果を再利用する", () => {
    const period = createPeriod("2026-01");
    const summarize = jest.fn(() => ({ totalWage: 5000 }));
    const getSummary = createPayrollPeriodSummaryGetter({
      periodByWorkplaceMonth: new Map([["workplace-1:2026-01", period]]),
      summarize,
    });

    const first = getSummary({ id: "workplace-1" }, "2026-01");
    const second = getSummary({ id: "workplace-1" }, "2026-01");

    expect(first).toBe(second);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledWith("workplace-1", period);
  });

  it("異なる支給月はそれぞれの対象期間で別に集計する", () => {
    const january = createPeriod("2026-01");
    const february = createPeriod("2026-02");
    const summarize = jest.fn(
      (_: string, period: PayrollPeriod) => period.paymentDate,
    );
    const getSummary = createPayrollPeriodSummaryGetter({
      periodByWorkplaceMonth: new Map([
        ["workplace-1:2026-01", january],
        ["workplace-1:2026-02", february],
      ]),
      summarize,
    });

    expect(getSummary({ id: "workplace-1" }, "2026-01")).toBe(
      january.paymentDate,
    );
    expect(getSummary({ id: "workplace-1" }, "2026-02")).toBe(
      february.paymentDate,
    );
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(summarize).toHaveBeenNthCalledWith(1, "workplace-1", january);
    expect(summarize).toHaveBeenNthCalledWith(2, "workplace-1", february);
  });

  it("対象期間がない勤務先・支給月は既存のエラーで失敗する", () => {
    const getSummary = createPayrollPeriodSummaryGetter({
      periodByWorkplaceMonth: new Map(),
      summarize: jest.fn(),
    });

    expect(() => getSummary({ id: "workplace-1" }, "2026-01")).toThrow(
      "PAYROLL_PERIOD_NOT_FOUND: workplace-1:2026-01",
    );
  });

  it("勤務先と支給月の組み合わせごとにキャッシュを分離する", () => {
    const workplaceOneJanuary = createPeriod("2026-01");
    const workplaceTwoJanuary = createPeriod("2026-01");
    const workplaceOneFebruary = createPeriod("2026-02");
    const summarize = jest.fn((workplaceId: string, period: PayrollPeriod) => ({
      workplaceId,
      paymentMonth: period.paymentDate.toISOString().slice(0, 7),
    }));
    const getSummary = createPayrollPeriodSummaryGetter({
      periodByWorkplaceMonth: new Map([
        ["workplace-1:2026-01", workplaceOneJanuary],
        ["workplace-2:2026-01", workplaceTwoJanuary],
        ["workplace-1:2026-02", workplaceOneFebruary],
      ]),
      summarize,
    });

    expect(getSummary({ id: "workplace-1" }, "2026-01")).toEqual({
      workplaceId: "workplace-1",
      paymentMonth: "2026-01",
    });
    expect(getSummary({ id: "workplace-2" }, "2026-01")).toEqual({
      workplaceId: "workplace-2",
      paymentMonth: "2026-01",
    });
    expect(getSummary({ id: "workplace-1" }, "2026-02")).toEqual({
      workplaceId: "workplace-1",
      paymentMonth: "2026-02",
    });
    expect(summarize).toHaveBeenCalledTimes(3);
  });
});

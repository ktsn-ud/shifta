import { resolvePayrollPeriodForMonth } from "@/lib/payroll/pay-period";

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("resolvePayrollPeriodForMonth", () => {
  it("締日15日・給料日25日で期間を計算する", () => {
    const result = resolvePayrollPeriodForMonth(date("2026-04-01"), {
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 25,
    });

    expect(result.paymentDate.toISOString()).toBe("2026-04-25T00:00:00.000Z");
    expect(result.periodStartDate.toISOString()).toBe(
      "2026-03-16T00:00:00.000Z",
    );
    expect(result.periodEndDate.toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });

  it("月末締め・給料日20日で期間を計算する", () => {
    const result = resolvePayrollPeriodForMonth(date("2026-04-01"), {
      closingDayType: "END_OF_MONTH",
      closingDay: null,
      payday: 20,
    });

    expect(result.paymentDate.toISOString()).toBe("2026-04-20T00:00:00.000Z");
    expect(result.periodStartDate.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(result.periodEndDate.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("2月の給料日31日指定は月末に丸める", () => {
    const result = resolvePayrollPeriodForMonth(date("2026-02-01"), {
      closingDayType: "DAY_OF_MONTH",
      closingDay: 15,
      payday: 31,
    });

    expect(result.paymentDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("締日31日指定は2月で月末に丸める", () => {
    const result = resolvePayrollPeriodForMonth(date("2026-03-01"), {
      closingDayType: "DAY_OF_MONTH",
      closingDay: 31,
      payday: 10,
    });

    expect(result.periodStartDate.toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(result.periodEndDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

import { resolveAffectedPaymentMonthKeys } from "@/lib/payroll/affected-payment-month";

describe("resolveAffectedPaymentMonthKeys", () => {
  it("maps shifts around a normal fixed closing day to their payment months", () => {
    expect(
      resolveAffectedPaymentMonthKeys([
        {
          date: new Date("2026-03-15T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "DAY_OF_MONTH",
            closingDay: 15,
            payday: 25,
          },
        },
        {
          date: new Date("2026-03-16T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "DAY_OF_MONTH",
            closingDay: 15,
            payday: 25,
          },
        },
      ]),
    ).toEqual(["2026-03", "2026-04"]);
  });

  it("maps end-of-month closing and a payday before its closing date correctly", () => {
    expect(
      resolveAffectedPaymentMonthKeys([
        {
          date: new Date("2026-03-31T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "END_OF_MONTH",
            closingDay: null,
            payday: 20,
          },
        },
        {
          date: new Date("2026-03-11T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "DAY_OF_MONTH",
            closingDay: 25,
            payday: 10,
          },
        },
      ]),
    ).toEqual(["2026-04"]);
  });

  it("returns the sorted union of affected months without duplicates", () => {
    expect(
      resolveAffectedPaymentMonthKeys([
        {
          date: new Date("2026-03-16T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "DAY_OF_MONTH",
            closingDay: 15,
            payday: 25,
          },
        },
        {
          date: new Date("2026-02-28T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "END_OF_MONTH",
            closingDay: null,
            payday: 20,
          },
        },
        {
          date: new Date("2026-03-18T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "DAY_OF_MONTH",
            closingDay: 15,
            payday: 25,
          },
        },
      ]),
    ).toEqual(["2026-03", "2026-04"]);
  });

  it("returns null when any affected payment month cannot be safely resolved", () => {
    expect(
      resolveAffectedPaymentMonthKeys([
        {
          date: new Date("2026-03-18T00:00:00.000Z"),
          payrollCycle: {
            closingDayType: "DAY_OF_MONTH",
            closingDay: null,
            payday: 25,
          },
        },
      ]),
    ).toBeNull();
    expect(resolveAffectedPaymentMonthKeys([])).toBeNull();
  });
});

import { resolveHourlyWage } from "@/lib/payroll/hourly-wage";

describe("resolveHourlyWage", () => {
  const rule = {
    baseHourlyWage: 1200,
    administrativeHourlyWage: 900,
  };

  it("塾のNORMALシフトでは事務時給を優先する", () => {
    expect(resolveHourlyWage("CRAM_SCHOOL", "NORMAL", rule)).toBe(900);
  });

  it("事務時給が未設定の塾NORMALシフトでは基本時給へフォールバックする", () => {
    expect(
      resolveHourlyWage("CRAM_SCHOOL", "NORMAL", {
        ...rule,
        administrativeHourlyWage: null,
      }),
    ).toBe(1200);
  });

  it.each([
    ["塾のLESSONシフト", "CRAM_SCHOOL", "LESSON"],
    ["一般勤務先のNORMALシフト", "GENERAL", "NORMAL"],
  ] as const)(
    "%sは事務時給を使わず基本時給を使う",
    (_, workplaceType, shiftType) => {
      expect(resolveHourlyWage(workplaceType, shiftType, rule)).toBe(1200);
    },
  );
});

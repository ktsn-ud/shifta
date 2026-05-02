import {
  formatShiftTimeRange,
  getShiftEndDate,
  isOvernightShift,
  isSameTimeShift,
  toComparableShiftRange,
} from "@/lib/shifts/time";

describe("shift time helpers", () => {
  it("detects overnight and same-time correctly", () => {
    expect(isOvernightShift("18:00", "01:00")).toBe(true);
    expect(isOvernightShift("09:00", "18:00")).toBe(false);
    expect(isSameTimeShift("18:00", "18:00")).toBe(true);
  });

  it("resolves end date based on overnight rule", () => {
    expect(getShiftEndDate("2026-05-02", "18:00", "01:00")).toBe("2026-05-03");
    expect(getShiftEndDate("2026-05-02", "09:00", "18:00")).toBe("2026-05-02");
  });

  it("formats overnight time range with 翌 prefix", () => {
    expect(formatShiftTimeRange("18:00", "01:00")).toBe("18:00 - 翌01:00");
    expect(formatShiftTimeRange("09:00", "18:00")).toBe("09:00 - 18:00");
  });

  it("converts shifts to comparable minute ranges", () => {
    const overnight = toComparableShiftRange("2026-05-02", "18:00", "01:00");
    const nextDay = toComparableShiftRange("2026-05-03", "00:30", "02:00");
    const nonOverlap = toComparableShiftRange("2026-05-03", "01:00", "03:00");

    expect(overnight.startAtUtcMinutes).toBeLessThan(overnight.endAtUtcMinutes);
    expect(nextDay.startAtUtcMinutes).toBeLessThan(overnight.endAtUtcMinutes);
    expect(nonOverlap.startAtUtcMinutes).toBe(overnight.endAtUtcMinutes);
  });
});

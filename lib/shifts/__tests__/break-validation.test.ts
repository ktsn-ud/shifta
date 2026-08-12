import {
  BREAK_MINUTES_INTEGER_MESSAGE,
  BREAK_MINUTES_LESS_THAN_GROSS_MESSAGE,
  BREAK_MINUTES_RANGE_MESSAGE,
  calculateGrossMinutes,
  getBreakMinutesValidationError,
} from "@/lib/shifts/break-validation";

describe("break-minute validation", () => {
  it("accepts the inclusive 0 and 240 minute bounds", () => {
    expect(getBreakMinutesValidationError(0, 300)).toBeNull();
    expect(getBreakMinutesValidationError(240, 300)).toBeNull();
  });

  it.each([
    [-1, BREAK_MINUTES_RANGE_MESSAGE],
    [241, BREAK_MINUTES_RANGE_MESSAGE],
    [30.5, BREAK_MINUTES_INTEGER_MESSAGE],
  ])("rejects invalid break value %s", (breakMinutes, expectedMessage) => {
    expect(getBreakMinutesValidationError(breakMinutes, 300)).toBe(
      expectedMessage,
    );
  });

  it("rejects breaks equal to or longer than gross working time", () => {
    expect(getBreakMinutesValidationError(60, 60)).toBe(
      BREAK_MINUTES_LESS_THAN_GROSS_MESSAGE,
    );
    expect(getBreakMinutesValidationError(61, 60)).toBe(
      BREAK_MINUTES_LESS_THAN_GROSS_MESSAGE,
    );
  });

  it("uses next-day elapsed time for overnight shifts", () => {
    expect(calculateGrossMinutes("22:00", "01:00")).toBe(180);
    expect(getBreakMinutesValidationError(179, 180)).toBeNull();
    expect(getBreakMinutesValidationError(180, 180)).toBe(
      BREAK_MINUTES_LESS_THAN_GROSS_MESSAGE,
    );
  });
});

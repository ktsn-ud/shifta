import { isValidDateOnly, parseDateOnly } from "@/lib/api/date-time";

describe("parseDateOnly", () => {
  it("parses a valid calendar date at UTC midnight", () => {
    expect(parseDateOnly("2026-05-02").toISOString()).toBe(
      "2026-05-02T00:00:00.000Z",
    );
  });

  it("accepts February 29 in a leap year", () => {
    expect(parseDateOnly("2024-02-29").toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("rejects February 29 in a non-leap year", () => {
    expect(() => parseDateOnly("2025-02-29")).toThrow("DATE_FORMAT_INVALID");
  });

  it("applies the Gregorian leap-year rule for century years", () => {
    expect(isValidDateOnly("1900-02-29")).toBe(false);
    expect(() => parseDateOnly("1900-02-29")).toThrow("DATE_FORMAT_INVALID");
    expect(parseDateOnly("2000-02-29").toISOString()).toBe(
      "2000-02-29T00:00:00.000Z",
    );
  });

  it.each(["2026-00-01", "2026-13-01"])(
    "rejects a date outside the month range: %s",
    (value) => {
      expect(() => parseDateOnly(value)).toThrow("DATE_FORMAT_INVALID");
    },
  );

  it("rejects a day beyond the end of a month", () => {
    expect(() => parseDateOnly("2026-04-31")).toThrow("DATE_FORMAT_INVALID");
  });

  it("rejects day zero", () => {
    expect(isValidDateOnly("2026-05-00")).toBe(false);
    expect(() => parseDateOnly("2026-05-00")).toThrow("DATE_FORMAT_INVALID");
  });

  it.each([
    ["0000-01-01", 0],
    ["0099-12-31", 99],
  ])("preserves year %s without JavaScript Date coercion", (value, year) => {
    expect(parseDateOnly(value).getUTCFullYear()).toBe(year);
  });
});

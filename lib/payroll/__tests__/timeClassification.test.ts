import {
  calculateNightHours,
  calculateOvertimeHours,
  isHolidayDate,
} from "@/lib/payroll/timeClassification";

function time(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("calculateNightHours", () => {
  it("日跨ぎ夜勤の深夜時間を計算できる", () => {
    const result = calculateNightHours(time("22:00"), time("05:00"));

    expect(result).toBe(7);
  });

  it("一部重複のみの深夜時間を計算できる", () => {
    const result = calculateNightHours(time("21:00"), time("23:00"));

    expect(result).toBe(1);
  });

  it("重複がない場合は0を返す", () => {
    const result = calculateNightHours(time("10:00"), time("18:00"));

    expect(result).toBe(0);
  });
});

describe("calculateOvertimeHours", () => {
  it("閾値未満は0を返す", () => {
    expect(calculateOvertimeHours(7, 8)).toBe(0);
  });

  it("閾値超過分を返す", () => {
    expect(calculateOvertimeHours(10.5, 8)).toBe(2.5);
  });
});

describe("isHolidayDate", () => {
  it("WEEKEND は土日を休日扱いにする", () => {
    expect(isHolidayDate(date("2026-03-21"), "WEEKEND")).toBe(true);
    expect(isHolidayDate(date("2026-03-20"), "WEEKEND")).toBe(false);
  });

  it("NONE は常に休日扱いしない", () => {
    expect(isHolidayDate(date("2026-03-21"), "NONE")).toBe(false);
  });

  it("WEEKEND_HOLIDAY は土日を休日扱いにする", () => {
    expect(isHolidayDate(date("2026-03-22"), "WEEKEND_HOLIDAY")).toBe(true);
  });

  it("HOLIDAY は祝日を休日扱いにする", () => {
    expect(isHolidayDate(date("2026-03-20"), "HOLIDAY")).toBe(true);
    expect(isHolidayDate(date("2026-03-19"), "HOLIDAY")).toBe(false);
  });

  it("WEEKEND_HOLIDAY は平日祝日も休日扱いにする", () => {
    expect(isHolidayDate(date("2026-02-11"), "WEEKEND_HOLIDAY")).toBe(true);
  });
});

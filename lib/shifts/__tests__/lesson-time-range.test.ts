import { parseTimeOnly } from "@/lib/api/date-time";
import { resolveLessonTimeRangeFromRows } from "@/lib/shifts/lesson-time-range";

describe("resolveLessonTimeRangeFromRows", () => {
  it("連続コマの開始終了とコマ間休憩を計算する", () => {
    const result = resolveLessonTimeRangeFromRows(
      {
        startPeriod: 1,
        endPeriod: 3,
      },
      [
        {
          period: 1,
          startTime: parseTimeOnly("09:00"),
          endTime: parseTimeOnly("10:00"),
        },
        {
          period: 2,
          startTime: parseTimeOnly("10:15"),
          endTime: parseTimeOnly("11:15"),
        },
        {
          period: 3,
          startTime: parseTimeOnly("11:20"),
          endTime: parseTimeOnly("12:00"),
        },
      ],
    );

    expect(result.startTime.toISOString()).toBe("1970-01-01T09:00:00.000Z");
    expect(result.endTime.toISOString()).toBe("1970-01-01T12:00:00.000Z");
    expect(result.breakMinutes).toBe(20);
  });

  it("日跨ぎコマを含む場合でも休憩時間を計算する", () => {
    const result = resolveLessonTimeRangeFromRows(
      {
        startPeriod: 1,
        endPeriod: 2,
      },
      [
        {
          period: 1,
          startTime: parseTimeOnly("23:00"),
          endTime: parseTimeOnly("00:30"),
        },
        {
          period: 2,
          startTime: parseTimeOnly("00:45"),
          endTime: parseTimeOnly("02:00"),
        },
      ],
    );

    expect(result.breakMinutes).toBe(15);
  });

  it("コマ不足時はエラーを返す", () => {
    expect(() =>
      resolveLessonTimeRangeFromRows(
        {
          startPeriod: 1,
          endPeriod: 2,
        },
        [
          {
            period: 1,
            startTime: parseTimeOnly("09:00"),
            endTime: parseTimeOnly("10:00"),
          },
        ],
      ),
    ).toThrow("指定コマ範囲の時間割が不足しています");
  });
});

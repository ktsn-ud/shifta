import { validateTimetableItems } from "@/lib/actions/workplace-core/timetable-utils";

describe("timetable item validation", () => {
  it.each([
    ["同時刻", "18:00", "18:00"],
    ["終了時刻が開始時刻より前", "18:00", "17:59"],
  ])("%sの時間範囲を拒否する", (_, startTime, endTime) => {
    expect(validateTimetableItems([{ period: 1, startTime, endTime }])).toBe(
      "startTime は endTime より前にしてください",
    );
  });

  it("時間範囲が有効なら同一periodの重複を拒否する", () => {
    expect(
      validateTimetableItems([
        { period: 1, startTime: "16:30", endTime: "17:30" },
        { period: 1, startTime: "17:40", endTime: "18:40" },
      ]),
    ).toBe("同じ時間割セット内で period が重複しています");
  });

  it("時間範囲エラーをperiod重複より先に返す", () => {
    expect(
      validateTimetableItems([
        { period: 1, startTime: "18:00", endTime: "17:00" },
        { period: 1, startTime: "17:40", endTime: "18:40" },
      ]),
    ).toBe("startTime は endTime より前にしてください");
  });
});

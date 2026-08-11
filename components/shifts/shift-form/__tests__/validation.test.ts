import {
  buildShiftPayload,
  checkShiftOverlapWarning,
  shouldRequireOvernightConfirmation,
  validateShiftForm,
} from "@/components/shifts/shift-form/validation";
import type {
  FormState,
  TimetableSet,
  Workplace,
} from "@/components/shifts/shift-form/types";

const generalWorkplace: Workplace = {
  id: "workplace-1",
  name: "勤務先A",
  type: "GENERAL",
  color: "#3366FF",
};

const cramSchoolWorkplace: Workplace = {
  ...generalWorkplace,
  id: "workplace-cram",
  type: "CRAM_SCHOOL",
};

const timetableSets: TimetableSet[] = [
  {
    id: "set-1",
    workplaceId: cramSchoolWorkplace.id,
    name: "通常期",
    sortOrder: 0,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    items: [
      {
        id: "period-1",
        timetableSetId: "set-1",
        period: 1,
        startTime: "1970-01-01T16:30:00.000Z",
        endTime: "1970-01-01T17:30:00.000Z",
      },
      {
        id: "period-2",
        timetableSetId: "set-1",
        period: 2,
        startTime: "1970-01-01T17:40:00.000Z",
        endTime: "1970-01-01T18:40:00.000Z",
      },
      {
        id: "period-3",
        timetableSetId: "set-1",
        period: 3,
        startTime: "1970-01-01T18:50:00.000Z",
        endTime: "1970-01-01T19:50:00.000Z",
      },
    ],
  },
];

function createForm(overrides: Partial<FormState> = {}): FormState {
  return {
    workplaceId: generalWorkplace.id,
    date: "2026-03-18",
    shiftType: "NORMAL",
    comment: "",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: "60",
    timetableSetId: "",
    startPeriod: "",
    endPeriod: "",
    ...overrides,
  };
}

describe("validateShiftForm", () => {
  it("accepts a 100-character comment and rejects 101 characters", () => {
    expect(
      validateShiftForm({
        form: createForm({ comment: "a".repeat(100) }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }).errors.comment,
    ).toBeUndefined();

    expect(
      validateShiftForm({
        form: createForm({ comment: "a".repeat(101) }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }).errors.comment,
    ).toBe("コメントは100文字以内で入力してください");
  });

  it.each([
    ["0", undefined],
    ["240", undefined],
    ["-1", "休憩時間は0〜240分で入力してください。"],
    ["241", "休憩時間は0〜240分で入力してください。"],
    ["30.5", "休憩時間は整数で入力してください。"],
  ])("enforces the break-minute boundary at %s", (breakMinutes, expected) => {
    expect(
      validateShiftForm({
        form: createForm({ breakMinutes }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }).errors.breakMinutes,
    ).toBe(expected);
  });

  it("uses the shared message when NORMAL break minutes leave no actual work", () => {
    expect(
      validateShiftForm({
        form: createForm({
          startTime: "09:00",
          endTime: "10:00",
          breakMinutes: "60",
        }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }).errors.breakMinutes,
    ).toBe("休憩時間は勤務時間より短く入力してください。");

    expect(
      validateShiftForm({
        form: createForm({
          startTime: "22:00",
          endTime: "01:00",
          breakMinutes: "180",
        }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }).errors.breakMinutes,
    ).toBe("休憩時間は勤務時間より短く入力してください。");
  });

  it("rejects equal times but accepts an overnight NORMAL shift", () => {
    expect(
      validateShiftForm({
        form: createForm({ startTime: "18:00", endTime: "18:00" }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }),
    ).toEqual({
      errors: { endTime: "開始時刻と終了時刻は同じ時刻にできません。" },
      candidateTimes: null,
    });

    expect(
      validateShiftForm({
        form: createForm({ startTime: "22:00", endTime: "05:00" }),
        selectedWorkplace: generalWorkplace,
        timetableSets: [],
      }),
    ).toEqual({
      errors: {},
      candidateTimes: { startTime: "22:00", endTime: "05:00" },
    });
  });

  it("requires lesson inputs and resolves a contiguous lesson range to candidate times", () => {
    expect(
      validateShiftForm({
        form: createForm({
          shiftType: "LESSON",
          timetableSetId: "",
          startPeriod: "",
          endPeriod: "",
        }),
        selectedWorkplace: cramSchoolWorkplace,
        timetableSets,
      }),
    ).toEqual({
      errors: {
        timetableSetId: "時間割セットを選択してください。",
        startPeriod: "開始コマを選択してください。",
        endPeriod: "終了コマを選択してください。",
      },
      candidateTimes: null,
    });

    expect(
      validateShiftForm({
        form: createForm({
          workplaceId: cramSchoolWorkplace.id,
          shiftType: "LESSON",
          timetableSetId: "set-1",
          startPeriod: "1",
          endPeriod: "3",
        }),
        selectedWorkplace: cramSchoolWorkplace,
        timetableSets,
      }),
    ).toEqual({
      errors: {},
      candidateTimes: { startTime: "16:30", endTime: "19:50" },
    });
  });

  it("rejects reversed and unavailable lesson period ranges", () => {
    const reversed = validateShiftForm({
      form: createForm({
        workplaceId: cramSchoolWorkplace.id,
        shiftType: "LESSON",
        timetableSetId: "set-1",
        startPeriod: "3",
        endPeriod: "1",
      }),
      selectedWorkplace: cramSchoolWorkplace,
      timetableSets,
    });
    const unavailable = validateShiftForm({
      form: createForm({
        workplaceId: cramSchoolWorkplace.id,
        shiftType: "LESSON",
        timetableSetId: "set-1",
        startPeriod: "2",
        endPeriod: "4",
      }),
      selectedWorkplace: cramSchoolWorkplace,
      timetableSets,
    });

    expect(reversed).toEqual({
      errors: { endPeriod: "開始コマは終了コマ以下で指定してください" },
      candidateTimes: null,
    });
    expect(unavailable).toEqual({
      errors: { endPeriod: "選択したコマ範囲の時間割が登録されていません。" },
      candidateTimes: null,
    });
  });
});

describe("shift-form submission helpers", () => {
  it("builds distinct NORMAL and LESSON mutation payload shapes", () => {
    expect(buildShiftPayload(createForm(), generalWorkplace.type)).toEqual({
      workplaceId: "workplace-1",
      date: "2026-03-18",
      shiftType: "NORMAL",
      comment: "",
      breakMinutes: 60,
      startTime: "09:00",
      endTime: "17:00",
    });

    expect(
      buildShiftPayload(
        createForm({
          workplaceId: cramSchoolWorkplace.id,
          shiftType: "LESSON",
          breakMinutes: "30",
          startTime: "09:00",
          endTime: "17:00",
          timetableSetId: "set-1",
          startPeriod: "1",
          endPeriod: "3",
        }),
        cramSchoolWorkplace.type,
      ),
    ).toEqual({
      workplaceId: "workplace-cram",
      date: "2026-03-18",
      shiftType: "LESSON",
      comment: "",
      breakMinutes: 0,
      lessonRange: { timetableSetId: "set-1", startPeriod: 1, endPeriod: 3 },
    });
  });

  it("requires overnight confirmation only for a new or changed overnight range", () => {
    expect(
      shouldRequireOvernightConfirmation({
        mode: "create",
        initialShiftTimes: null,
        candidateTimes: { startTime: "22:00", endTime: "05:00" },
      }),
    ).toBe(true);
    expect(
      shouldRequireOvernightConfirmation({
        mode: "edit",
        initialShiftTimes: { startTime: "22:00", endTime: "05:00" },
        candidateTimes: { startTime: "22:00", endTime: "05:00" },
      }),
    ).toBe(false);
    expect(
      shouldRequireOvernightConfirmation({
        mode: "edit",
        initialShiftTimes: { startTime: "09:00", endTime: "17:00" },
        candidateTimes: { startTime: "22:00", endTime: "05:00" },
      }),
    ).toBe(true);
  });

  it("warns when a candidate overlaps a prior day's overnight shift, but excludes itself on edit", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "shift-1",
            date: "2026-03-18T00:00:00.000Z",
            startTime: "1970-01-01T22:00:00.000Z",
            endTime: "1970-01-01T05:00:00.000Z",
          },
        ],
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const params = {
      form: createForm({ date: "2026-03-19" }),
      candidateTimes: { startTime: "00:30", endTime: "01:00" },
    };

    await expect(
      checkShiftOverlapWarning({ mode: "create", ...params }),
    ).resolves.toBe("この日付にはすでにシフトが登録されています。");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts?workplaceId=workplace-1&startDate=2026-03-18&endDate=2026-03-20",
      { cache: "no-store" },
    );

    await expect(
      checkShiftOverlapWarning({ mode: "edit", shiftId: "shift-1", ...params }),
    ).resolves.toBeNull();
  });
});

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
    transportationAllowance: "0",
    timetableSetId: "",
    startPeriod: "",
    endPeriod: "",
    ...overrides,
  };
}

describe("validateShiftForm", () => {
  it.each([
    ["", undefined],
    ["0", undefined],
    ["480", undefined],
    ["2147483647", undefined],
    ["-1", "交通費は0円以上2,147,483,647円以下の整数で入力してください。"],
    ["100.5", "交通費は0円以上2,147,483,647円以下の整数で入力してください。"],
    [
      "2147483648",
      "交通費は0円以上2,147,483,647円以下の整数で入力してください。",
    ],
  ])(
    "validates transportation allowance %s",
    (transportationAllowance, expected) => {
      expect(
        validateShiftForm({
          form: createForm({ transportationAllowance }),
          selectedWorkplace: generalWorkplace,
          timetableSets: [],
        }).errors.transportationAllowance,
      ).toBe(expected);
    },
  );

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

  it.each([
    ["start", "31", "30"],
    ["end", "30", "31"],
    ["huge end", "1", String(Number.MAX_SAFE_INTEGER)],
  ])(
    "rejects a lesson range with an out-of-range %s period",
    (_description, startPeriod, endPeriod) => {
      const result = validateShiftForm({
        form: createForm({
          workplaceId: cramSchoolWorkplace.id,
          shiftType: "LESSON",
          timetableSetId: "set-1",
          startPeriod,
          endPeriod,
        }),
        selectedWorkplace: cramSchoolWorkplace,
        timetableSets,
      });

      expect(result.errors).toEqual(
        expect.objectContaining({
          ...(Number(startPeriod) > 30
            ? { startPeriod: "コマ番号は30以下の整数で入力してください。" }
            : {}),
          ...(Number(endPeriod) > 30
            ? { endPeriod: "コマ番号は30以下の整数で入力してください。" }
            : {}),
        }),
      );
      expect(result.candidateTimes).toBeNull();
    },
  );

  it("accepts a one-period lesson at period 30", () => {
    const periodThirtySet: TimetableSet = {
      ...timetableSets[0]!,
      items: [
        {
          id: "period-30",
          timetableSetId: "set-1",
          period: 30,
          startTime: "1970-01-01T19:00:00.000Z",
          endTime: "1970-01-01T20:00:00.000Z",
        },
      ],
    };

    expect(
      validateShiftForm({
        form: createForm({
          workplaceId: cramSchoolWorkplace.id,
          shiftType: "LESSON",
          timetableSetId: "set-1",
          startPeriod: "30",
          endPeriod: "30",
        }),
        selectedWorkplace: cramSchoolWorkplace,
        timetableSets: [periodThirtySet],
      }),
    ).toEqual({
      errors: {},
      candidateTimes: { startTime: "19:00", endTime: "20:00" },
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
      transportationAllowance: 0,
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
      transportationAllowance: 0,
      lessonRange: { timetableSetId: "set-1", startPeriod: 1, endPeriod: 3 },
    });
  });

  it("preserves transportation allowance in NORMAL and LESSON payloads", () => {
    expect(
      buildShiftPayload(
        createForm({ transportationAllowance: "480" }),
        generalWorkplace.type,
      ),
    ).toEqual(expect.objectContaining({ transportationAllowance: 480 }));

    expect(
      buildShiftPayload(
        createForm({
          workplaceId: cramSchoolWorkplace.id,
          shiftType: "LESSON",
          transportationAllowance: "360",
          timetableSetId: "set-1",
          startPeriod: "1",
          endPeriod: "1",
        }),
        cramSchoolWorkplace.type,
      ),
    ).toEqual(expect.objectContaining({ transportationAllowance: 360 }));
  });

  it("normalizes a blank allowance to zero and preserves the maximum allowance", () => {
    expect(
      buildShiftPayload(
        createForm({ transportationAllowance: "" }),
        generalWorkplace.type,
      ),
    ).toEqual(expect.objectContaining({ transportationAllowance: 0 }));

    expect(
      buildShiftPayload(
        createForm({
          workplaceId: cramSchoolWorkplace.id,
          shiftType: "LESSON",
          transportationAllowance: "2147483647",
          timetableSetId: "set-1",
          startPeriod: "1",
          endPeriod: "1",
        }),
        cramSchoolWorkplace.type,
      ),
    ).toEqual(
      expect.objectContaining({ transportationAllowance: 2_147_483_647 }),
    );
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

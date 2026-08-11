import {
  getBulkShiftValidationErrorSummary,
  getFirstInvalidFieldId,
  validateAndBuildPayload,
} from "@/components/shifts/bulk-shift-form/validation";
import type {
  BulkShiftRow,
  FormErrors,
} from "@/components/shifts/bulk-shift-form/types";

const generalWorkplaceId = "workplace-general";
const cramSchoolWorkplaceId = "workplace-cram";

function createRow(
  date: string,
  overrides: Partial<BulkShiftRow> = {},
): BulkShiftRow {
  return {
    date,
    shiftType: "NORMAL",
    comment: "",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: "0",
    timetableSetId: "",
    startPeriod: "",
    endPeriod: "",
    ...overrides,
  };
}

function validateRows(params: {
  selectedWorkplaceId?: string;
  selectedWorkplaceType?: "GENERAL" | "CRAM_SCHOOL";
  rows: BulkShiftRow[];
  lessonPeriodsBySetId?: Record<string, number[]>;
}) {
  return validateAndBuildPayload({
    selectedWorkplaceId: params.selectedWorkplaceId ?? generalWorkplaceId,
    selectedWorkplaceType: params.selectedWorkplaceType ?? "GENERAL",
    selectedDateKeys: params.rows.map((row) => row.date),
    rowsByDate: Object.fromEntries(params.rows.map((row) => [row.date, row])),
    lessonPeriodsBySetId: params.lessonPeriodsBySetId ?? {},
  });
}

describe("validateAndBuildPayload", () => {
  it("builds the mutation payload for valid NORMAL and LESSON rows", () => {
    const result = validateRows({
      selectedWorkplaceId: cramSchoolWorkplaceId,
      selectedWorkplaceType: "CRAM_SCHOOL",
      lessonPeriodsBySetId: { "set-1": [1, 2, 3] },
      rows: [
        createRow("2026-03-18", {
          comment: "棚卸し",
          startTime: "09:30",
          endTime: "18:00",
          breakMinutes: "60",
        }),
        createRow("2026-03-19", {
          shiftType: "LESSON",
          comment: "春期講習",
          timetableSetId: "set-1",
          startPeriod: "1",
          endPeriod: "3",
        }),
      ],
    });

    expect(result).toEqual({
      success: true,
      payload: [
        {
          date: "2026-03-18",
          shiftType: "NORMAL",
          comment: "棚卸し",
          startTime: "09:30",
          endTime: "18:00",
          breakMinutes: 60,
        },
        {
          date: "2026-03-19",
          shiftType: "LESSON",
          comment: "春期講習",
          breakMinutes: 0,
          lessonRange: {
            timetableSetId: "set-1",
            startPeriod: 1,
            endPeriod: 3,
          },
        },
      ],
      overnightSummaries: [],
    });
  });

  it("reports only invalid rows when a multi-date submission contains valid rows", () => {
    const result = validateRows({
      rows: [
        createRow("2026-03-18"),
        createRow("2026-03-19", { breakMinutes: "241" }),
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-19": {
            breakMinutes: "休憩時間は0〜240分で入力してください。",
          },
        },
      },
    });
  });

  it("requires a workplace and at least one selected date", () => {
    expect(
      validateAndBuildPayload({
        selectedWorkplaceId: "",
        selectedWorkplaceType: undefined,
        selectedDateKeys: [],
        rowsByDate: {},
        lessonPeriodsBySetId: {},
      }),
    ).toEqual({
      success: false,
      errors: {
        workplaceId: "勤務先を選択してください。",
        selectedDates: "1日以上選択してください。",
      },
    });
  });

  it("rejects selected dates whose input row was not initialized", () => {
    expect(
      validateAndBuildPayload({
        selectedWorkplaceId: generalWorkplaceId,
        selectedWorkplaceType: "GENERAL",
        selectedDateKeys: ["2026-03-18"],
        rowsByDate: {},
        lessonPeriodsBySetId: {},
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            shiftType: "入力行の初期化に失敗しました。",
          },
        },
      },
    });
  });

  it.each([
    ["0", undefined],
    ["240", undefined],
    ["-1", "休憩時間は0〜240分で入力してください。"],
    ["241", "休憩時間は0〜240分で入力してください。"],
    ["30.5", "休憩時間は整数で入力してください。"],
  ])("enforces the break-minute boundary at %s", (breakMinutes, error) => {
    const result = validateRows({
      rows: [createRow("2026-03-18", { breakMinutes })],
    });

    if (error) {
      expect(result).toEqual({
        success: false,
        errors: { rows: { "2026-03-18": { breakMinutes: error } } },
      });
      return;
    }

    expect(result).toMatchObject({ success: true });
  });

  it("rejects malformed times and identical NORMAL times", () => {
    expect(
      validateRows({
        rows: [createRow("2026-03-18", { startTime: "9:00", endTime: "18:0" })],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            startTime: "開始時刻はHH:MM形式で入力してください。",
            endTime: "終了時刻はHH:MM形式で入力してください。",
          },
        },
      },
    });

    expect(
      validateRows({
        rows: [
          createRow("2026-03-18", { startTime: "18:00", endTime: "18:00" }),
        ],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            endTime: "開始時刻と終了時刻は同じ時刻にできません。",
          },
        },
      },
    });
  });

  it("accepts a 100-character comment and rejects longer or multiline comments", () => {
    expect(
      validateRows({
        rows: [createRow("2026-03-18", { comment: "a".repeat(100) })],
      }),
    ).toMatchObject({ success: true });

    expect(
      validateRows({
        rows: [createRow("2026-03-18", { comment: "a".repeat(101) })],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            comment: "コメントは100文字以内で入力してください。",
          },
        },
      },
    });

    expect(
      validateRows({
        rows: [createRow("2026-03-18", { comment: "引継ぎ\nあり" })],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": { comment: "コメントに改行は使用できません。" },
        },
      },
    });
  });

  it("rejects LESSON rows with missing, reversed, or discontinuous periods", () => {
    const lessonPeriodsBySetId = { "set-1": [1, 3] };

    expect(
      validateRows({
        selectedWorkplaceId: cramSchoolWorkplaceId,
        selectedWorkplaceType: "CRAM_SCHOOL",
        lessonPeriodsBySetId,
        rows: [
          createRow("2026-03-18", {
            shiftType: "LESSON",
            timetableSetId: "",
            startPeriod: "",
            endPeriod: "",
          }),
        ],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            timetableSetId: "時間割セットを選択してください。",
            startPeriod: "塾の授業は時間割が登録されていません。",
            endPeriod: "終了コマは1以上の整数で入力してください。",
          },
        },
      },
    });

    expect(
      validateRows({
        selectedWorkplaceId: cramSchoolWorkplaceId,
        selectedWorkplaceType: "CRAM_SCHOOL",
        lessonPeriodsBySetId,
        rows: [
          createRow("2026-03-18", {
            shiftType: "LESSON",
            timetableSetId: "set-1",
            startPeriod: "3",
            endPeriod: "1",
          }),
        ],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            endPeriod: "コマ範囲は開始<=終了で指定してください。",
          },
        },
      },
    });

    expect(
      validateRows({
        selectedWorkplaceId: cramSchoolWorkplaceId,
        selectedWorkplaceType: "CRAM_SCHOOL",
        lessonPeriodsBySetId,
        rows: [
          createRow("2026-03-18", {
            shiftType: "LESSON",
            timetableSetId: "set-1",
            startPeriod: "1",
            endPeriod: "3",
          }),
        ],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            endPeriod: "塾の授業は時間割が登録されていません。",
          },
        },
      },
    });
  });

  it("rejects a LESSON row for a non-cram-school workplace", () => {
    expect(
      validateRows({
        selectedWorkplaceType: "GENERAL",
        lessonPeriodsBySetId: { "set-1": [1] },
        rows: [
          createRow("2026-03-18", {
            shiftType: "LESSON",
            timetableSetId: "set-1",
            startPeriod: "1",
            endPeriod: "1",
          }),
        ],
      }),
    ).toEqual({
      success: false,
      errors: {
        rows: {
          "2026-03-18": {
            shiftType: "授業シフトは塾タイプ勤務先でのみ選択できます。",
          },
        },
      },
    });
  });

  it("returns overnight confirmation summaries with the following calendar date", () => {
    expect(
      validateRows({
        rows: [
          createRow("2026-03-31", { startTime: "22:00", endTime: "05:00" }),
          createRow("2026-04-01", { startTime: "10:00", endTime: "18:00" }),
        ],
      }),
    ).toEqual({
      success: true,
      payload: [
        {
          date: "2026-03-31",
          shiftType: "NORMAL",
          comment: "",
          startTime: "22:00",
          endTime: "05:00",
          breakMinutes: 0,
        },
        {
          date: "2026-04-01",
          shiftType: "NORMAL",
          comment: "",
          startTime: "10:00",
          endTime: "18:00",
          breakMinutes: 0,
        },
      ],
      overnightSummaries: [
        {
          date: "2026-03-31",
          startTime: "22:00",
          endTime: "05:00",
          startDateLabel: "2026年3月31日(火)",
          endDateLabel: "2026年4月1日(水)",
        },
      ],
    });
  });
});

describe("bulk validation error navigation and summary", () => {
  it("prioritizes workplace, then selected dates, then row and field order for the first invalid field", () => {
    const rowErrors: FormErrors = {
      workplaceId: "勤務先を選択してください。",
      selectedDates: "1日以上選択してください。",
      rows: {
        "2026-03-19": { endTime: "終了時刻エラー" },
        "2026-03-18": {
          comment: "コメントエラー",
          startTime: "開始時刻エラー",
        },
      },
    };

    expect(getFirstInvalidFieldId(rowErrors)).toBe("bulk-workplace");
    expect(
      getFirstInvalidFieldId({ ...rowErrors, workplaceId: undefined }),
    ).toBe("bulk-calendar-grid");
    expect(
      getFirstInvalidFieldId({
        ...rowErrors,
        workplaceId: undefined,
        selectedDates: undefined,
      }),
    ).toBe("2026-03-19-end-time");
  });

  it("counts global and row errors and summarizes the first error in display order", () => {
    expect(getBulkShiftValidationErrorSummary({})).toBeNull();

    expect(
      getBulkShiftValidationErrorSummary({
        selectedDates: "1日以上選択してください。",
        rows: {
          "2026-03-19": { endTime: "終了時刻エラー" },
          "2026-03-18": {
            comment: "コメントエラー",
            startTime: "開始時刻エラー",
          },
        },
      }),
    ).toEqual({
      errorCount: 4,
      failedDateKeys: ["2026-03-19", "2026-03-18"],
      firstErrorMessage: "1日以上選択してください。",
    });

    expect(
      getBulkShiftValidationErrorSummary({
        rows: {
          "2026-03-19": { endTime: "終了時刻エラー" },
          "2026-03-18": { comment: "コメントエラー" },
        },
      }),
    ).toEqual({
      errorCount: 2,
      failedDateKeys: ["2026-03-19", "2026-03-18"],
      firstErrorMessage: "2026年3月19日(木)の終了時刻: 終了時刻エラー",
    });
  });
});

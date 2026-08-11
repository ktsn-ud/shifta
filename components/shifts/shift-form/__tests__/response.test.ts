import {
  parseShiftDetailResponse,
  parseShiftListResponse,
  parseShiftMutationResult,
  toTimeOnly,
} from "@/components/shifts/shift-form/response";

const normalShift = {
  id: "shift-1",
  workplaceId: "workplace-1",
  date: "2026-03-18T00:00:00.000Z",
  startTime: "1970-01-01T09:00:00.000Z",
  endTime: "1970-01-01T17:00:00.000Z",
  breakMinutes: 60,
  shiftType: "NORMAL",
  comment: null,
  lessonRange: null,
};

describe("shift-form response parsers", () => {
  it("parses complete shift detail and list responses", () => {
    expect(parseShiftDetailResponse({ data: normalShift })).toEqual(
      normalShift,
    );
    expect(
      parseShiftListResponse({
        data: [
          {
            id: normalShift.id,
            date: normalShift.date,
            startTime: normalShift.startTime,
            endTime: normalShift.endTime,
          },
        ],
      }),
    ).toEqual([
      {
        id: normalShift.id,
        date: normalShift.date,
        startTime: normalShift.startTime,
        endTime: normalShift.endTime,
      },
    ]);
  });

  it("retains a valid lesson range and normalizes a mutation result", () => {
    const lessonShift = {
      ...normalShift,
      shiftType: "LESSON",
      breakMinutes: 0,
      lessonRange: {
        timetableSetId: "set-1",
        startPeriod: 1,
        endPeriod: 3,
      },
    };

    expect(parseShiftDetailResponse({ data: lessonShift })).toEqual(
      lessonShift,
    );
    expect(parseShiftMutationResult({ data: lessonShift }).detail).toEqual(
      lessonShift,
    );
  });

  it("keeps a legacy persisted break value readable", () => {
    const legacyShift = { ...normalShift, breakMinutes: 480 };

    expect(parseShiftDetailResponse({ data: legacyShift })).toEqual(
      legacyShift,
    );
  });

  it.each([
    ["a non-object payload", null],
    ["a missing data property", {}],
    [
      "a list item missing its end time",
      { data: [{ id: "shift-1", date: "2026-03-18", startTime: "09:00" }] },
    ],
  ])("rejects %s for a shift list", (_description, payload) => {
    expect(parseShiftListResponse(payload)).toBeNull();
  });

  it.each([
    ["a fractional break", { ...normalShift, breakMinutes: 0.5 }],
    ["a negative break", { ...normalShift, breakMinutes: -1 }],
    ["an unknown shift type", { ...normalShift, shiftType: "OTHER" }],
    [
      "a lesson range with a non-positive period",
      {
        ...normalShift,
        lessonRange: { timetableSetId: "set-1", startPeriod: 0, endPeriod: 1 },
      },
    ],
  ])("rejects shift detail containing %s", (_description, data) => {
    expect(parseShiftDetailResponse({ data })).toBeNull();
  });

  it("returns only the UTC time portion and rejects invalid timestamps", () => {
    expect(toTimeOnly("1970-01-01T16:30:00.000Z")).toBe("16:30");
    expect(toTimeOnly("not-a-date")).toBe("");
  });
});

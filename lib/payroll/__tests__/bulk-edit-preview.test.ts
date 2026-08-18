import { calculateBulkEditPayrollPreview } from "@/lib/payroll/bulk-edit-preview";
import { MAX_BREAK_MINUTES } from "@/lib/shifts/break-validation";
import { MAX_TRANSPORTATION_ALLOWANCE } from "@/lib/shifts/transportation-allowance";

const workplaces = [
  {
    id: "workplace-a",
    closingDayType: "END_OF_MONTH" as const,
    closingDay: null,
    payday: 25,
  },
  {
    id: "workplace-b",
    closingDayType: "DAY_OF_MONTH" as const,
    closingDay: 15,
    payday: 25,
  },
];

const payrollRules = workplaces.map((workplace) => ({
  workplaceId: workplace.id,
  startDate: "2026-01-01",
  endDate: null,
  baseHourlyWage: 1000,
  holidayAllowanceHourly: 0,
  nightPremiumRate: 0,
  overtimePremiumRate: 0,
  dailyOvertimeThreshold: 8,
  holidayType: "NONE" as const,
}));

const timetableSets = [
  {
    id: "set-b",
    workplaceId: "workplace-b",
    items: [
      {
        timetableSetId: "set-b",
        period: 1,
        startTime: "09:00",
        endTime: "10:00",
      },
      {
        timetableSetId: "set-b",
        period: 2,
        startTime: "10:30",
        endTime: "12:00",
      },
    ],
  },
];

describe("calculateBulkEditPayrollPreview", () => {
  it("NORMAL と LESSON の増減および交通費差分を支給月別に集計する", () => {
    const result = calculateBulkEditPayrollPreview({
      beforeShifts: [
        {
          temporaryId: "normal-increase",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
          transportationAllowance: 400,
        },
        {
          temporaryId: "lesson-decrease",
          workplaceId: "workplace-b",
          date: "2026-06-10",
          shiftType: "LESSON",
          lessonRange: {
            timetableSetId: "set-b",
            startPeriod: 1,
            endPeriod: 2,
          },
          transportationAllowance: 500,
        },
      ],
      afterShifts: [
        {
          temporaryId: "normal-increase",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60,
          transportationAllowance: 600,
        },
        {
          temporaryId: "lesson-decrease",
          workplaceId: "workplace-b",
          date: "2026-06-10",
          shiftType: "LESSON",
          lessonRange: {
            timetableSetId: "set-b",
            startPeriod: 1,
            endPeriod: 1,
          },
          transportationAllowance: 300,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets,
    });

    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-06",
        wage: -1500,
        transportationAllowance: -200,
        totalAmount: -1700,
        changeCount: 1,
      }),
      expect.objectContaining({
        month: "2026-07",
        wage: 1000,
        transportationAllowance: 200,
        totalAmount: 1200,
        changeCount: 1,
      }),
    ]);
    expect(result.differences).toEqual(
      expect.arrayContaining([
        {
          workplaceId: "workplace-a",
          paymentMonth: "2026-07",
          wage: 1000,
          transportationAllowance: 200,
        },
        {
          workplaceId: "workplace-b",
          paymentMonth: "2026-06",
          wage: -1500,
          transportationAllowance: -200,
        },
      ]),
    );
  });

  it("年末勤務を勤務日ではなく翌年の複数支給月へ集計する", () => {
    const result = calculateBulkEditPayrollPreview({
      beforeShifts: [
        {
          temporaryId: "december-shift",
          workplaceId: "workplace-a",
          date: "2026-12-31",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
        },
        {
          temporaryId: "january-shift",
          workplaceId: "workplace-a",
          date: "2027-01-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
        },
      ],
      afterShifts: [
        {
          temporaryId: "december-shift",
          workplaceId: "workplace-a",
          date: "2026-12-31",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "16:00",
          breakMinutes: 60,
        },
        {
          temporaryId: "january-shift",
          workplaceId: "workplace-a",
          date: "2027-01-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets,
    });

    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2027-01",
        wage: -1000,
        totalAmount: -1000,
      }),
      expect.objectContaining({
        month: "2027-02",
        wage: 1000,
        totalAmount: 1000,
      }),
    ]);
  });

  it.each([
    {
      description: "変更後の時刻が未入力",
      before: {
        startTime: "09:00",
        endTime: "17:00",
      },
      after: {
        startTime: "",
        endTime: "17:00",
      },
    },
    {
      description: "変更前の時刻が未入力",
      before: {
        startTime: "",
        endTime: "17:00",
      },
      after: {
        startTime: "09:00",
        endTime: "17:00",
      },
    },
  ])("$descriptionでも片側の額を差分に計上しない", ({ before, after }) => {
    const result = calculateBulkEditPayrollPreview({
      beforeShifts: [
        {
          temporaryId: "unresolved",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          breakMinutes: 60,
          transportationAllowance: 400,
          ...before,
        },
      ],
      afterShifts: [
        {
          temporaryId: "unresolved",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          breakMinutes: 60,
          transportationAllowance: 400,
          ...after,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets,
    });

    expect(result.differences).toEqual([]);
    expect(result.unresolvedCount).toBe(1);
    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-07",
        wage: 0,
        transportationAllowance: 0,
        totalAmount: 0,
        changeCount: 0,
        unresolvedCount: 1,
      }),
    ]);
  });

  it.each([
    ["休憩時間の小数", { breakMinutes: 0.5 }],
    ["休憩時間の負数", { breakMinutes: -1 }],
    ["休憩時間の上限超過", { breakMinutes: MAX_BREAK_MINUTES + 1 }],
    ["休憩時間の NaN", { breakMinutes: Number.NaN }],
    ["交通費の小数", { transportationAllowance: 0.5 }],
    ["交通費の負数", { transportationAllowance: -1 }],
    [
      "交通費の上限超過",
      { transportationAllowance: MAX_TRANSPORTATION_ALLOWANCE + 1 },
    ],
    ["交通費の NaN", { transportationAllowance: Number.NaN }],
  ])("%s は変更後を未計算として差分へ含めない", (_description, patch) => {
    const beforeShift = {
      temporaryId: "invalid-after",
      workplaceId: "workplace-a",
      date: "2026-06-10",
      shiftType: "NORMAL" as const,
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 60,
      transportationAllowance: 400,
    };
    const result = calculateBulkEditPayrollPreview({
      beforeShifts: [beforeShift],
      afterShifts: [{ ...beforeShift, ...patch }],
      workplaces,
      payrollRules,
      timetableSets,
    });

    expect(result.differences).toEqual([]);
    expect(result.unresolvedCount).toBe(1);
    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-07",
        wage: 0,
        transportationAllowance: 0,
        totalAmount: 0,
        unresolvedCount: 1,
      }),
    ]);
  });

  it("休憩時間と交通費の既存上限値は変更後も計算可能にする", () => {
    const beforeShift = {
      temporaryId: "upper-boundary",
      workplaceId: "workplace-a",
      date: "2026-06-10",
      shiftType: "NORMAL" as const,
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: MAX_BREAK_MINUTES - 1,
      transportationAllowance: MAX_TRANSPORTATION_ALLOWANCE - 1,
    };
    const result = calculateBulkEditPayrollPreview({
      beforeShifts: [beforeShift],
      afterShifts: [
        {
          ...beforeShift,
          breakMinutes: MAX_BREAK_MINUTES,
          transportationAllowance: MAX_TRANSPORTATION_ALLOWANCE,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets,
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-07",
        unresolvedCount: 0,
      }),
    ]);
    expect(result.differences).toEqual([
      expect.objectContaining({
        workplaceId: "workplace-a",
        paymentMonth: "2026-07",
        transportationAllowance: 1,
      }),
    ]);
  });

  it.each([
    {
      description: "日中勤務と同値",
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 120,
    },
    {
      description: "日中勤務を超過",
      startTime: "09:00",
      endTime: "11:00",
      breakMinutes: 121,
    },
    {
      description: "日跨ぎ勤務と同値",
      startTime: "22:00",
      endTime: "01:00",
      breakMinutes: 180,
    },
    {
      description: "日跨ぎ勤務を超過",
      startTime: "22:00",
      endTime: "01:00",
      breakMinutes: 181,
    },
  ])(
    "NORMAL の変更後休憩時間が$descriptionなら差分へ含めない",
    ({ startTime, endTime, breakMinutes }) => {
      const beforeShift = {
        temporaryId: "break-too-long-after",
        workplaceId: "workplace-a",
        date: "2026-06-10",
        shiftType: "NORMAL" as const,
        startTime,
        endTime,
        breakMinutes: 0,
      };
      const result = calculateBulkEditPayrollPreview({
        beforeShifts: [beforeShift],
        afterShifts: [{ ...beforeShift, breakMinutes }],
        workplaces,
        payrollRules,
        timetableSets,
      });

      expect(result.differences).toEqual([]);
      expect(result.unresolvedCount).toBe(1);
      expect(result.months).toEqual([
        expect.objectContaining({
          month: "2026-07",
          wage: 0,
          transportationAllowance: 0,
          totalAmount: 0,
          unresolvedCount: 1,
        }),
      ]);
    },
  );
});

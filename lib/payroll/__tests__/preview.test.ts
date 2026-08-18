import { calculateShiftPayrollPreview } from "@/lib/payroll/preview";

describe("calculateShiftPayrollPreview", () => {
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

  const payrollRules = [
    {
      workplaceId: "workplace-a",
      startDate: "2026-01-01",
      endDate: null,
      baseHourlyWage: 1000,
      holidayAllowanceHourly: 0,
      nightPremiumRate: 0,
      overtimePremiumRate: 0,
      dailyOvertimeThreshold: 8,
      holidayType: "NONE" as const,
    },
    {
      workplaceId: "workplace-b",
      startDate: "2026-01-01",
      endDate: null,
      baseHourlyWage: 1200,
      holidayAllowanceHourly: 0,
      nightPremiumRate: 0,
      overtimePremiumRate: 0,
      dailyOvertimeThreshold: 8,
      holidayType: "NONE" as const,
    },
  ];

  it("勤務先ごとの締日・給料日に応じて支給月を判定する", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-a",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
          transportationAllowance: 400,
        },
        {
          temporaryId: "tmp-b",
          workplaceId: "workplace-b",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
          transportationAllowance: 600,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [],
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          temporaryId: "tmp-a",
          paymentMonth: "2026-07",
          status: "ready",
        }),
        expect.objectContaining({
          temporaryId: "tmp-b",
          paymentMonth: "2026-06",
          status: "ready",
        }),
      ]),
    );

    expect(result.months.map((month) => month.month)).toEqual([
      "2026-06",
      "2026-07",
    ]);
    expect(result.months).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          month: "2026-06",
          additionalWage: 8400,
          additionalTransportationAllowance: 600,
          additionalTotalAmount: 9000,
        }),
        expect.objectContaining({
          month: "2026-07",
          additionalWage: 7000,
          additionalTransportationAllowance: 400,
          additionalTotalAmount: 7400,
        }),
      ]),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          temporaryId: "tmp-a",
          wage: 7000,
          transportationAllowance: 400,
        }),
        expect.objectContaining({
          temporaryId: "tmp-b",
          wage: 8400,
          transportationAllowance: 600,
        }),
      ]),
    );
  });

  it("年末勤務の交通費と給与を翌年の支給月へ集計する", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-year-boundary",
          workplaceId: "workplace-a",
          date: "2026-12-31",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
          transportationAllowance: 480,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [],
    });

    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2027-01",
        additionalWage: 7000,
        additionalTransportationAllowance: 480,
        additionalTotalAmount: 7480,
      }),
    ]);
  });

  it("給与ルールが見つからない場合は missing-rule を返す", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-missing-rule",
          workplaceId: "workplace-a",
          date: "2025-12-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
          transportationAllowance: 500,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        temporaryId: "tmp-missing-rule",
        paymentMonth: "2026-01",
        wage: null,
        status: "missing-rule",
      }),
    ]);
  });

  it("一部行が未入力でも有効行だけを集計し、未計算件数を返す", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-ready",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "17:00",
          breakMinutes: 60,
        },
        {
          temporaryId: "tmp-incomplete",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "",
          endTime: "",
          breakMinutes: 60,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [],
    });

    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-07",
        additionalWage: 7000,
        additionalTransportationAllowance: 0,
        additionalTotalAmount: 7000,
        shiftCount: 1,
      }),
    ]);
    expect(result.unresolvedCount).toBe(1);
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
    "NORMAL の休憩時間が$descriptionなら未計算にする",
    ({ startTime, endTime, breakMinutes }) => {
      const result = calculateShiftPayrollPreview({
        shifts: [
          {
            temporaryId: "tmp-break-too-long",
            workplaceId: "workplace-a",
            date: "2026-06-10",
            shiftType: "NORMAL",
            startTime,
            endTime,
            breakMinutes,
          },
        ],
        workplaces,
        payrollRules,
        timetableSets: [],
      });

      expect(result.unresolvedCount).toBe(1);
      expect(result.items).toEqual([
        expect.objectContaining({
          temporaryId: "tmp-break-too-long",
          status: "invalid",
          wage: null,
          message: "休憩時間は勤務時間より短く入力してください。",
        }),
      ]);
    },
  );

  it("日跨ぎNORMAL勤務では総勤務時間の直前の休憩時間を計算できる", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-overnight-break-boundary",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "NORMAL",
          startTime: "22:00",
          endTime: "01:00",
          breakMinutes: 179,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [],
    });

    expect(result.unresolvedCount).toBe(0);
    expect(result.items).toEqual([
      expect.objectContaining({
        temporaryId: "tmp-overnight-break-boundary",
        status: "ready",
        wage: 17,
      }),
    ]);
  });

  it("LESSONで時間割不足なら invalid を返す", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-lesson",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "LESSON",
          lessonRange: {
            timetableSetId: "set-1",
            startPeriod: 1,
            endPeriod: 2,
          },
          transportationAllowance: 360,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [
        {
          id: "set-1",
          workplaceId: "workplace-a",
          items: [
            {
              timetableSetId: "set-1",
              period: 1,
              startTime: "09:00",
              endTime: "10:00",
            },
          ],
        },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        temporaryId: "tmp-lesson",
        status: "invalid",
        message: "塾の時間割が登録されていません",
      }),
    ]);
  });

  it("LESSONは時間割ギャップを休憩時間として自動計算する", () => {
    const result = calculateShiftPayrollPreview({
      shifts: [
        {
          temporaryId: "tmp-lesson-break",
          workplaceId: "workplace-a",
          date: "2026-06-10",
          shiftType: "LESSON",
          lessonRange: {
            timetableSetId: "set-1",
            startPeriod: 1,
            endPeriod: 2,
          },
          transportationAllowance: 360,
        },
      ],
      workplaces,
      payrollRules,
      timetableSets: [
        {
          id: "set-1",
          workplaceId: "workplace-a",
          items: [
            {
              timetableSetId: "set-1",
              period: 1,
              startTime: "09:00",
              endTime: "10:00",
            },
            {
              timetableSetId: "set-1",
              period: 2,
              startTime: "10:30",
              endTime: "12:00",
            },
          ],
        },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        temporaryId: "tmp-lesson-break",
        status: "ready",
        wage: 2500,
        transportationAllowance: 360,
      }),
    ]);
    expect(result.months).toEqual([
      expect.objectContaining({
        month: "2026-07",
        additionalWage: 2500,
        additionalTransportationAllowance: 360,
        additionalTotalAmount: 2860,
      }),
    ]);
  });
});

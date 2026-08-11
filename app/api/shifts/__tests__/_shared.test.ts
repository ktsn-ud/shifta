import { buildShiftData, shiftInputSchema } from "@/app/api/shifts/_shared";

const BREAK_TOO_LONG_MESSAGE = "休憩時間は勤務時間より短く入力してください。";

describe("shift comment input", () => {
  it("コメントをtrimしてshiftDataに含める", async () => {
    const input = shiftInputSchema.parse({
      workplaceId: "workplace-1",
      date: "2026-05-01",
      shiftType: "NORMAL",
      comment: "  研修  ",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 60,
    });

    await expect(buildShiftData(input, "GENERAL")).resolves.toMatchObject({
      shiftData: {
        comment: "研修",
      },
    });
  });

  it("未入力・空白のみのコメントはnullとして扱う", async () => {
    const input = shiftInputSchema.parse({
      workplaceId: "workplace-1",
      date: "2026-05-01",
      shiftType: "NORMAL",
      comment: "   ",
      startTime: "10:00",
      endTime: "18:00",
      breakMinutes: 60,
    });

    await expect(buildShiftData(input, "GENERAL")).resolves.toMatchObject({
      shiftData: {
        comment: null,
      },
    });
  });

  it("コメントは100文字を超えられず、改行も不可", () => {
    expect(
      shiftInputSchema.safeParse({
        workplaceId: "workplace-1",
        date: "2026-05-01",
        shiftType: "NORMAL",
        comment: "a".repeat(101),
        startTime: "10:00",
        endTime: "18:00",
      }).success,
    ).toBe(false);

    expect(
      shiftInputSchema.safeParse({
        workplaceId: "workplace-1",
        date: "2026-05-01",
        shiftType: "NORMAL",
        comment: "研修\n初日",
        startTime: "10:00",
        endTime: "18:00",
      }).success,
    ).toBe(false);
  });
});

describe("shift break input", () => {
  function createNormalInput(breakMinutes: number) {
    return shiftInputSchema.parse({
      workplaceId: "workplace-1",
      date: "2026-05-01",
      shiftType: "NORMAL",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes,
    });
  }

  it.each([0, 240])(
    "accepts breakMinutes=%s within the allowed range",
    async (breakMinutes) => {
      await expect(
        buildShiftData(createNormalInput(breakMinutes), "GENERAL"),
      ).resolves.toMatchObject({
        shiftData: { breakMinutes },
      });
    },
  );

  it.each([-1, 241, 30.5])(
    "rejects invalid breakMinutes=%s at the input schema",
    (breakMinutes) => {
      expect(
        shiftInputSchema.safeParse({
          workplaceId: "workplace-1",
          date: "2026-05-01",
          shiftType: "NORMAL",
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes,
        }).success,
      ).toBe(false);
    },
  );

  it.each([60, 61])(
    "rejects NORMAL breakMinutes=%s when gross duration is 60 minutes",
    async (breakMinutes) => {
      await expect(
        buildShiftData(
          shiftInputSchema.parse({
            workplaceId: "workplace-1",
            date: "2026-05-01",
            shiftType: "NORMAL",
            startTime: "09:00",
            endTime: "10:00",
            breakMinutes,
          }),
          "GENERAL",
        ),
      ).rejects.toThrow(BREAK_TOO_LONG_MESSAGE);
    },
  );

  it("applies the gross-duration check after overnight normalization", async () => {
    const validOvernight = shiftInputSchema.parse({
      workplaceId: "workplace-1",
      date: "2026-05-01",
      shiftType: "NORMAL",
      startTime: "22:00",
      endTime: "01:00",
      breakMinutes: 179,
    });
    const zeroWorkOvernight = shiftInputSchema.parse({
      ...validOvernight,
      breakMinutes: 180,
    });

    await expect(
      buildShiftData(validOvernight, "GENERAL"),
    ).resolves.toMatchObject({
      shiftData: { breakMinutes: 179 },
    });
    await expect(buildShiftData(zeroWorkOvernight, "GENERAL")).rejects.toThrow(
      BREAK_TOO_LONG_MESSAGE,
    );
  });

  it("rejects LESSON ranges whose derived break is out of range or leaves zero work", async () => {
    const input = shiftInputSchema.parse({
      workplaceId: "workplace-1",
      date: "2026-05-01",
      shiftType: "LESSON",
      lessonRange: {
        timetableSetId: "set-1",
        startPeriod: 1,
        endPeriod: 2,
      },
    });

    await expect(
      buildShiftData(input, "CRAM_SCHOOL", {
        lessonTimeRangeResolver: async () => ({
          startTime: new Date("1970-01-01T09:00:00.000Z"),
          endTime: new Date("1970-01-01T13:10:00.000Z"),
          breakMinutes: 241,
        }),
      }),
    ).rejects.toThrow("休憩時間は0〜240分で入力してください。");

    await expect(
      buildShiftData(input, "CRAM_SCHOOL", {
        lessonTimeRangeResolver: async () => ({
          startTime: new Date("1970-01-01T09:00:00.000Z"),
          endTime: new Date("1970-01-01T10:00:00.000Z"),
          breakMinutes: 60,
        }),
      }),
    ).rejects.toThrow(BREAK_TOO_LONG_MESSAGE);
  });
});

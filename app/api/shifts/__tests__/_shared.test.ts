import { buildShiftData, shiftInputSchema } from "@/app/api/shifts/_shared";

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

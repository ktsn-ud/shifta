import { formatShiftWorkplaceLabel } from "@/lib/shifts/format";

describe("formatShiftWorkplaceLabel", () => {
  it("コメントがある場合は勤務先名の後ろに半角スペースと半角括弧で表示する", () => {
    expect(
      formatShiftWorkplaceLabel({
        workplaceName: "塾A",
        workplaceType: "CRAM_SCHOOL",
        shiftType: "NORMAL",
        comment: "事務",
      }),
    ).toBe("塾A (事務)");
  });

  it("コメントがない場合は勤務先名のみを表示し、塾NORMALでも事務を自動付与しない", () => {
    expect(
      formatShiftWorkplaceLabel({
        workplaceName: "塾A",
        workplaceType: "CRAM_SCHOOL",
        shiftType: "NORMAL",
        comment: null,
      }),
    ).toBe("塾A");
  });

  it("空白のみのコメントは表示しない", () => {
    expect(
      formatShiftWorkplaceLabel({
        workplaceName: "コンビニA",
        comment: "   ",
      }),
    ).toBe("コンビニA");
  });
});

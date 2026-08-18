import { render, screen, within } from "@testing-library/react";
import { BulkShiftEditLoadingSkeleton } from "@/components/shifts/BulkShiftEditLoadingSkeleton";

describe("BulkShiftEditLoadingSkeleton", () => {
  it("一括編集画面として読み込み状態と編集テーブルの骨格を表示する", () => {
    render(<BulkShiftEditLoadingSkeleton />);

    expect(
      screen.getByRole("heading", { name: "シフト一括編集" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "シフト一覧" }),
    ).not.toBeInTheDocument();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("シフト一括編集を読み込み中です。");
    expect(status.closest("section")).toHaveAttribute("aria-busy", "true");

    const table = screen.getByRole("table", {
      name: "シフト一括編集の読み込み中",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "日付",
      "勤務先",
      "種別・確定",
      "時間 / 時間割",
      "休憩",
      "交通費",
      "コメント",
    ]);
    expect(within(table).getAllByRole("row", { hidden: true })).toHaveLength(7);
  });
});

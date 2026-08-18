import { render, screen } from "@testing-library/react";

import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

function PeriodSelect({ value }: { value: string | null }) {
  return (
    <Select value={value}>
      <SelectTrigger aria-label="開始コマ">
        <SelectValue placeholder="開始コマ">
          {value ? `${value}限` : undefined}
        </SelectValue>
      </SelectTrigger>
    </Select>
  );
}

describe("SelectValue", () => {
  it("renders the explicit period label instead of the raw controlled value", () => {
    render(<PeriodSelect value="1" />);

    const trigger = screen.getByRole("combobox", { name: "開始コマ" });

    expect(trigger).toHaveTextContent("1限");
    expect(trigger).not.toHaveTextContent(/^1$/);
  });

  it("renders the placeholder when no period is selected", () => {
    render(<PeriodSelect value={null} />);

    expect(
      screen.getByRole("combobox", { name: "開始コマ" }),
    ).toHaveTextContent("開始コマ");
  });
});

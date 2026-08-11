import { render, screen } from "@testing-library/react";
import { ShiftListModal } from "@/components/calendar/ShiftListModal";

describe("ShiftListModal", () => {
  it("UTC日付境界でも対象日をAsia/Tokyoで表示する", () => {
    render(
      <ShiftListModal
        open
        onOpenChange={jest.fn()}
        targetDate={new Date("2026-03-17T15:00:00.000Z")}
        shifts={[]}
        onCreateShift={jest.fn()}
        onEditShift={jest.fn()}
        onDeleteShift={jest.fn()}
        onRetrySync={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "2026年3月18日(水) のシフト" }),
    ).toBeInTheDocument();
  });
});

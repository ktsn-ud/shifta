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

  it("shows transportation allowance in a calendar shift detail", () => {
    render(
      <ShiftListModal
        open
        onOpenChange={jest.fn()}
        targetDate={new Date("2026-03-18T00:00:00.000Z")}
        shifts={[
          {
            id: "shift-1",
            startTime: "1970-01-01T09:00:00.000Z",
            endTime: "1970-01-01T18:00:00.000Z",
            shiftType: "NORMAL",
            comment: null,
            googleSyncStatus: "SUCCESS",
            googleSyncError: null,
            estimatedPay: 8000,
            transportationAllowance: 480,
            workplace: {
              id: "workplace-1",
              name: "勤務先A",
              color: "#3366FF",
            },
          },
        ]}
        onCreateShift={jest.fn()}
        onEditShift={jest.fn()}
        onDeleteShift={jest.fn()}
        onRetrySync={jest.fn()}
      />,
    );

    expect(screen.getByText("交通費 ￥480")).toBeInTheDocument();
  });
});

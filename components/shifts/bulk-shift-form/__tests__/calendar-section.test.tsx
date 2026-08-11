import { render, screen } from "@testing-library/react";
import { BulkShiftCalendarSection } from "@/components/shifts/bulk-shift-form/calendar-section";

function createCalendarCells(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(2026, 2, index + 1);
    return {
      date,
      key: date.toISOString().slice(0, 10),
      isCurrentMonth: true,
    };
  });
}

describe("BulkShiftCalendarSection", () => {
  it("shows the selected-date limit and disables an unselected 32nd day", () => {
    const calendarCells = createCalendarCells(32);
    const selectedDateKeys = calendarCells.slice(0, 31).map((cell) => cell.key);
    const { container } = render(
      <BulkShiftCalendarSection
        calendarOptions={[]}
        selectedCalendarIds={[]}
        googleEventsByDate={{}}
        calendarCells={calendarCells}
        displayMonth={new Date(2026, 2, 1)}
        todayKey="2026-03-01"
        selectedDateKeys={selectedDateKeys}
        errors={{}}
        googleEventsError={null}
        googleEventsWarning={null}
        isInitialGoogleCalendarLoading={false}
        isRefreshingGoogleEvents={false}
        handleRequestedMonthChange={jest.fn()}
        handleResetCalendarSelectionToDefault={jest.fn()}
        handleToggleCalendarSelection={jest.fn()}
        handleToggleDateSelection={jest.fn()}
        handleClearSelectedDates={jest.fn()}
      />,
    );

    const selectedCount = screen.getByText("選択中: 31/31日");
    expect(selectedCount).toHaveAttribute("aria-live", "polite");
    const firstOfMonthButtons = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="1"]',
    );
    expect(firstOfMonthButtons).toHaveLength(2);
    const unavailableDate = firstOfMonthButtons[1]!;
    expect(unavailableDate).toBeDisabled();
    const reasonId = unavailableDate.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent(
      "一括登録は31件までです。",
    );
  });
});

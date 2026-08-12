import { render, screen } from "@testing-library/react";
import { BulkShiftGoogleEventsSummary } from "@/components/shifts/bulk-shift-form/google-events-summary";

describe("BulkShiftGoogleEventsSummary", () => {
  it("renders identical events without a duplicate React key warning", () => {
    const consoleErrorSpy = jest.spyOn(console, "error");

    try {
      render(
        <BulkShiftGoogleEventsSummary
          dateKey="2026-03-20"
          googleEventDay={{
            date: "2026-03-20",
            count: 2,
            items: [
              {
                title: "研究室MTG",
                start: "10:00",
                end: "11:00",
                allDay: false,
                calendarId: "calendar-1",
                calendarSummary: "個人",
                calendarColor: "#3366FF",
              },
              {
                title: "研究室MTG",
                start: "10:00",
                end: "11:00",
                allDay: false,
                calendarId: "calendar-1",
                calendarSummary: "個人",
                calendarColor: "#3366FF",
              },
            ],
          }}
        />,
      );

      expect(screen.getAllByText("10:00-11:00 研究室MTG")).toHaveLength(2);
      expect(
        consoleErrorSpy.mock.calls.some(
          ([message]) =>
            typeof message === "string" &&
            message.includes("Encountered two children with the same key"),
        ),
      ).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

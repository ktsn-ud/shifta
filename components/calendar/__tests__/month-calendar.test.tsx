import { fireEvent, render, screen } from "@testing-library/react";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";

describe("MonthCalendar", () => {
  it("空日の操作ヒントを提供し、クリックで日付を通知する", () => {
    const onDateClick = jest.fn();

    render(
      <MonthCalendar
        month={new Date(2026, 6, 1)}
        shifts={[]}
        todayKey="2026-07-15"
        onDateClick={onDateClick}
        onNavigatePrev={jest.fn()}
        onNavigateNext={jest.fn()}
      />,
    );

    const emptyDay = screen.getByRole("button", {
      name: "2026年7月1日。シフト未登録。クリックして確認または追加",
    });

    expect(emptyDay).toHaveClass("group");
    expect(emptyDay).toHaveTextContent("確認・追加");

    fireEvent.click(emptyDay);

    expect(onDateClick).toHaveBeenCalledWith(new Date(2026, 6, 1));
  });

  it("シフトがある日は詳細確認の操作説明を提供する", () => {
    render(
      <MonthCalendar
        month={new Date(2026, 6, 1)}
        shifts={[
          {
            id: "shift-1",
            date: "2026-07-01",
            startTime: "2026-07-01T09:00:00.000Z",
            endTime: "2026-07-01T18:00:00.000Z",
            shiftType: "NORMAL",
            comment: null,
            workplace: {
              id: "workplace-1",
              name: "勤務先",
              color: "#000000",
              type: "GENERAL",
            },
          },
        ]}
        todayKey="2026-07-15"
        onDateClick={jest.fn()}
        onNavigatePrev={jest.fn()}
        onNavigateNext={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "2026年7月1日。1件のシフト。クリックして詳細を確認",
      }),
    ).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ShiftConfirmPageClient } from "@/components/shifts/shift-confirm-page-client";
import type {
  ConfirmedShiftWorkplaceGroup,
  UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
import { toast } from "sonner";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createUnconfirmedShift(
  overrides: Partial<UnconfirmedShiftItem> = {},
): UnconfirmedShiftItem {
  return {
    id: "shift-1",
    date: "2026年3月5日(木)",
    workplaceName: "コンビニA",
    workplaceColor: "#FF5733",
    comment: null,
    startTime: "10:00",
    endTime: "18:00",
    breakMinutes: 60,
    ...overrides,
  };
}

describe("shift confirm page and card flow", () => {
  beforeEach(() => {
    pushMock.mockReset();
    (toast.success as jest.Mock).mockReset();
    (toast.error as jest.Mock).mockReset();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  it("loads and renders initial unconfirmed/confirmed shifts", () => {
    const initialConfirmedShiftGroups: ConfirmedShiftWorkplaceGroup[] = [
      {
        workplaceId: "workplace-1",
        workplaceName: "コンビニA",
        workplaceColor: "#FF5733",
        shifts: [
          {
            id: "shift-2",
            date: "2026年3月6日(金)",
            comment: null,
            startTime: "09:00",
            endTime: "15:00",
            workDurationHours: 5.5,
            wage: 6500,
          },
        ],
      },
    ];

    render(
      <ShiftConfirmPageClient
        initialUnconfirmedShifts={[createUnconfirmedShift()]}
        initialConfirmedShiftGroups={initialConfirmedShiftGroups}
      />,
    );

    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
    expect(screen.getByText("2026年3月6日(金)")).toBeInTheDocument();
    expect(screen.getByText("09:00 ～ 15:00（実働5.5h）")).toBeInTheDocument();
    expect(screen.getByText(/6,500/)).toBeInTheDocument();
  });

  it("shows empty states when no initial shifts are passed", () => {
    render(
      <ShiftConfirmPageClient
        initialUnconfirmedShifts={[]}
        initialConfirmedShiftGroups={[]}
      />,
    );

    expect(
      screen.getByText("未確定シフトはまだありません"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("今月の確定済みシフトはまだありません"),
    ).toBeInTheDocument();
  });

  it("confirms a shift with edited values", async () => {
    const user = userEvent.setup();
    const onActionCompleted = jest.fn(async () => undefined);
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "shift-1",
        isConfirmed: true,
        date: "2026-03-05",
        startTime: "11:00",
        endTime: "19:00",
        breakMinutes: 30,
        sync: { ok: true, googleEventId: "event-1" },
      }),
    );

    render(
      <ConfirmShiftCard
        shift={createUnconfirmedShift()}
        onActionCompleted={onActionCompleted}
      />,
    );

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "11:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "19:00" },
    });
    fireEvent.change(screen.getByLabelText("休憩時間（分）"), {
      target: { value: "30" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    await waitFor(() => {
      expect(onActionCompleted).toHaveBeenCalled();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/shift-1/confirm",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("シフトを確定しました。");
  });

  it("shows validation error when start time is after end time", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;

    render(<ConfirmShiftCard shift={createUnconfirmedShift()} />);

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(
      screen.getByText("開始時刻は終了時刻より前にしてください。"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

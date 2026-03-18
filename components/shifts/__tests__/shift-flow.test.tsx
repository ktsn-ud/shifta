import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShiftListModal } from "@/components/calendar/ShiftListModal";
import { ShiftForm } from "@/components/shifts/ShiftForm";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/my/calendar",
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("shift flow integration", () => {
  beforeEach(() => {
    pushMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  it("creates a NORMAL shift", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input === "/api/workplaces") {
          return jsonResponse({
            data: [
              {
                id: "workplace-1",
                name: "勤務先A",
                color: "#3366FF",
                type: "GENERAL",
              },
            ],
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse({ data: { id: "shift-1" } }, 201);
        }

        throw new Error(`Unexpected fetch: ${input}`);
      },
    );

    render(<ShiftForm mode="create" initialDate="2026-03-18" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText("開始時刻"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "17:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my/calendar");
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts" &&
        (options as { method?: string } | undefined)?.method === "POST",
    );

    expect(postCall).toBeTruthy();

    const body = JSON.parse(
      ((postCall?.[1] as { body?: string } | undefined)?.body ??
        "{}") as string,
    ) as {
      workplaceId: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
    };

    expect(body).toMatchObject({
      workplaceId: "workplace-1",
      date: "2026-03-18",
      shiftType: "NORMAL",
      startTime: "09:00",
      endTime: "17:00",
    });
  });

  it("edits an existing shift", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input === "/api/workplaces") {
          return jsonResponse({
            data: [
              {
                id: "workplace-1",
                name: "勤務先A",
                color: "#3366FF",
                type: "GENERAL",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && (!init || !init.method)) {
          return jsonResponse({
            data: {
              id: "shift-1",
              workplaceId: "workplace-1",
              date: "2026-03-18T00:00:00.000Z",
              startTime: "1970-01-01T09:00:00.000Z",
              endTime: "1970-01-01T17:00:00.000Z",
              breakMinutes: 45,
              shiftType: "NORMAL",
              lessonRange: null,
            },
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({
            data: [
              {
                id: "shift-1",
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T17:00:00.000Z",
              },
            ],
          });
        }

        if (input === "/api/shifts/shift-1" && init?.method === "PUT") {
          return jsonResponse({ data: { id: "shift-1" } });
        }

        throw new Error(`Unexpected fetch: ${input}`);
      },
    );

    render(<ShiftForm mode="edit" shiftId="shift-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("開始時刻")).toHaveValue("09:00");
    });

    fireEvent.change(screen.getByLabelText("終了時刻"), {
      target: { value: "18:00" },
    });

    await userEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my/calendar");
    });

    const putCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/shifts/shift-1" &&
        (options as { method?: string } | undefined)?.method === "PUT",
    );

    expect(putCall).toBeTruthy();

    const body = JSON.parse(
      ((putCall?.[1] as { body?: string } | undefined)?.body ?? "{}") as string,
    ) as {
      shiftType: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
    };

    expect(body).toMatchObject({
      shiftType: "NORMAL",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 45,
    });
  });

  it("deletes a shift from shift list modal", async () => {
    const onDeleteShift = jest.fn(async () => undefined);

    render(
      <ShiftListModal
        open
        onOpenChange={jest.fn()}
        targetDate={new Date("2026-03-18T00:00:00.000Z")}
        shifts={[
          {
            id: "shift-1",
            startTime: "1970-01-01T09:00:00.000Z",
            endTime: "1970-01-01T17:00:00.000Z",
            shiftType: "NORMAL",
            estimatedPay: 8000,
            googleSyncStatus: "SUCCESS",
            googleSyncError: null,
            workplace: {
              id: "workplace-1",
              name: "勤務先A",
              color: "#3366FF",
            },
          },
        ]}
        onCreateShift={jest.fn()}
        onEditShift={jest.fn()}
        onDeleteShift={onDeleteShift}
        onRetrySync={jest.fn()}
      />,
    );

    const openDeleteButton = screen.getByRole("button", { name: "削除" });
    await userEvent.click(openDeleteButton);

    const dialog = await screen.findByRole("dialog");
    const confirmDeleteButton = within(dialog).getByRole("button", {
      name: "削除",
    });

    await userEvent.click(confirmDeleteButton);

    await waitFor(() => {
      expect(onDeleteShift).toHaveBeenCalledWith("shift-1");
    });
  });
});

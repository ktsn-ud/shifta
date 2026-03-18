import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShiftListModal } from "@/components/calendar/ShiftListModal";
import { ShiftForm } from "@/components/shifts/ShiftForm";
import { WorkplaceForm } from "@/components/workplaces/workplace-form";

const pushMock = jest.fn();
const refreshMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  usePathname: () => "/my/calendar",
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("major flow integration", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-15T09:00:00.000Z"));
    pushMock.mockReset();
    refreshMock.mockReset();

    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a workplace with initial payroll rule", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === "/api/workplaces" && init?.method === "POST") {
        return jsonResponse(
          {
            data: {
              id: "workplace-1",
              type: "GENERAL",
            },
          },
          201,
        );
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    render(<WorkplaceForm mode="create" />);

    fireEvent.change(screen.getByLabelText("勤務先名"), {
      target: { value: "店舗A" },
    });

    await user.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/my/workplaces");
    });

    const postCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/workplaces" &&
        (options as RequestInit | undefined)?.method === "POST",
    );

    expect(postCall).toBeTruthy();

    const body = JSON.parse(
      ((postCall?.[1] as { body?: string } | undefined)?.body ??
        "{}") as string,
    ) as {
      name: string;
      type: string;
      initialPayrollRule?: {
        startDate: string;
      };
    };

    expect(body.name).toBe("店舗A");
    expect(body.type).toBe("GENERAL");
    expect(body.initialPayrollRule?.startDate).toBe("2026-03-15");
  });

  it("creates a LESSON shift", async () => {
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(
      async (input: string, init?: { method?: string }) => {
        if (input === "/api/workplaces") {
          return jsonResponse({
            data: [
              {
                id: "workplace-1",
                name: "英語塾A",
                color: "#3366FF",
                type: "CRAM_SCHOOL",
              },
            ],
          });
        }

        if (input === "/api/workplaces/workplace-1/timetables") {
          return jsonResponse({
            data: [
              {
                id: "tt-1",
                workplaceId: "workplace-1",
                type: "NORMAL",
                period: 1,
                startTime: "1970-01-01T16:30:00.000Z",
                endTime: "1970-01-01T17:30:00.000Z",
              },
              {
                id: "tt-2",
                workplaceId: "workplace-1",
                type: "NORMAL",
                period: 2,
                startTime: "1970-01-01T17:40:00.000Z",
                endTime: "1970-01-01T18:40:00.000Z",
              },
            ],
          });
        }

        if (input.startsWith("/api/shifts?")) {
          return jsonResponse({ data: [] });
        }

        if (input === "/api/shifts" && init?.method === "POST") {
          return jsonResponse({ data: { id: "shift-lesson-1" } }, 201);
        }

        throw new Error(`Unexpected fetch: ${input}`);
      },
    );

    render(<ShiftForm mode="create" initialDate="2026-03-20" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "登録" })).toBeEnabled();
    });

    const lessonRadioInput = document.getElementById("shift-type-lesson");
    if (!lessonRadioInput) {
      throw new Error("LESSON radio input not found");
    }
    fireEvent.click(lessonRadioInput);

    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(3);
    });

    await user.click(screen.getByRole("button", { name: "登録" }));

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
      shiftType: string;
      lessonRange?: {
        lessonType: string;
        startPeriod: number;
        endPeriod: number;
      };
    };

    expect(body.shiftType).toBe("LESSON");
    expect(body.lessonRange).toEqual(
      expect.objectContaining({
        lessonType: "NORMAL",
      }),
    );
    expect(body.lessonRange?.startPeriod).toEqual(expect.any(Number));
    expect(body.lessonRange?.endPeriod).toEqual(expect.any(Number));
  });

  it("retries failed google sync from shift list modal", async () => {
    const onRetrySync = jest.fn(async () => undefined);

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
            googleSyncStatus: "FAILED",
            googleSyncError: "Insufficient permissions",
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
        onRetrySync={onRetrySync}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "再試行" }));

    await waitFor(() => {
      expect(onRetrySync).toHaveBeenCalledWith("shift-1");
    });
  });
});

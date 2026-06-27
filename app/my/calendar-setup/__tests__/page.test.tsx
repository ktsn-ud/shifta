import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarSetupPage from "@/app/my/calendar-setup/page";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

const replaceMock = jest.fn();
const successMock = jest.fn();
const warningMock = jest.fn();
const errorMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => successMock(...args),
    warning: (...args: unknown[]) => warningMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

jest.mock("@/lib/user-facing-error", () => ({
  resolveUserFacingErrorFromResponse: jest.fn(),
}));

describe("app/my/calendar-setup/page", () => {
  const resolveUserFacingErrorFromResponseMock = jest.mocked(
    resolveUserFacingErrorFromResponse,
  );
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock;
  });

  it("初期化成功時に /my へ遷移する", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<CalendarSetupPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Google Calendar で設定する" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/calendar/initialize", {
        method: "POST",
      });
    });
    expect(successMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/my");
  });

  it("409 のときも /my へ戻す", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
    } as Response);

    render(<CalendarSetupPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Google Calendar で設定する" }),
    );

    await waitFor(() => {
      expect(warningMock).toHaveBeenCalled();
    });
    expect(replaceMock).toHaveBeenCalledWith("/my");
  });

  it("失敗時は解決済みメッセージを表示する", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    resolveUserFacingErrorFromResponseMock.mockResolvedValue({
      message: "設定に失敗しました。時間をおいて再実行してください。",
      kind: "server",
      code: null,
      status: 500,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    render(<CalendarSetupPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Google Calendar で設定する" }),
    );

    expect(
      await screen.findByText(
        "設定に失敗しました。時間をおいて再実行してください。",
      ),
    ).toBeInTheDocument();
    expect(errorMock).toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

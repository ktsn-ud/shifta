import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  GOOGLE_TOKEN_EXPIRED_SIGNOUT_DELAY_MS,
  useGoogleTokenExpiredSignOut,
} from "@/hooks/use-google-token-expired-signout";
import { GOOGLE_TOKEN_EXPIRED_LOGIN_PATH } from "@/lib/google-calendar/constants";

const signOutMock = jest.fn().mockResolvedValue(undefined);

jest.mock("next-auth/react", () => ({
  signOut: signOutMock,
}));

function Harness(props: { onScheduled: (scheduled: boolean) => void }) {
  const { isSignOutScheduled, scheduleSignOut } =
    useGoogleTokenExpiredSignOut();

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          props.onScheduled(scheduleSignOut());
        }}
      >
        schedule
      </button>
      <span>{isSignOutScheduled ? "scheduled" : "idle"}</span>
    </div>
  );
}

describe("useGoogleTokenExpiredSignOut", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("3秒後に一度だけログアウトを実行する", async () => {
    const onScheduled = jest.fn();
    render(<Harness onScheduled={onScheduled} />);

    fireEvent.click(screen.getByRole("button", { name: "schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "schedule" }));

    expect(onScheduled).toHaveBeenNthCalledWith(1, true);
    expect(onScheduled).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByText("scheduled")).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(GOOGLE_TOKEN_EXPIRED_SIGNOUT_DELAY_MS);
    });

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
    expect(signOutMock).toHaveBeenCalledWith({
      redirectTo: GOOGLE_TOKEN_EXPIRED_LOGIN_PATH,
    });
  });
});

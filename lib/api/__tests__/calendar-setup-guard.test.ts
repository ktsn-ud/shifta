import { redirect } from "next/navigation";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

describe("redirectToCalendarSetupIfNeeded", () => {
  const redirectMock = jest.mocked(redirect);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("calendarId が未設定なら calendar-setup へ redirect する", async () => {
    await redirectToCalendarSetupIfNeeded({
      calendarId: null,
    });

    expect(redirectMock).toHaveBeenCalledWith("/my/calendar-setup");
  });

  it("calendarId が設定済みなら redirect しない", async () => {
    await redirectToCalendarSetupIfNeeded({
      calendarId: "calendar-1",
    });

    expect(redirectMock).not.toHaveBeenCalled();
  });
});

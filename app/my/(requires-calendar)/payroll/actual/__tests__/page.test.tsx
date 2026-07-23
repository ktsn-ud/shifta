import { Suspense, type ReactElement } from "react";
import Page from "@/app/my/(requires-calendar)/payroll/actual/page";
import { ActualPayrollPageClient } from "@/components/payroll/actual-payroll-page-client";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getActualPayrollEditorForUser } from "@/lib/payroll/actual-editor";

jest.mock("@/lib/api/current-user", () => ({ requireCurrentUser: jest.fn() }));
jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));
jest.mock("@/lib/payroll/actual-editor", () => ({
  getActualPayrollEditorForUser: jest.fn(),
}));
jest.mock("@/components/payroll/actual-payroll-page-client", () => ({
  ActualPayrollPageClient: jest.fn(() => <div />),
  ActualPayrollPageLoadingSkeleton: jest.fn(() => <div />),
}));

type ContentElement = ReactElement<
  { month: string },
  (props: { month: string }) => Promise<ReactElement>
>;

describe("app/my/(requires-calendar)/payroll/actual/page", () => {
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const calendarSetupGuardMock = jest.mocked(redirectToCalendarSetupIfNeeded);
  const actualPayrollMock = jest.mocked(getActualPayrollEditorForUser);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("URL の有効な month を実績給与の初期月と再マウントキーへ渡す", async () => {
    const initialData = { month: "2027-01", rows: [] };
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1", calendarId: "calendar-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    actualPayrollMock.mockResolvedValue(initialData);

    const result = await Page({
      searchParams: Promise.resolve({ month: "2027-01" }),
    });
    expect(result.type).toBe(Suspense);
    const content = result.props.children as ContentElement;
    const element = await content.type(content.props);

    expect(calendarSetupGuardMock).toHaveBeenCalledWith({
      id: "user-1",
      calendarId: "calendar-1",
    });
    expect(element.type).toBe(ActualPayrollPageClient);
    expect(element.key).toBe("2027-01");
    expect(element.props).toEqual(
      expect.objectContaining({
        currentUserId: "user-1",
        initialMonth: "2027-01",
        currentMonthValue: "2026-07",
        initialData,
      }),
    );
  });
});

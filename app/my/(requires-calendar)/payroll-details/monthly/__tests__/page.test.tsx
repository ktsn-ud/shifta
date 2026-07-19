import { Suspense, type ReactElement } from "react";
import Page from "@/app/my/(requires-calendar)/payroll-details/monthly/page";
import { PayrollDetailsMonthlyPageClient } from "@/components/payroll-details/payroll-details-monthly-page-client";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollDetailsMonthlyForUser } from "@/lib/payroll/details";

jest.mock("@/lib/api/current-user", () => ({ requireCurrentUser: jest.fn() }));
jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));
jest.mock("@/lib/payroll/details", () => ({
  getPayrollDetailsMonthlyForUser: jest.fn(),
}));
jest.mock(
  "@/components/payroll-details/payroll-details-monthly-page-client",
  () => ({
    PayrollDetailsMonthlyPageClient: jest.fn(() => <div />),
    PayrollDetailsMonthlyPageLoadingSkeleton: jest.fn(() => <div />),
  }),
);

type ContentElement = ReactElement<
  { month: string },
  (props: { month: string }) => Promise<ReactElement>
>;

describe("app/my/(requires-calendar)/payroll-details/monthly/page", () => {
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const calendarSetupGuardMock = jest.mocked(redirectToCalendarSetupIfNeeded);
  const detailsMock = jest.mocked(getPayrollDetailsMonthlyForUser);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("URL の有効な month を月次詳細の初期月と再マウントキーへ渡す", async () => {
    const initialDetails = { month: "2027-01" } as Awaited<
      ReturnType<typeof getPayrollDetailsMonthlyForUser>
    >;
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1", calendarId: "calendar-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    detailsMock.mockResolvedValue(initialDetails);

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
    expect(element.type).toBe(PayrollDetailsMonthlyPageClient);
    expect(element.key).toBe("2027-01");
    expect(element.props).toEqual(
      expect.objectContaining({
        currentUserId: "user-1",
        initialMonth: "2027-01",
        currentMonthValue: "2026-07",
        initialDetails,
      }),
    );
  });
});

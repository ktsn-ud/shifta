import { Suspense, type ReactElement } from "react";
import Page from "@/app/my/(requires-calendar)/page";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { getPayrollSummaryAmountForUser } from "@/lib/payroll/summary";
import { getMonthShifts } from "@/lib/shifts/month-shifts";
import { getUnconfirmedShiftCount } from "@/lib/shifts/unconfirmed-count";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));

jest.mock("@/lib/shifts/month-shifts", () => ({
  getMonthShifts: jest.fn(),
}));

jest.mock("@/lib/shifts/unconfirmed-count", () => ({
  getUnconfirmedShiftCount: jest.fn(),
}));

jest.mock("@/lib/payroll/summary", () => ({
  getPayrollSummaryAmountForUser: jest.fn(),
}));

jest.mock("@/components/dashboard/dashboard-page-client", () => ({
  DashboardPageClient: jest.fn(() => (
    <div data-testid="dashboard-page-client" />
  )),
  DashboardPageLoadingSkeleton: jest.fn(() => (
    <div data-testid="dashboard-page-loading-skeleton" />
  )),
}));

type DashboardPageContentElement = ReactElement<
  {
    searchParams?:
      { month?: string | string[] } | Promise<{ month?: string | string[] }>;
  },
  (props: {
    searchParams?:
      { month?: string | string[] } | Promise<{ month?: string | string[] }>;
  }) => Promise<ReactElement>
>;

describe("app/my/(requires-calendar)/page", () => {
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const redirectToCalendarSetupIfNeededMock = jest.mocked(
    redirectToCalendarSetupIfNeeded,
  );
  const getMonthShiftsMock = jest.mocked(getMonthShifts);
  const getPayrollSummaryAmountForUserMock = jest.mocked(
    getPayrollSummaryAmountForUser,
  );
  const getUnconfirmedShiftCountMock = jest.mocked(getUnconfirmedShiftCount);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("初期表示の SSR で翌月支給額を取得し client component に初期値として渡す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        calendarId: "calendar-1",
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getMonthShiftsMock.mockResolvedValue(
      [] as Awaited<ReturnType<typeof getMonthShifts>>,
    );
    getUnconfirmedShiftCountMock.mockResolvedValue(2);
    getPayrollSummaryAmountForUserMock.mockResolvedValue({
      month: "2026-08",
      totalWage: 123456,
    });

    const result = await Page({
      searchParams: Promise.resolve({}),
    });

    expect(result.type).toBe(Suspense);

    const contentElement = result.props.children as DashboardPageContentElement;
    const dashboardElement = await contentElement.type(contentElement.props);

    expect(getMonthShiftsMock).toHaveBeenCalledWith({
      userId: "user-1",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      includeEstimate: true,
    });
    expect(redirectToCalendarSetupIfNeededMock).toHaveBeenCalledWith({
      id: "user-1",
      calendarId: "calendar-1",
    });
    expect(getUnconfirmedShiftCountMock).toHaveBeenCalledWith("user-1");
    expect(getPayrollSummaryAmountForUserMock).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-08-01T00:00:00.000Z"),
    );
    expect(dashboardElement.type).toBe(DashboardPageClient);
    expect(dashboardElement.props).toEqual(
      expect.objectContaining({
        currentUserId: "user-1",
        initialMonthShifts: [],
        initialMonthStartDate: "2026-07-01",
        initialMonthEndDate: "2026-07-31",
        initialUnconfirmedShiftCount: 2,
        initialUnconfirmedShiftCountVersion:
          '{"todayDate":"2026-07-15","initialUnconfirmedShiftCount":2}',
        initialNextPaymentAmount: {
          month: "2026-08",
          totalWage: 123456,
        },
        todayDate: "2026-07-15",
      }),
    );
  });

  it("表示月が 12 月でも翌月支給額は翌年 1 月で取得する", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        calendarId: "calendar-1",
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getMonthShiftsMock.mockResolvedValue(
      [] as Awaited<ReturnType<typeof getMonthShifts>>,
    );
    getUnconfirmedShiftCountMock.mockResolvedValue(0);
    getPayrollSummaryAmountForUserMock.mockResolvedValue({
      month: "2027-01",
      totalWage: 654321,
    });

    const result = await Page({
      searchParams: Promise.resolve({ month: "2026-12" }),
    });

    expect(result.type).toBe(Suspense);

    const contentElement = result.props.children as DashboardPageContentElement;
    await contentElement.type(contentElement.props);

    expect(getPayrollSummaryAmountForUserMock).toHaveBeenCalledWith(
      "user-1",
      new Date("2027-01-01T00:00:00.000Z"),
    );
  });

  it("calendarId が未設定なら calendar setup guard を通す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        calendarId: null,
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    redirectToCalendarSetupIfNeededMock.mockImplementation(async () => {});
    getMonthShiftsMock.mockResolvedValue(
      [] as Awaited<ReturnType<typeof getMonthShifts>>,
    );
    getUnconfirmedShiftCountMock.mockResolvedValue(0);
    getPayrollSummaryAmountForUserMock.mockResolvedValue({
      month: "2026-08",
      totalWage: 0,
    });

    const result = await Page({
      searchParams: Promise.resolve({}),
    });

    const contentElement = result.props.children as DashboardPageContentElement;
    await contentElement.type(contentElement.props);

    expect(redirectToCalendarSetupIfNeededMock).toHaveBeenCalledWith({
      id: "user-1",
      calendarId: null,
    });
  });
});

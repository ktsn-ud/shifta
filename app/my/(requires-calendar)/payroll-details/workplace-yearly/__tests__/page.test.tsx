import { Suspense, type ReactElement } from "react";
import Page from "@/app/my/(requires-calendar)/payroll-details/workplace-yearly/page";
import { PayrollDetailsWorkplaceYearlyPageClient } from "@/components/payroll-details/payroll-details-workplace-yearly-page-client";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollDetailsWorkplaceYearlyForUser } from "@/lib/payroll/details";

jest.mock("@/lib/api/current-user", () => ({ requireCurrentUser: jest.fn() }));
jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));
jest.mock("@/lib/payroll/details", () => ({
  getPayrollDetailsWorkplaceYearlyForUser: jest.fn(),
}));
jest.mock(
  "@/components/payroll-details/payroll-details-workplace-yearly-page-client",
  () => ({
    PayrollDetailsWorkplaceYearlyPageClient: jest.fn(() => <div />),
    PayrollDetailsWorkplaceYearlyPageLoadingSkeleton: jest.fn(() => <div />),
  }),
);

type ContentElement = ReactElement<
  {
    searchParams?:
      { year?: string | string[] } | Promise<{ year?: string | string[] }>;
  },
  (props: {
    searchParams?:
      { year?: string | string[] } | Promise<{ year?: string | string[] }>;
  }) => Promise<ReactElement>
>;

describe("app/my/(requires-calendar)/payroll-details/workplace-yearly/page", () => {
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const calendarSetupGuardMock = jest.mocked(redirectToCalendarSetupIfNeeded);
  const detailsMock = jest.mocked(getPayrollDetailsWorkplaceYearlyForUser);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("URL の有効な year を勤務先別年次詳細の初期年と再マウントキーへ渡す", async () => {
    const initialDetails = { year: 2027, shiftCount: 0, workplaces: [] };
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1", calendarId: "calendar-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    detailsMock.mockResolvedValue(initialDetails);

    const result = await Page({
      searchParams: Promise.resolve({ year: "2027" }),
    });
    expect(result.type).toBe(Suspense);
    const content = result.props.children as ContentElement;
    const element = await content.type(content.props);

    expect(calendarSetupGuardMock).toHaveBeenCalledWith({
      id: "user-1",
      calendarId: "calendar-1",
    });
    expect(element.type).toBe(PayrollDetailsWorkplaceYearlyPageClient);
    expect(element.key).toBe("2027");
    expect(element.props).toEqual(
      expect.objectContaining({
        currentUserId: "user-1",
        initialYear: 2027,
        currentMonthValue: "2026-07",
        currentYearValue: "2026",
        initialDetails,
      }),
    );
  });
});

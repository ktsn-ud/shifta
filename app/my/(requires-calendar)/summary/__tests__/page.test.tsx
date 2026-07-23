import { Suspense, type ReactElement } from "react";
import { redirect } from "next/navigation";
import Page from "@/app/my/(requires-calendar)/summary/page";
import { SummaryPageClient } from "@/components/summary/summary-page-client";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/api/calendar-setup-guard", () => ({
  redirectToCalendarSetupIfNeeded: jest.fn(),
}));

jest.mock("@/lib/payroll/summary", () => ({
  getPayrollSummaryForUser: jest.fn(),
}));

jest.mock("@/components/summary/summary-page-client", () => ({
  SummaryPageClient: jest.fn(() => <div data-testid="summary-page-client" />),
  SummaryPageLoadingSkeleton: jest.fn(() => (
    <div data-testid="summary-page-loading-skeleton" />
  )),
}));

type SummaryPageContentElement = ReactElement<
  { year: number },
  (props: { year: number }) => Promise<ReactElement>
>;

function createSummary(year: number) {
  return {
    year,
    workplaces: [],
    months: [],
    yearlyTotals: {
      byWorkplace: [],
      grandTotals: {
        taxableAmount: 0,
        nonTaxableAmount: 0,
        totalAmount: 0,
        totalWorkHours: 0,
      },
    },
  };
}

describe("app/my/(requires-calendar)/summary/page", () => {
  const redirectMock = jest.mocked(redirect);
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const redirectToCalendarSetupIfNeededMock = jest.mocked(
    redirectToCalendarSetupIfNeeded,
  );
  const getPayrollSummaryForUserMock = jest.mocked(getPayrollSummaryForUser);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("searchParams.year の有効値を SSR 初期年として使う", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
        calendarId: "calendar-1",
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getPayrollSummaryForUserMock.mockResolvedValue(createSummary(2025));

    const result = await Page({
      searchParams: Promise.resolve({ year: "2025" }),
    });

    expect(result.type).toBe(Suspense);

    const contentElement = result.props.children as SummaryPageContentElement;
    const summaryElement = await contentElement.type(contentElement.props);

    expect(redirectToCalendarSetupIfNeededMock).toHaveBeenCalledWith({
      id: "user-1",
      calendarId: "calendar-1",
    });
    expect(getPayrollSummaryForUserMock).toHaveBeenCalledWith("user-1", 2025);
    expect(summaryElement.type).toBe(SummaryPageClient);
    expect(summaryElement.key).toBe("2025");
    expect(summaryElement.props).toEqual(
      expect.objectContaining({
        currentUserId: "user-1",
        initialYear: 2025,
        currentYearValue: "2026",
        initialSummary: createSummary(2025),
      }),
    );
  });

  it("不正な searchParams.year は当年へフォールバックする", async () => {
    await Page({
      searchParams: Promise.resolve({ year: "1999" }),
    });

    expect(redirectMock).toHaveBeenCalledWith("/my/summary?year=2026");
    expect(getPayrollSummaryForUserMock).not.toHaveBeenCalled();
  });
});

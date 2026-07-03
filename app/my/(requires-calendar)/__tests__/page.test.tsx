import { Suspense, type ReactElement } from "react";
import Page from "@/app/my/(requires-calendar)/page";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollSummaryAmountForUser } from "@/lib/payroll/summary";
import { prisma } from "@/lib/prisma";
import { getMonthShifts } from "@/lib/shifts/month-shifts";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/shifts/month-shifts", () => ({
  getMonthShifts: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      count: jest.fn(),
    },
  },
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
  { month: Date },
  (props: { month: Date }) => Promise<ReactElement>
>;

describe("app/my/(requires-calendar)/page", () => {
  const requireCurrentUserMock = jest.mocked(requireCurrentUser);
  const getMonthShiftsMock = jest.mocked(getMonthShifts);
  const getPayrollSummaryAmountForUserMock = jest.mocked(
    getPayrollSummaryAmountForUser,
  );
  const shiftCountMock = jest.mocked(prisma.shift.count);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("初期表示の SSR では給与集計を呼ばず null の初期支給額を client component に渡す", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: {
        id: "user-1",
      },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    getMonthShiftsMock.mockResolvedValue(
      [] as Awaited<ReturnType<typeof getMonthShifts>>,
    );
    shiftCountMock.mockResolvedValue(2);

    const result = await Page({
      searchParams: Promise.resolve({}),
    });

    expect(result.type).toBe(Suspense);

    const contentElement = result.props.children as DashboardPageContentElement;
    const dashboardElement = await contentElement.type(contentElement.props);

    expect(getPayrollSummaryAmountForUserMock).not.toHaveBeenCalled();
    expect(getMonthShiftsMock).toHaveBeenCalledWith({
      userId: "user-1",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      includeEstimate: true,
    });
    expect(shiftCountMock).toHaveBeenCalledWith({
      where: {
        workplace: {
          userId: "user-1",
        },
        date: {
          lte: new Date("2026-07-15T00:00:00.000Z"),
        },
        isConfirmed: false,
      },
    });
    expect(dashboardElement.type).toBe(DashboardPageClient);
    expect(dashboardElement.props).toEqual(
      expect.objectContaining({
        currentUserId: "user-1",
        initialMonthShifts: [],
        initialMonthStartDate: "2026-07-01",
        initialMonthEndDate: "2026-07-31",
        initialUnconfirmedShiftCount: 2,
        initialNextPaymentAmount: null,
        todayDate: "2026-07-15",
      }),
    );
  });
});

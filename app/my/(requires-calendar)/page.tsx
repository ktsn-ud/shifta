import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  DashboardPageClient,
  DashboardPageLoadingSkeleton,
} from "@/components/dashboard/dashboard-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import {
  addMonths,
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
  toDateOnlyString,
} from "@/lib/calendar/date";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getPayrollSummaryAmountForUser } from "@/lib/payroll/summary";
import { getMonthShifts } from "@/lib/shifts/month-shifts";
import { getUnconfirmedShiftCount } from "@/lib/shifts/unconfirmed-count";

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function DashboardPageFallback() {
  return <DashboardPageLoadingSkeleton />;
}

function resolveInitialMonth(monthParam: string | string[] | undefined): Date {
  if (typeof monthParam !== "string") {
    return startOfMonth(new Date());
  }

  const parsedMonth = fromMonthInputValue(monthParam);
  return startOfMonth(parsedMonth ?? new Date());
}

async function DashboardPageContent({ month }: { month: Date }) {
  const timing = createRequestTiming("GET /my");
  try {
    const current = await timing.measure("requireCurrentUser", () =>
      requireCurrentUser(),
    );
    if ("response" in current) {
      redirect("/login");
    }

    const startDate = toDateOnlyString(startOfMonth(month));
    const endDate = toDateOnlyString(endOfMonth(month));
    const nextPaymentMonth = toMonthInputValue(
      addMonths(startOfMonth(month), 1),
    );
    const [
      initialMonthShifts,
      initialUnconfirmedShiftCount,
      initialNextPaymentAmount,
    ] = await Promise.all([
      timing.measure("getMonthShifts", () =>
        getMonthShifts({
          userId: current.user.id,
          startDate,
          endDate,
          includeEstimate: true,
        }),
      ),
      timing.measure("getUnconfirmedShiftCount", () =>
        getUnconfirmedShiftCount(current.user.id),
      ),
      timing.measure("getPayrollSummaryAmountForUser", () =>
        getPayrollSummaryAmountForUser(
          current.user.id,
          parseDateOnly(`${nextPaymentMonth}-01`),
        ),
      ),
    ]);
    const todayDate = toDateOnlyString(startOfUtcDay(new Date()));

    return (
      <DashboardPageClient
        key={startDate}
        currentUserId={current.user.id}
        initialMonthShifts={initialMonthShifts}
        initialMonthStartDate={startDate}
        initialMonthEndDate={endDate}
        initialUnconfirmedShiftCount={initialUnconfirmedShiftCount}
        initialNextPaymentAmount={initialNextPaymentAmount}
        todayDate={todayDate}
      />
    );
  } finally {
    timing.flushLog();
  }
}

type DashboardPageSearchParams = {
  month?: string | string[];
};

type DashboardPageProps = {
  searchParams?: DashboardPageSearchParams | Promise<DashboardPageSearchParams>;
};

export default async function Page({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const month = resolveInitialMonth(resolvedSearchParams.month);

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardPageContent month={month} />
    </Suspense>
  );
}

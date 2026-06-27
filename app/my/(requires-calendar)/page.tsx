import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  DashboardPageClient,
  DashboardPageLoadingSkeleton,
} from "@/components/dashboard/dashboard-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  addMonths,
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";
import { getPayrollSummaryAmountForUser } from "@/lib/payroll/summary";
import { getMonthShifts } from "@/lib/shifts/month-shifts";
import { prisma } from "@/lib/prisma";

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

async function getUnconfirmedShiftCount(userId: string): Promise<number> {
  return prisma.shift.count({
    where: {
      workplace: {
        userId,
      },
      date: {
        lte: startOfUtcDay(new Date()),
      },
      isConfirmed: false,
    },
  });
}

async function DashboardPageContent({ month }: { month: Date }) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const startDate = toDateOnlyString(startOfMonth(month));
  const endDate = toDateOnlyString(endOfMonth(month));
  const nextPaymentMonth = addMonths(month, 1);
  const [
    initialMonthShifts,
    initialUnconfirmedShiftCount,
    initialNextPaymentAmount,
  ] = await Promise.all([
    getMonthShifts({
      userId: current.user.id,
      startDate,
      endDate,
      includeEstimate: true,
    }),
    getUnconfirmedShiftCount(current.user.id),
    getPayrollSummaryAmountForUser(current.user.id, nextPaymentMonth),
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
}

type DashboardPageSearchParams = {
  month?: string | string[];
};

type DashboardPageProps = {
  searchParams?: DashboardPageSearchParams | Promise<DashboardPageSearchParams>;
};

export default async function Page({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as DashboardPageSearchParams);
  const month = resolveInitialMonth(resolvedSearchParams.month);

  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardPageContent month={month} />
    </Suspense>
  );
}

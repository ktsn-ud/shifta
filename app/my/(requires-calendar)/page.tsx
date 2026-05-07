import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  DashboardPageClient,
  DashboardPageLoadingSkeleton,
} from "@/components/dashboard/dashboard-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";
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

async function getUserWorkplaceIds(userId: string): Promise<string[]> {
  const workplaces = await prisma.workplace.findMany({
    where: { userId },
    select: { id: true },
  });
  return workplaces.map((workplace) => workplace.id);
}

async function getUnconfirmedShiftCount(
  workplaceIds: string[],
): Promise<number> {
  if (workplaceIds.length === 0) {
    return 0;
  }

  return prisma.shift.count({
    where: {
      workplaceId: {
        in: workplaceIds,
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
  const workplaceIds = await getUserWorkplaceIds(current.user.id);
  const [initialMonthShifts, initialUnconfirmedShiftCount] = await Promise.all([
    getMonthShifts({
      userId: current.user.id,
      startDate,
      endDate,
      includeEstimate: true,
      workplaceIds,
    }),
    getUnconfirmedShiftCount(workplaceIds),
  ]);

  return (
    <DashboardPageClient
      currentUserId={current.user.id}
      initialMonthShifts={initialMonthShifts}
      initialMonthStartDate={startDate}
      initialMonthEndDate={endDate}
      initialUnconfirmedShiftCount={initialUnconfirmedShiftCount}
      nextMonthPaymentAmount={null}
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

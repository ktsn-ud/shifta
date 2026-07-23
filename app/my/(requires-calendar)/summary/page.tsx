import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  SummaryPageClient,
  SummaryPageLoadingSkeleton,
} from "@/components/summary/summary-page-client";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

type SummaryPageSearchParams = {
  year?: string | string[];
};

type SummaryPageProps = {
  searchParams?: SummaryPageSearchParams | Promise<SummaryPageSearchParams>;
};

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function resolveYearParam(yearParam: string | string[] | undefined): {
  year: number;
  shouldRedirect: boolean;
} {
  const currentYear = new Date().getFullYear();

  if (yearParam === undefined) {
    return {
      year: currentYear,
      shouldRedirect: false,
    };
  }

  if (typeof yearParam !== "string" || /^\d{4}$/.test(yearParam) === false) {
    return {
      year: currentYear,
      shouldRedirect: true,
    };
  }

  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return {
      year: currentYear,
      shouldRedirect: true,
    };
  }

  return {
    year,
    shouldRedirect: false,
  };
}

function SummaryPageFallback() {
  return <SummaryPageLoadingSkeleton />;
}

async function SummaryPageContent({ year }: { year: number }) {
  const timing = createRequestTiming("GET /my/summary");
  try {
    const current = await timing.measure("requireCurrentUser", () =>
      requireCurrentUser(),
    );
    if ("response" in current) {
      redirect("/login");
    }
    await redirectToCalendarSetupIfNeeded(current.user);

    const initialSummary = await timing.measure(
      "getPayrollSummaryForUser",
      () => getPayrollSummaryForUser(current.user.id, year),
    );
    const currentYearValue = String(new Date().getFullYear());

    return (
      <SummaryPageClient
        key={String(year)}
        currentUserId={current.user.id}
        initialSummary={initialSummary}
        initialYear={year}
        currentYearValue={currentYearValue}
      />
    );
  } finally {
    timing.flushLog();
  }
}

export default async function SummaryPage({ searchParams }: SummaryPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as SummaryPageSearchParams);
  const { year, shouldRedirect } = resolveYearParam(resolvedSearchParams.year);

  if (shouldRedirect) {
    redirect(`/my/summary?year=${year}`);
  }

  return (
    <Suspense fallback={<SummaryPageFallback />}>
      <SummaryPageContent year={year} />
    </Suspense>
  );
}

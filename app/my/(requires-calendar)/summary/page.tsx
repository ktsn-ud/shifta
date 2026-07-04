import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  SummaryPageClient,
  SummaryPageLoadingSkeleton,
} from "@/components/summary/summary-page-client";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { startOfMonth, toMonthInputValue } from "@/lib/calendar/date";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

function SummaryPageFallback() {
  return <SummaryPageLoadingSkeleton />;
}

async function SummaryPageContent() {
  const timing = createRequestTiming("GET /my/summary");
  try {
    const current = await timing.measure("requireCurrentUser", () =>
      requireCurrentUser(),
    );
    if ("response" in current) {
      redirect("/login");
    }
    await redirectToCalendarSetupIfNeeded(current.user);

    const initialMonth = toMonthInputValue(startOfMonth(new Date()));

    const initialSummary = await timing.measure(
      "getPayrollSummaryForUser",
      () =>
        getPayrollSummaryForUser(
          current.user.id,
          parseDateOnly(`${initialMonth}-01`),
        ),
    );

    return (
      <SummaryPageClient
        currentUserId={current.user.id}
        initialSummary={initialSummary}
        initialMonth={initialMonth}
        currentMonthValue={initialMonth}
      />
    );
  } finally {
    timing.flushLog();
  }
}

export default function SummaryPage() {
  return (
    <Suspense fallback={<SummaryPageFallback />}>
      <SummaryPageContent />
    </Suspense>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  SummaryPageClient,
  SummaryPageLoadingSkeleton,
} from "@/components/summary/summary-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { startOfMonth, toMonthInputValue } from "@/lib/calendar/date";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

function SummaryPageFallback() {
  return <SummaryPageLoadingSkeleton />;
}

async function SummaryPageContent() {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialMonth = toMonthInputValue(startOfMonth(new Date()));

  const initialSummary = await getPayrollSummaryForUser(
    current.user.id,
    parseDateOnly(`${initialMonth}-01`),
  );

  return (
    <SummaryPageClient
      currentUserId={current.user.id}
      initialSummary={initialSummary}
      initialMonth={initialMonth}
    />
  );
}

export default function SummaryPage() {
  return (
    <Suspense fallback={<SummaryPageFallback />}>
      <SummaryPageContent />
    </Suspense>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SummaryPageClient } from "@/components/summary/summary-page-client";
import { StatCardsLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import {
  endOfMonth,
  startOfMonth,
  toDateOnlyString,
} from "@/lib/calendar/date";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

function SummaryPageFallback() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <StatCardsLoadingSkeleton count={4} className="lg:grid-cols-4" />
    </section>
  );
}

async function SummaryPageContent() {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialMonth = startOfMonth(new Date());
  const initialStartDate = toDateOnlyString(initialMonth);
  const initialEndDate = toDateOnlyString(endOfMonth(initialMonth));

  const initialSummary = await getPayrollSummaryForUser(
    current.user.id,
    parseDateOnly(initialStartDate),
    parseDateOnly(initialEndDate),
  );

  return (
    <SummaryPageClient
      initialSummary={initialSummary}
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
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

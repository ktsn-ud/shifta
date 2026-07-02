import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShiftConfirmPageLoadingSkeleton } from "@/components/shifts/ShiftConfirmLoadingSkeleton";
import { ShiftConfirmPageClient } from "@/components/shifts/shift-confirm-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getShiftConfirmationInitialData } from "@/lib/shifts/confirmation-data";

function ShiftConfirmPageFallback() {
  return <ShiftConfirmPageLoadingSkeleton />;
}

async function ShiftConfirmPageContent() {
  const timing = createRequestTiming("GET /my/shifts/confirm");
  const current = await timing.measure("requireCurrentUser", () =>
    requireCurrentUser(),
  );
  if ("response" in current) {
    timing.flushLog();
    redirect("/login");
  }

  const initialData = await timing.measure(
    "getShiftConfirmationInitialData",
    () => getShiftConfirmationInitialData(current.user.id),
  );
  timing.flushLog();

  return (
    <ShiftConfirmPageClient
      currentUserId={current.user.id}
      initialUnconfirmedShifts={initialData.unconfirmedShifts}
      initialConfirmedShiftGroups={initialData.confirmedShiftGroups}
    />
  );
}

export default function ShiftConfirmPage() {
  return (
    <Suspense fallback={<ShiftConfirmPageFallback />}>
      <ShiftConfirmPageContent />
    </Suspense>
  );
}

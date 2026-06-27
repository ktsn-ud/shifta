import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShiftConfirmPageLoadingSkeleton } from "@/components/shifts/ShiftConfirmLoadingSkeleton";
import { ShiftConfirmPageClient } from "@/components/shifts/shift-confirm-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getShiftConfirmationInitialData } from "@/lib/shifts/confirmation-data";

function ShiftConfirmPageFallback() {
  return <ShiftConfirmPageLoadingSkeleton />;
}

async function ShiftConfirmPageContent() {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialData = await getShiftConfirmationInitialData(current.user.id);

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

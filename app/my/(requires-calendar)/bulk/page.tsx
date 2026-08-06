import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { toDateKey, toMonthInputValue } from "@/lib/calendar/date";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";
import { BulkShiftPageLoadingSkeleton } from "@/components/shifts/BulkShiftLoadingSkeleton";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

export default function BulkPage() {
  return (
    <Suspense fallback={<BulkShiftPageLoadingSkeleton />}>
      <BulkPageContent />
    </Suspense>
  );
}

async function BulkPageContent() {
  await connection();
  const today = new Date();

  return (
    <BulkShiftFormLazy
      initialMonthInputValue={toMonthInputValue(today)}
      todayDateKey={toDateKey(today)}
    />
  );
}

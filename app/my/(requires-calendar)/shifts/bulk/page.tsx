import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  fromMonthInputValue,
  toDateKey,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { BulkShiftFormLazy } from "@/components/shifts/BulkShiftFormLazy";
import { BulkShiftPageLoadingSkeleton } from "@/components/shifts/BulkShiftLoadingSkeleton";

export const metadata: Metadata = {
  title: { absolute: "シフト一括登録｜Shifta" },
};

type ShiftBulkPageSearchParams = {
  month?: string | string[];
};

type ShiftBulkPageProps = {
  searchParams?: ShiftBulkPageSearchParams | Promise<ShiftBulkPageSearchParams>;
};

export default function ShiftBulkPage({ searchParams }: ShiftBulkPageProps) {
  return (
    <Suspense fallback={<BulkShiftPageLoadingSkeleton />}>
      <ShiftBulkPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ShiftBulkPageContent({ searchParams }: ShiftBulkPageProps) {
  await connection();
  const today = new Date();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedMonth =
    typeof resolvedSearchParams.month === "string"
      ? fromMonthInputValue(resolvedSearchParams.month)
      : null;
  const monthValue = toMonthInputValue(requestedMonth ?? today);

  return (
    <BulkShiftFormLazy
      initialMonthInputValue={monthValue}
      todayDateKey={toDateKey(today)}
    />
  );
}

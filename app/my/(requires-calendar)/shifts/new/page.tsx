import { NewShiftFormPageClient } from "@/components/shifts/shift-form-page-client";
import { Suspense } from "react";
import { NewShiftFormLoadingSkeleton } from "@/components/shifts/ShiftFormLoadingSkeleton";
import { dateFromDateKey, toDateKey } from "@/lib/calendar/date";
import {
  normalizeShiftPageSearchParams,
  type ShiftPageSearchParams,
} from "@/lib/shifts/page-search-params";

type NewShiftPageProps = {
  searchParams: Promise<ShiftPageSearchParams>;
};

export default function NewShiftPage({ searchParams }: NewShiftPageProps) {
  return (
    <Suspense fallback={<NewShiftFormLoadingSkeleton />}>
      <NewShiftPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewShiftPageContent({ searchParams }: NewShiftPageProps) {
  const navigation = normalizeShiftPageSearchParams(await searchParams);
  const initialDate =
    navigation.initialDate && dateFromDateKey(navigation.initialDate)
      ? navigation.initialDate
      : toDateKey(new Date());

  return (
    <NewShiftFormPageClient
      initialDate={initialDate}
      returnMonth={navigation.returnMonth}
      returnTo={navigation.returnTo}
    />
  );
}

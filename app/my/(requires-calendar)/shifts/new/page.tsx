import { NewShiftFormPageClient } from "@/components/shifts/shift-form-page-client";
import { dateFromDateKey, toDateKey } from "@/lib/calendar/date";
import {
  normalizeShiftPageSearchParams,
  type ShiftPageSearchParams,
} from "@/lib/shifts/page-search-params";

type NewShiftPageProps = {
  searchParams: Promise<ShiftPageSearchParams>;
};

export default async function NewShiftPage({
  searchParams,
}: NewShiftPageProps) {
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

import { NewShiftFormPageClient } from "@/components/shifts/shift-form-page-client";
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

  return (
    <NewShiftFormPageClient
      initialDate={navigation.initialDate}
      returnMonth={navigation.returnMonth}
      returnTo={navigation.returnTo}
    />
  );
}

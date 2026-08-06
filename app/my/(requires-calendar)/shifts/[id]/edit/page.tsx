import { EditShiftFormPageClient } from "@/components/shifts/shift-form-page-client";
import { Suspense } from "react";
import { EditShiftFormLoadingSkeleton } from "@/components/shifts/ShiftFormLoadingSkeleton";
import {
  normalizeShiftPageSearchParams,
  type ShiftPageSearchParams,
} from "@/lib/shifts/page-search-params";

type EditShiftPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<ShiftPageSearchParams>;
};

export default function EditShiftPage({
  params,
  searchParams,
}: EditShiftPageProps) {
  return (
    <Suspense fallback={<EditShiftFormLoadingSkeleton />}>
      <EditShiftPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditShiftPageContent({
  params,
  searchParams,
}: EditShiftPageProps) {
  const [{ id }, navigation] = await Promise.all([
    params,
    searchParams.then(normalizeShiftPageSearchParams),
  ]);

  return (
    <EditShiftFormPageClient
      shiftId={id}
      returnMonth={navigation.returnMonth}
      returnTo={navigation.returnTo}
    />
  );
}

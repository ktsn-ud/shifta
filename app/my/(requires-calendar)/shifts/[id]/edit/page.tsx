import { EditShiftFormPageClient } from "@/components/shifts/shift-form-page-client";
import {
  normalizeShiftPageSearchParams,
  type ShiftPageSearchParams,
} from "@/lib/shifts/page-search-params";

type EditShiftPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<ShiftPageSearchParams>;
};

export default async function EditShiftPage({
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

"use client";

import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { EditShiftFormLoadingSkeleton } from "@/components/shifts/ShiftFormLoadingSkeleton";

const ShiftForm = dynamic(
  () => import("@/components/shifts/ShiftForm").then((mod) => mod.ShiftForm),
  {
    loading: () => <EditShiftFormLoadingSkeleton />,
  },
);

export default function EditShiftPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo =
    searchParams.get("returnTo") === "list" ? "list" : "dashboard";

  return (
    <ShiftForm
      mode="edit"
      shiftId={params.id}
      returnMonth={searchParams.get("month") ?? undefined}
      returnTo={returnTo}
    />
  );
}

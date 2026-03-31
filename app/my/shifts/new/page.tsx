"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { NewShiftFormLoadingSkeleton } from "@/components/shifts/ShiftFormLoadingSkeleton";

const ShiftForm = dynamic(
  () => import("@/components/shifts/ShiftForm").then((mod) => mod.ShiftForm),
  {
    loading: () => <NewShiftFormLoadingSkeleton />,
  },
);

export default function NewShiftPage() {
  const searchParams = useSearchParams();
  const returnTo =
    searchParams.get("returnTo") === "list" ? "list" : "dashboard";

  return (
    <ShiftForm
      mode="create"
      initialDate={searchParams.get("date") ?? undefined}
      returnMonth={searchParams.get("month") ?? undefined}
      returnTo={returnTo}
    />
  );
}

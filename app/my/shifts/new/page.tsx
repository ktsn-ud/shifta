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

  return (
    <ShiftForm
      mode="create"
      initialDate={searchParams.get("date") ?? undefined}
    />
  );
}

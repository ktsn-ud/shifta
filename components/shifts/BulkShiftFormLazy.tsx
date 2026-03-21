"use client";

import dynamic from "next/dynamic";
import { BulkShiftPageLoadingSkeleton } from "@/components/shifts/BulkShiftLoadingSkeleton";

const BulkShiftForm = dynamic(
  () =>
    import("@/components/shifts/BulkShiftForm").then(
      (mod) => mod.BulkShiftForm,
    ),
  {
    loading: () => <BulkShiftPageLoadingSkeleton />,
  },
);

export function BulkShiftFormLazy() {
  return <BulkShiftForm />;
}

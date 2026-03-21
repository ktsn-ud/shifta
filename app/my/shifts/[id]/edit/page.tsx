"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { EditShiftFormLoadingSkeleton } from "@/components/shifts/ShiftFormLoadingSkeleton";

const ShiftForm = dynamic(
  () => import("@/components/shifts/ShiftForm").then((mod) => mod.ShiftForm),
  {
    loading: () => <EditShiftFormLoadingSkeleton />,
  },
);

export default function EditShiftPage() {
  const params = useParams<{ id: string }>();

  return <ShiftForm mode="edit" shiftId={params.id} />;
}

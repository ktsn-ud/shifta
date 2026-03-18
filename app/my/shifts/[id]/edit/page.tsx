"use client";

import { useParams } from "next/navigation";
import { ShiftForm } from "@/components/shifts/ShiftForm";

export default function EditShiftPage() {
  const params = useParams<{ id: string }>();

  return <ShiftForm mode="edit" shiftId={params.id} />;
}

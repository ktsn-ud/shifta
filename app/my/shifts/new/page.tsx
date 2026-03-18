"use client";

import { useSearchParams } from "next/navigation";
import { ShiftForm } from "@/components/shifts/ShiftForm";

export default function NewShiftPage() {
  const searchParams = useSearchParams();

  return <ShiftForm mode="create" initialDate={searchParams.get("date")} />;
}

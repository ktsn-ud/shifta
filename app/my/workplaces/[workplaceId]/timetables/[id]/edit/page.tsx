"use client";

import { useParams } from "next/navigation";
import { TimetableForm } from "@/components/workplaces/timetable-form";

export default function EditTimetablePage() {
  const params = useParams<{ workplaceId: string; id: string }>();

  return (
    <TimetableForm
      mode="edit"
      workplaceId={params.workplaceId}
      timetableId={params.id}
    />
  );
}

"use client";

import { useParams } from "next/navigation";
import { TimetableForm } from "@/components/workplaces/timetable-form";

export default function NewTimetablePage() {
  const params = useParams<{ workplaceId: string }>();

  return <TimetableForm mode="create" workplaceId={params.workplaceId} />;
}

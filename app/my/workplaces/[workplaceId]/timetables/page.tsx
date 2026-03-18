"use client";

import { useParams } from "next/navigation";
import { TimetableList } from "@/components/workplaces/timetable-list";

export default function TimetableListPage() {
  const params = useParams<{ workplaceId: string }>();

  return <TimetableList workplaceId={params.workplaceId} />;
}

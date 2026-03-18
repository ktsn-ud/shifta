"use client";

import { useParams } from "next/navigation";
import { WorkplaceForm } from "@/components/workplaces/workplace-form";

export default function EditWorkplacePage() {
  const params = useParams<{ id: string }>();

  return <WorkplaceForm mode="edit" workplaceId={params.id} />;
}

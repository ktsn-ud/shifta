import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkplaceList } from "@/components/workplaces/workplace-list";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getCachedWorkplaces } from "@/lib/cache/workplace-read-cache";

export const metadata: Metadata = {
  title: { absolute: "勤務先一覧｜Shifta" },
};

export default async function WorkplacesPage() {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const workplaces = await getCachedWorkplaces(current.user.id);

  const initialWorkplaces = workplaces.map((workplace) => ({
    id: workplace.id,
    name: workplace.name,
    type: workplace.type,
    color: workplace.color,
    _count: {
      shifts: workplace._count.shifts,
      payrollRules: workplace._count.payrollRules,
      timetableSets: workplace._count.timetableSets,
    },
  }));

  return <WorkplaceList initialWorkplaces={initialWorkplaces} />;
}

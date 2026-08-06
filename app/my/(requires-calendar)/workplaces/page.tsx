import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { WorkplaceList } from "@/components/workplaces/workplace-list";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getCachedWorkplaces } from "@/lib/cache/workplace-read-cache";
import { createRequestTiming } from "@/lib/perf/request-timing";
import Loading from "./loading";

export const metadata: Metadata = {
  title: { absolute: "勤務先一覧｜Shifta" },
};

export default function WorkplacesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <WorkplacesPageContent />
    </Suspense>
  );
}

async function WorkplacesPageContent() {
  const timing = createRequestTiming("GET /my/workplaces");
  const current = await timing.measure("requireCurrentUser", () =>
    requireCurrentUser(),
  );
  if ("response" in current) {
    timing.flushLog();
    redirect("/login");
  }
  await redirectToCalendarSetupIfNeeded(current.user);

  const workplaces = await timing.measure("getCachedWorkplaces", () =>
    getCachedWorkplaces(current.user.id),
  );

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
  timing.flushLog();

  return (
    <WorkplaceList
      currentUserId={current.user.id}
      initialWorkplaces={initialWorkplaces}
    />
  );
}

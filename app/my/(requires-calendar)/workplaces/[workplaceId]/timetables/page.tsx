import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { TimetableList } from "@/components/workplaces/timetable-list";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  getCachedTimetableSetsForWorkplace,
  getCachedWorkplaceDetail,
} from "@/lib/cache/workplace-read-cache";
import Loading from "./loading";

type TimetableListPageParams = {
  workplaceId: string;
};

type TimetableListPageProps = {
  params: TimetableListPageParams | Promise<TimetableListPageParams>;
};

export default function TimetableListPage({ params }: TimetableListPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <TimetableListPageContent params={params} />
    </Suspense>
  );
}

async function TimetableListPageContent({ params }: TimetableListPageProps) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }
  await redirectToCalendarSetupIfNeeded(current.user);

  const resolvedParams = await params;
  const workplace = await getCachedWorkplaceDetail(
    current.user.id,
    resolvedParams.workplaceId,
  );

  if (!workplace) {
    notFound();
  }

  const timetableSets =
    workplace.type === "CRAM_SCHOOL"
      ? await getCachedTimetableSetsForWorkplace(current.user.id, workplace.id)
      : [];

  const initialTimetables = timetableSets.map((set) => ({
    ...set,
    items: set.timetables,
  }));

  return (
    <TimetableList
      workplaceId={workplace.id}
      initialWorkplace={workplace}
      initialTimetables={initialTimetables}
    />
  );
}

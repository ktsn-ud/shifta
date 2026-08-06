import { TimetableForm } from "@/components/workplaces/timetable-form";
import { Suspense } from "react";
import Loading from "./loading";

type NewTimetablePageParams = {
  workplaceId: string;
};

type NewTimetablePageProps = {
  params: NewTimetablePageParams | Promise<NewTimetablePageParams>;
};

export default function NewTimetablePage({ params }: NewTimetablePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <NewTimetablePageContent params={params} />
    </Suspense>
  );
}

async function NewTimetablePageContent({ params }: NewTimetablePageProps) {
  const resolvedParams = await params;

  return (
    <TimetableForm mode="create" workplaceId={resolvedParams.workplaceId} />
  );
}

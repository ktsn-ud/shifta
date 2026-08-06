import { TimetableForm } from "@/components/workplaces/timetable-form";
import { Suspense } from "react";
import Loading from "./loading";

type EditTimetablePageParams = {
  workplaceId: string;
  id: string;
};

type EditTimetablePageProps = {
  params: EditTimetablePageParams | Promise<EditTimetablePageParams>;
};

export default function EditTimetablePage({ params }: EditTimetablePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <EditTimetablePageContent params={params} />
    </Suspense>
  );
}

async function EditTimetablePageContent({ params }: EditTimetablePageProps) {
  const resolvedParams = await params;

  return (
    <TimetableForm
      mode="edit"
      workplaceId={resolvedParams.workplaceId}
      timetableId={resolvedParams.id}
    />
  );
}

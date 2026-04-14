import { TimetableForm } from "@/components/workplaces/timetable-form";

type EditTimetablePageParams = {
  workplaceId: string;
  id: string;
};

type EditTimetablePageProps = {
  params: EditTimetablePageParams | Promise<EditTimetablePageParams>;
};

export default async function EditTimetablePage({
  params,
}: EditTimetablePageProps) {
  const resolvedParams = await params;

  return (
    <TimetableForm
      mode="edit"
      workplaceId={resolvedParams.workplaceId}
      timetableId={resolvedParams.id}
    />
  );
}

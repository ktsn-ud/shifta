import { TimetableForm } from "@/components/workplaces/timetable-form";

type NewTimetablePageParams = {
  workplaceId: string;
};

type NewTimetablePageProps = {
  params: NewTimetablePageParams | Promise<NewTimetablePageParams>;
};

export default async function NewTimetablePage({
  params,
}: NewTimetablePageProps) {
  const resolvedParams = await params;

  return (
    <TimetableForm mode="create" workplaceId={resolvedParams.workplaceId} />
  );
}

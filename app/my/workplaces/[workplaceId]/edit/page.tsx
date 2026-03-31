import { WorkplaceForm } from "@/components/workplaces/workplace-form";

type EditWorkplacePageParams = {
  workplaceId: string;
};

type EditWorkplacePageProps = {
  params: EditWorkplacePageParams | Promise<EditWorkplacePageParams>;
};

export default async function EditWorkplacePage({
  params,
}: EditWorkplacePageProps) {
  const resolvedParams = await params;

  return <WorkplaceForm mode="edit" workplaceId={resolvedParams.workplaceId} />;
}

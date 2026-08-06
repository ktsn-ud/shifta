import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { Suspense } from "react";
import Loading from "./loading";

type EditWorkplacePageParams = {
  workplaceId: string;
};

type EditWorkplacePageProps = {
  params: EditWorkplacePageParams | Promise<EditWorkplacePageParams>;
};

export default function EditWorkplacePage({ params }: EditWorkplacePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <EditWorkplacePageContent params={params} />
    </Suspense>
  );
}

async function EditWorkplacePageContent({ params }: EditWorkplacePageProps) {
  const resolvedParams = await params;

  return <WorkplaceForm mode="edit" workplaceId={resolvedParams.workplaceId} />;
}

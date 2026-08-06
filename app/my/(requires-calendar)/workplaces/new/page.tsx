import { connection } from "next/server";
import { Suspense } from "react";
import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { toDateOnlyString } from "@/lib/calendar/date";
import Loading from "./loading";

export default function NewWorkplacePage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewWorkplacePageContent />
    </Suspense>
  );
}

async function NewWorkplacePageContent() {
  await connection();
  const initialRuleStartDate = toDateOnlyString(new Date());

  return (
    <WorkplaceForm mode="create" initialRuleStartDate={initialRuleStartDate} />
  );
}

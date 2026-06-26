import { connection } from "next/server";
import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { toDateOnlyString } from "@/lib/calendar/date";

export default async function NewWorkplacePage() {
  await connection();
  const initialRuleStartDate = toDateOnlyString(new Date());

  return (
    <WorkplaceForm mode="create" initialRuleStartDate={initialRuleStartDate} />
  );
}

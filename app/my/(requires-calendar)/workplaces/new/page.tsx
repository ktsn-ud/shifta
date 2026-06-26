import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { toDateOnlyString } from "@/lib/calendar/date";

export default function NewWorkplacePage() {
  const initialRuleStartDate = toDateOnlyString(new Date());

  return (
    <WorkplaceForm mode="create" initialRuleStartDate={initialRuleStartDate} />
  );
}

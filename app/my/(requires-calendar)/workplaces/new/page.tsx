import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { toDateOnlyString } from "@/lib/calendar/date";

export default function NewWorkplacePage() {
  return (
    <WorkplaceForm
      mode="create"
      initialRuleStartDate={toDateOnlyString(new Date())}
    />
  );
}

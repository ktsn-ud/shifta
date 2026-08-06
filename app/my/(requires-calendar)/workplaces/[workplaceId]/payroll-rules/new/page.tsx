import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";
import { Suspense } from "react";
import Loading from "./loading";

type NewPayrollRulePageParams = {
  workplaceId: string;
};

type NewPayrollRulePageProps = {
  params: NewPayrollRulePageParams | Promise<NewPayrollRulePageParams>;
};

export default function NewPayrollRulePage({
  params,
}: NewPayrollRulePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <NewPayrollRulePageContent params={params} />
    </Suspense>
  );
}

async function NewPayrollRulePageContent({ params }: NewPayrollRulePageProps) {
  const resolvedParams = await params;

  return (
    <PayrollRuleForm mode="create" workplaceId={resolvedParams.workplaceId} />
  );
}

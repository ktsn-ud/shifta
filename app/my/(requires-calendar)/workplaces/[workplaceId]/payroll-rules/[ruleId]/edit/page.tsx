import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";
import { Suspense } from "react";
import Loading from "./loading";

type EditPayrollRulePageParams = {
  workplaceId: string;
  ruleId: string;
};

type EditPayrollRulePageProps = {
  params: EditPayrollRulePageParams | Promise<EditPayrollRulePageParams>;
};

export default function EditPayrollRulePage({
  params,
}: EditPayrollRulePageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <EditPayrollRulePageContent params={params} />
    </Suspense>
  );
}

async function EditPayrollRulePageContent({
  params,
}: EditPayrollRulePageProps) {
  const resolvedParams = await params;

  return (
    <PayrollRuleForm
      mode="edit"
      workplaceId={resolvedParams.workplaceId}
      ruleId={resolvedParams.ruleId}
    />
  );
}

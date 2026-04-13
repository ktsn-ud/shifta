import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";

type EditPayrollRulePageParams = {
  workplaceId: string;
  ruleId: string;
};

type EditPayrollRulePageProps = {
  params: EditPayrollRulePageParams | Promise<EditPayrollRulePageParams>;
};

export default async function EditPayrollRulePage({
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

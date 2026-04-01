import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";

type NewPayrollRulePageParams = {
  workplaceId: string;
};

type NewPayrollRulePageProps = {
  params: NewPayrollRulePageParams | Promise<NewPayrollRulePageParams>;
};

export default async function NewPayrollRulePage({
  params,
}: NewPayrollRulePageProps) {
  const resolvedParams = await params;

  return (
    <PayrollRuleForm mode="create" workplaceId={resolvedParams.workplaceId} />
  );
}

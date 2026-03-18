"use client";

import { useParams } from "next/navigation";
import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";

export default function EditPayrollRulePage() {
  const params = useParams<{ workplaceId: string; ruleId: string }>();

  return (
    <PayrollRuleForm
      mode="edit"
      workplaceId={params.workplaceId}
      ruleId={params.ruleId}
    />
  );
}

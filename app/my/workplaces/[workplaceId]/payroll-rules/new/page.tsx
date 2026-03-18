"use client";

import { useParams } from "next/navigation";
import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";

export default function NewPayrollRulePage() {
  const params = useParams<{ workplaceId: string }>();

  return <PayrollRuleForm mode="create" workplaceId={params.workplaceId} />;
}

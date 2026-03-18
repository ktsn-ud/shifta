"use client";

import { useParams } from "next/navigation";
import { PayrollRuleList } from "@/components/workplaces/payroll-rule-list";

export default function PayrollRuleListPage() {
  const params = useParams<{ workplaceId: string }>();

  return <PayrollRuleList workplaceId={params.workplaceId} />;
}

import { notFound, redirect } from "next/navigation";
import { PayrollRuleList } from "@/components/workplaces/payroll-rule-list";
import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";

type PayrollRuleListPageParams = {
  workplaceId: string;
};

type PayrollRuleListSearchParams = {
  warning?: string | string[];
};

type PayrollRuleListPageProps = {
  params: PayrollRuleListPageParams | Promise<PayrollRuleListPageParams>;
  searchParams?:
    | PayrollRuleListSearchParams
    | Promise<PayrollRuleListSearchParams>;
};

function resolveWarning(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function PayrollRuleListPage({
  params,
  searchParams,
}: PayrollRuleListPageProps) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as PayrollRuleListSearchParams);

  const workplace = await prisma.workplace.findFirst({
    where: {
      id: resolvedParams.workplaceId,
      userId: current.user.id,
    },
    select: {
      id: true,
      name: true,
      type: true,
      color: true,
    },
  });

  if (!workplace) {
    notFound();
  }

  const rules = await prisma.payrollRule.findMany({
    where: { workplaceId: workplace.id },
    orderBy: [{ startDate: "desc" }],
  });

  const initialRules = rules.map((rule) => ({
    id: rule.id,
    workplaceId: rule.workplaceId,
    startDate: rule.startDate.toISOString(),
    endDate: rule.endDate?.toISOString() ?? null,
    baseHourlyWage: rule.baseHourlyWage.toString(),
    holidayHourlyWage: rule.holidayHourlyWage?.toString() ?? null,
    nightMultiplier: rule.nightMultiplier.toString(),
    overtimeMultiplier: rule.overtimeMultiplier.toString(),
    nightStart: rule.nightStart.toISOString(),
    nightEnd: rule.nightEnd.toISOString(),
    dailyOvertimeThreshold: rule.dailyOvertimeThreshold.toString(),
    holidayType: rule.holidayType,
  }));

  return (
    <PayrollRuleList
      workplaceId={workplace.id}
      initialWorkplace={workplace}
      initialRules={initialRules}
      initialInfoMessage={resolveWarning(resolvedSearchParams.warning)}
    />
  );
}

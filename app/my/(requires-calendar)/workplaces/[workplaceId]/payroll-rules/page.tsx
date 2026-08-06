import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PayrollRuleList } from "@/components/workplaces/payroll-rule-list";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  getCachedPayrollRulesForWorkplace,
  getCachedWorkplaceDetail,
} from "@/lib/cache/workplace-read-cache";
import Loading from "./loading";

type PayrollRuleListPageParams = {
  workplaceId: string;
};

type PayrollRuleListSearchParams = {
  warning?: string | string[];
};

type PayrollRuleListPageProps = {
  params: PayrollRuleListPageParams | Promise<PayrollRuleListPageParams>;
  searchParams?:
    PayrollRuleListSearchParams | Promise<PayrollRuleListSearchParams>;
};

function resolveWarning(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function PayrollRuleListPage({
  params,
  searchParams,
}: PayrollRuleListPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <PayrollRuleListPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PayrollRuleListPageContent({
  params,
  searchParams,
}: PayrollRuleListPageProps) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }
  await redirectToCalendarSetupIfNeeded(current.user);

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as PayrollRuleListSearchParams);

  const workplace = await getCachedWorkplaceDetail(
    current.user.id,
    resolvedParams.workplaceId,
  );

  if (!workplace) {
    notFound();
  }

  const rules = await getCachedPayrollRulesForWorkplace(
    current.user.id,
    workplace.id,
  );

  return (
    <PayrollRuleList
      workplaceId={workplace.id}
      initialWorkplace={workplace}
      initialRules={rules}
      initialInfoMessage={resolveWarning(resolvedSearchParams.warning)}
    />
  );
}

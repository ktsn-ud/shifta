import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  ActualPayrollPageClient,
  ActualPayrollPageLoadingSkeleton,
} from "@/components/payroll/actual-payroll-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import {
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { getActualPayrollEditorForUser } from "@/lib/payroll/actual-editor";

type ActualPayrollPageSearchParams = {
  month?: string | string[];
};

type ActualPayrollPageProps = {
  searchParams?:
    | ActualPayrollPageSearchParams
    | Promise<ActualPayrollPageSearchParams>;
};

function resolveInitialMonth(
  monthParam: string | string[] | undefined,
): string {
  if (typeof monthParam !== "string") {
    return toMonthInputValue(startOfMonth(new Date()));
  }

  const parsed = fromMonthInputValue(monthParam);
  if (!parsed) {
    return toMonthInputValue(startOfMonth(new Date()));
  }

  return toMonthInputValue(startOfMonth(parsed));
}

function ActualPayrollPageFallback() {
  return <ActualPayrollPageLoadingSkeleton />;
}

async function ActualPayrollPageContent({ month }: { month: string }) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialData = await getActualPayrollEditorForUser(
    current.user.id,
    parseDateOnly(`${month}-01`),
  );

  return (
    <ActualPayrollPageClient
      currentUserId={current.user.id}
      initialMonth={month}
      currentMonthValue={toMonthInputValue(startOfMonth(new Date()))}
      initialData={initialData}
    />
  );
}

export default async function ActualPayrollPage({
  searchParams,
}: ActualPayrollPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as ActualPayrollPageSearchParams);
  const month = resolveInitialMonth(resolvedSearchParams.month);

  return (
    <Suspense fallback={<ActualPayrollPageFallback />}>
      <ActualPayrollPageContent month={month} />
    </Suspense>
  );
}

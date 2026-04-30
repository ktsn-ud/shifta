import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  PayrollDetailsMonthlyPageClient,
  PayrollDetailsMonthlyPageLoadingSkeleton,
} from "@/components/payroll-details/payroll-details-monthly-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import {
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { getPayrollDetailsMonthlyForUser } from "@/lib/payroll/details";

type PayrollDetailsMonthlyPageSearchParams = {
  month?: string | string[];
};

type PayrollDetailsMonthlyPageProps = {
  searchParams?:
    | PayrollDetailsMonthlyPageSearchParams
    | Promise<PayrollDetailsMonthlyPageSearchParams>;
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

function MonthlyPageFallback() {
  return <PayrollDetailsMonthlyPageLoadingSkeleton />;
}

async function MonthlyPageContent({ month }: { month: string }) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialDetails = await getPayrollDetailsMonthlyForUser(
    current.user.id,
    parseDateOnly(`${month}-01`),
  );

  return (
    <PayrollDetailsMonthlyPageClient
      currentUserId={current.user.id}
      initialMonth={month}
      initialDetails={initialDetails}
    />
  );
}

export default async function PayrollDetailsMonthlyPage({
  searchParams,
}: PayrollDetailsMonthlyPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as PayrollDetailsMonthlyPageSearchParams);
  const month = resolveInitialMonth(resolvedSearchParams.month);

  return (
    <Suspense fallback={<MonthlyPageFallback />}>
      <MonthlyPageContent month={month} />
    </Suspense>
  );
}

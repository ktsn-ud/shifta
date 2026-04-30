import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  PayrollDetailsWorkplaceYearlyPageClient,
  PayrollDetailsWorkplaceYearlyPageLoadingSkeleton,
} from "@/components/payroll-details/payroll-details-workplace-yearly-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import { getPayrollDetailsWorkplaceYearlyForUser } from "@/lib/payroll/details";

type PayrollDetailsWorkplaceYearlyPageSearchParams = {
  year?: string | string[];
};

type PayrollDetailsWorkplaceYearlyPageProps = {
  searchParams?:
    | PayrollDetailsWorkplaceYearlyPageSearchParams
    | Promise<PayrollDetailsWorkplaceYearlyPageSearchParams>;
};

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function resolveInitialYear(yearParam: string | string[] | undefined): number {
  const currentYear = new Date().getFullYear();

  if (typeof yearParam !== "string") {
    return currentYear;
  }

  if (!/^\d{4}$/.test(yearParam)) {
    return currentYear;
  }

  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return currentYear;
  }

  return year;
}

function WorkplaceYearlyPageFallback() {
  return <PayrollDetailsWorkplaceYearlyPageLoadingSkeleton />;
}

async function WorkplaceYearlyPageContent({ year }: { year: number }) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const initialDetails = await getPayrollDetailsWorkplaceYearlyForUser(
    current.user.id,
    year,
  );

  return (
    <PayrollDetailsWorkplaceYearlyPageClient
      currentUserId={current.user.id}
      initialYear={year}
      initialDetails={initialDetails}
    />
  );
}

export default async function PayrollDetailsWorkplaceYearlyPage({
  searchParams,
}: PayrollDetailsWorkplaceYearlyPageProps) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as PayrollDetailsWorkplaceYearlyPageSearchParams);
  const year = resolveInitialYear(resolvedSearchParams.year);

  return (
    <Suspense fallback={<WorkplaceYearlyPageFallback />}>
      <WorkplaceYearlyPageContent year={year} />
    </Suspense>
  );
}

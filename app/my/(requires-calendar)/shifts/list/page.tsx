import { redirect } from "next/navigation";
import { ShiftListPageClient } from "@/components/shifts/shift-list-page-client";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { getMonthShifts } from "@/lib/shifts/month-shifts";

type ShiftListPageSearchParams = {
  month?: string | string[];
};

type ShiftListPageProps = {
  searchParams?: ShiftListPageSearchParams | Promise<ShiftListPageSearchParams>;
};

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function resolveInitialMonth(monthParam: string | string[] | undefined): Date {
  if (typeof monthParam !== "string") {
    return startOfMonth(new Date());
  }

  const parsedMonth = fromMonthInputValue(monthParam);
  return startOfMonth(parsedMonth ?? new Date());
}

export default async function ShiftListPage({
  searchParams,
}: ShiftListPageProps) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams
    ? await searchParams
    : ({} as ShiftListPageSearchParams);
  const month = resolveInitialMonth(resolvedSearchParams.month);
  const monthStart = startOfMonth(month);
  const monthValue = toMonthInputValue(monthStart);
  const startDate = toDateOnlyString(monthStart);
  const endDate = toDateOnlyString(endOfMonth(monthStart));
  const initialMonthShifts = await getMonthShifts({
    userId: current.user.id,
    startDate,
    endDate,
    includeEstimate: true,
  });
  const todayDate = toDateOnlyString(startOfUtcDay(new Date()));

  return (
    <ShiftListPageClient
      key={monthValue}
      currentUserId={current.user.id}
      initialMonth={monthValue}
      initialMonthShifts={initialMonthShifts}
      initialMonthStartDate={startDate}
      initialMonthEndDate={endDate}
      todayDate={todayDate}
    />
  );
}

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BulkShiftEditPageClient } from "@/components/shifts/bulk-shift-edit-page-client";
import { BulkShiftEditLoadingSkeleton } from "@/components/shifts/BulkShiftEditLoadingSkeleton";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import {
  endOfMonth,
  fromMonthInputValue,
  startOfMonth,
  toDateOnlyString,
  toMonthInputValue,
} from "@/lib/calendar/date";
import { prisma } from "@/lib/prisma";
import { getMonthShifts } from "@/lib/shifts/month-shifts";

type Props = {
  searchParams?:
    { month?: string | string[] } | Promise<{ month?: string | string[] }>;
};

export default function BulkShiftEditPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<BulkShiftEditLoadingSkeleton />}>
      <BulkShiftEditPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BulkShiftEditPageContent({ searchParams }: Props) {
  const current = await requireCurrentUser();
  if ("response" in current) redirect("/login");
  await redirectToCalendarSetupIfNeeded(current.user);
  const params = searchParams ? await searchParams : {};
  const parsed =
    typeof params.month === "string" ? fromMonthInputValue(params.month) : null;
  const month = startOfMonth(parsed ?? new Date());
  const startDate = toDateOnlyString(month);
  const endDate = toDateOnlyString(endOfMonth(month));
  const [shifts, timetableSets, workplaces] = await Promise.all([
    getMonthShifts({
      userId: current.user.id,
      startDate,
      endDate,
      includeEstimate: true,
    }),
    prisma.timetableSet.findMany({
      where: { workplace: { userId: current.user.id } },
      include: { timetables: { orderBy: { period: "asc" } } },
      orderBy: [{ workplaceId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.workplace.findMany({
      where: { userId: current.user.id },
      select: {
        id: true,
        closingDayType: true,
        closingDay: true,
        payday: true,
        payrollRules: {
          select: {
            workplaceId: true,
            startDate: true,
            endDate: true,
            baseHourlyWage: true,
            holidayAllowanceHourly: true,
            nightPremiumRate: true,
            overtimePremiumRate: true,
            dailyOvertimeThreshold: true,
            holidayType: true,
          },
        },
      },
    }),
  ]);
  return (
    <BulkShiftEditPageClient
      currentUserId={current.user.id}
      initialMonth={toMonthInputValue(month)}
      initialShifts={shifts}
      initialStartDate={startDate}
      initialEndDate={endDate}
      key={toMonthInputValue(month)}
      timetableSets={timetableSets.map((set) => ({
        id: set.id,
        workplaceId: set.workplaceId,
        name: set.name,
        periods: set.timetables.map((item) => ({
          period: item.period,
          startTime: item.startTime.toISOString(),
          endTime: item.endTime.toISOString(),
        })),
      }))}
      previewWorkplaces={workplaces.map((workplace) => ({
        id: workplace.id,
        closingDayType: workplace.closingDayType,
        closingDay: workplace.closingDay,
        payday: workplace.payday,
      }))}
      previewPayrollRules={workplaces.flatMap((workplace) =>
        workplace.payrollRules.map((rule) => ({
          workplaceId: rule.workplaceId,
          startDate: rule.startDate.toISOString(),
          endDate: rule.endDate?.toISOString() ?? null,
          baseHourlyWage: rule.baseHourlyWage.toString(),
          holidayAllowanceHourly: rule.holidayAllowanceHourly.toString(),
          nightPremiumRate: rule.nightPremiumRate.toString(),
          overtimePremiumRate: rule.overtimePremiumRate.toString(),
          dailyOvertimeThreshold: rule.dailyOvertimeThreshold.toString(),
          holidayType: rule.holidayType,
        })),
      )}
    />
  );
}

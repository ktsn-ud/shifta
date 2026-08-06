import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  userWorkplacesTag,
  workplaceDetailTag,
  workplacePayrollRulesTag,
  workplaceTimetablesTag,
} from "@/lib/cache/tags";

export type CachedPayrollRule = {
  id: string;
  workplaceId: string;
  startDate: string;
  endDate: string | null;
  baseHourlyWage: string;
  holidayAllowanceHourly: string;
  nightPremiumRate: string;
  overtimePremiumRate: string;
  dailyOvertimeThreshold: string;
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
};

export type CachedWorkplace = {
  id: string;
  name: string;
  type: "GENERAL" | "CRAM_SCHOOL";
  color: string;
  closingDayType: "DAY_OF_MONTH" | "END_OF_MONTH";
  closingDay: number | null;
  payday: number;
  _count: { shifts: number; payrollRules: number; timetableSets: number };
};

export type CachedTimetableSet = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  timetables: Array<{
    id: string;
    timetableSetId: string;
    period: number;
    startTime: string;
    endTime: string;
    startTimeLabel: string;
    endTimeLabel: string;
  }>;
};

function serializeCachedPayrollRule(rule: {
  id: string;
  workplaceId: string;
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: { toString(): string };
  holidayAllowanceHourly: { toString(): string };
  nightPremiumRate: { toString(): string };
  overtimePremiumRate: { toString(): string };
  dailyOvertimeThreshold: { toString(): string };
  holidayType: "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
}): CachedPayrollRule {
  return {
    id: rule.id,
    workplaceId: rule.workplaceId,
    startDate: rule.startDate.toISOString(),
    endDate: rule.endDate?.toISOString() ?? null,
    baseHourlyWage: rule.baseHourlyWage.toString(),
    holidayAllowanceHourly: rule.holidayAllowanceHourly.toString(),
    nightPremiumRate: rule.nightPremiumRate.toString(),
    overtimePremiumRate: rule.overtimePremiumRate.toString(),
    dailyOvertimeThreshold: rule.dailyOvertimeThreshold.toString(),
    holidayType: rule.holidayType,
  };
}

export async function getCachedWorkplaces(userId: string) {
  "use cache";

  cacheLife("max");
  cacheTag(userWorkplacesTag(userId));

  const workplaces = await prisma.workplace.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          shifts: true,
          payrollRules: true,
          timetableSets: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return workplaces.map((workplace): CachedWorkplace => ({
    id: workplace.id,
    name: workplace.name,
    type: workplace.type,
    color: workplace.color,
    closingDayType: workplace.closingDayType,
    closingDay: workplace.closingDay,
    payday: workplace.payday,
    _count: workplace._count,
  }));
}

export async function getCachedWorkplaceDetail(
  userId: string,
  workplaceId: string,
) {
  "use cache";

  cacheLife("max");
  cacheTag(userWorkplacesTag(userId), workplaceDetailTag(workplaceId));

  return prisma.workplace.findFirst({
    where: {
      id: workplaceId,
      userId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      color: true,
      closingDayType: true,
      closingDay: true,
      payday: true,
      _count: {
        select: {
          shifts: true,
          payrollRules: true,
          timetableSets: true,
        },
      },
    },
  });
}

export async function getCachedPayrollRulesForWorkplace(
  userId: string,
  workplaceId: string,
) {
  "use cache";

  cacheLife("max");
  cacheTag(
    userWorkplacesTag(userId),
    workplaceDetailTag(workplaceId),
    workplacePayrollRulesTag(workplaceId),
  );

  const rules = await prisma.payrollRule.findMany({
    where: {
      workplaceId,
      workplace: {
        userId,
      },
    },
    orderBy: [{ startDate: "desc" }],
  });

  return rules.map(serializeCachedPayrollRule);
}

export async function getCachedPayrollRule(
  userId: string,
  workplaceId: string,
  payrollRuleId: string,
) {
  "use cache";

  cacheLife("max");
  cacheTag(
    userWorkplacesTag(userId),
    workplaceDetailTag(workplaceId),
    workplacePayrollRulesTag(workplaceId),
  );

  const rule = await prisma.payrollRule.findFirst({
    where: {
      id: payrollRuleId,
      workplaceId,
      workplace: { userId },
    },
  });

  return rule ? serializeCachedPayrollRule(rule) : null;
}

export async function getCachedTimetableSetsForWorkplace(
  userId: string,
  workplaceId: string,
) {
  "use cache";

  cacheLife("max");
  cacheTag(
    userWorkplacesTag(userId),
    workplaceDetailTag(workplaceId),
    workplaceTimetablesTag(workplaceId),
  );

  const sets = await prisma.timetableSet.findMany({
    where: {
      workplaceId,
      workplace: {
        userId,
      },
    },
    include: {
      timetables: {
        orderBy: {
          period: "asc",
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return sets.map((set): CachedTimetableSet => ({
    id: set.id,
    workplaceId: set.workplaceId,
    name: set.name,
    sortOrder: set.sortOrder,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    timetables: set.timetables.map((timetable) => {
      const startTime = timetable.startTime.toISOString();
      const endTime = timetable.endTime.toISOString();
      return {
        id: timetable.id,
        timetableSetId: timetable.timetableSetId,
        period: timetable.period,
        startTime,
        endTime,
        startTimeLabel: startTime.slice(11, 16),
        endTimeLabel: endTime.slice(11, 16),
      };
    }),
  }));
}

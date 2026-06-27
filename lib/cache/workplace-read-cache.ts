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

  cacheLife("minutes");
  cacheTag(userWorkplacesTag(userId));

  return prisma.workplace.findMany({
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
}

export async function getCachedWorkplaceDetail(
  userId: string,
  workplaceId: string,
) {
  "use cache";

  cacheLife("minutes");
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
    },
  });
}

export async function getCachedPayrollRulesForWorkplace(
  userId: string,
  workplaceId: string,
) {
  "use cache";

  cacheLife("minutes");
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

export async function getCachedTimetableSetsForWorkplace(
  userId: string,
  workplaceId: string,
) {
  "use cache";

  cacheLife("minutes");
  cacheTag(
    userWorkplacesTag(userId),
    workplaceDetailTag(workplaceId),
    workplaceTimetablesTag(workplaceId),
  );

  return prisma.timetableSet.findMany({
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
}

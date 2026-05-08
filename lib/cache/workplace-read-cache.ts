import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  userWorkplacesTag,
  workplaceDetailTag,
  workplacePayrollRulesTag,
  workplaceTimetablesTag,
} from "@/lib/cache/tags";

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

  return prisma.payrollRule.findMany({
    where: {
      workplaceId,
      workplace: {
        userId,
      },
    },
    orderBy: [{ startDate: "desc" }],
  });
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

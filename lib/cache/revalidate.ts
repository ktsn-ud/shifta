import "server-only";
import { revalidateTag } from "next/cache";
import {
  userActualPayrollTag,
  userPayrollDetailsTag,
  userShiftsTag,
  userSummaryTag,
  userWorkplacesTag,
  workplaceDetailTag,
  workplacePayrollRulesTag,
  workplaceTimetablesTag,
} from "@/lib/cache/tags";

function revalidateTags(tags: string[]): void {
  for (const tag of new Set(tags)) {
    revalidateTag(tag, "max");
  }
}

export function revalidateWorkplaceDomainTags(input: {
  userId: string;
  workplaceId?: string;
}): void {
  const tags = [
    userWorkplacesTag(input.userId),
    userActualPayrollTag(input.userId),
    userSummaryTag(input.userId),
    userPayrollDetailsTag(input.userId),
  ];

  if (input.workplaceId) {
    tags.push(
      workplaceDetailTag(input.workplaceId),
      workplacePayrollRulesTag(input.workplaceId),
      workplaceTimetablesTag(input.workplaceId),
    );
  }

  revalidateTags(tags);
}

export function revalidateShiftDomainTags(input: {
  userId: string;
  workplaceId?: string;
}): void {
  const tags = [
    userShiftsTag(input.userId),
    userActualPayrollTag(input.userId),
    userSummaryTag(input.userId),
    userPayrollDetailsTag(input.userId),
    userWorkplacesTag(input.userId),
  ];

  if (input.workplaceId) {
    tags.push(workplaceDetailTag(input.workplaceId));
  }

  revalidateTags(tags);
}

export function revalidateActualPayrollDomainTags(input: {
  userId: string;
}): void {
  revalidateTags([
    userActualPayrollTag(input.userId),
    userSummaryTag(input.userId),
    userPayrollDetailsTag(input.userId),
  ]);
}

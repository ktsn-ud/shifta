import "server-only";
import { revalidateTag } from "next/cache";
import {
  userActualPayrollTag,
  userPayrollDetailsTag,
  userPayrollSnapshotMonthTag,
  userPayrollSnapshotTag,
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

export function revalidateShiftSyncTags(input: { userId: string }): void {
  revalidateTags([userShiftsTag(input.userId)]);
}

export function revalidateWorkplaceDomainTags(input: {
  userId: string;
  workplaceId?: string;
}): void {
  const tags = [
    userWorkplacesTag(input.userId),
    userActualPayrollTag(input.userId),
    userPayrollSnapshotTag(input.userId),
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
  workplaceIds?: string[];
  paymentMonthKeys?: string[];
}): void {
  const paymentMonthKeys = input.paymentMonthKeys;
  const tags = [
    userShiftsTag(input.userId),
    userActualPayrollTag(input.userId),
    userSummaryTag(input.userId),
    userPayrollDetailsTag(input.userId),
    userWorkplacesTag(input.userId),
  ];

  if (paymentMonthKeys && paymentMonthKeys.length > 0) {
    tags.push(
      ...paymentMonthKeys.map((monthKey) =>
        userPayrollSnapshotMonthTag(input.userId, monthKey),
      ),
    );
  } else {
    tags.push(userPayrollSnapshotTag(input.userId));
  }

  const workplaceIds = [
    ...(input.workplaceId ? [input.workplaceId] : []),
    ...(input.workplaceIds ?? []),
  ];
  for (const workplaceId of new Set(workplaceIds)) {
    tags.push(workplaceDetailTag(workplaceId));
  }

  revalidateTags(tags);
}

export function revalidateActualPayrollDomainTags(input: {
  userId: string;
}): void {
  revalidateTags([
    userActualPayrollTag(input.userId),
    userPayrollSnapshotTag(input.userId),
    userSummaryTag(input.userId),
    userPayrollDetailsTag(input.userId),
  ]);
}

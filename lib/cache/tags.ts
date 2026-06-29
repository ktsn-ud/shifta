export function userWorkplacesTag(userId: string): string {
  return `user:${userId}:workplaces`;
}

export function userShiftsTag(userId: string): string {
  return `user:${userId}:shifts`;
}

export function userSummaryTag(userId: string): string {
  return `user:${userId}:summary`;
}

export function userPayrollDetailsTag(userId: string): string {
  return `user:${userId}:payroll-details`;
}

export function userActualPayrollTag(userId: string): string {
  return `user:${userId}:actual-payroll`;
}

export function userPayrollSnapshotTag(userId: string): string {
  return `user:${userId}:payroll-snapshot`;
}

export function workplaceDetailTag(workplaceId: string): string {
  return `workplace:${workplaceId}:detail`;
}

export function workplacePayrollRulesTag(workplaceId: string): string {
  return `workplace:${workplaceId}:payroll-rules`;
}

export function workplaceTimetablesTag(workplaceId: string): string {
  return `workplace:${workplaceId}:timetables`;
}

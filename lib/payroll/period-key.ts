export function toPayrollPeriodMapKey(
  workplaceId: string,
  monthKey: string,
): string {
  return `${workplaceId}:${monthKey}`;
}

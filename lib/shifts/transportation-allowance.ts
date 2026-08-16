export const MAX_TRANSPORTATION_ALLOWANCE = 2_147_483_647;

const TRANSPORTATION_ALLOWANCE_ERROR =
  "交通費は0円以上2,147,483,647円以下の整数で入力してください。";

export function getTransportationAllowanceValidationError(
  value: string,
): string | null {
  if (value === "") {
    return null;
  }

  if (!/^\d+$/.test(value) || Number(value) > MAX_TRANSPORTATION_ALLOWANCE) {
    return TRANSPORTATION_ALLOWANCE_ERROR;
  }

  return null;
}

export function normalizeTransportationAllowance(value: string): number {
  return value === "" ? 0 : Number(value);
}

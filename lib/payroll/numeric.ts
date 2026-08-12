export type DecimalLike = number | string | { toString: () => string };

export function decimalToNumber(
  value: DecimalLike | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = Number(value.toString());
  if (Number.isFinite(numeric) === false) {
    return fallback;
  }

  return numeric;
}

export function roundCurrency(value: number): number {
  return Math.round(value);
}

export function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

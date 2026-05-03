const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  return `¥${currencyFormatter.format(Math.round(value))}`;
}

export function formatRate(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return value.toFixed(4).replace(/\.?(0+)$/, "");
}

export function formatHoursDecimal(value: number): string {
  return `${value.toFixed(2)} 時間`;
}

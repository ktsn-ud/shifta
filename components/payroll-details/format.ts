const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  return `¥${currencyFormatter.format(Math.round(value))}`;
}

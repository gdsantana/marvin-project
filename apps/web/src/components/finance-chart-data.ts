export type FinanceSeriesPoint = {
  from: string;
  to: string;
  incomeMinorByCurrency: Record<string, string>;
  expenseMinorByCurrency: Record<string, string>;
};

export function magnitude(value: bigint) { return value < 0n ? -value : value; }

// Only chart geometry uses numbers; money and tooltip values remain exact integers.
export function chartCoordinate(value: bigint, maximum: bigint) {
  return maximum === 0n ? 0 : Number((value * 1_000_000n) / maximum) / 10_000;
}

export function monthlyChartData(series: FinanceSeriesPoint[], currency: string) {
  const rows = series.map(point => ({
    label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${point.from}T00:00:00Z`)),
    incomeMinor: point.incomeMinorByCurrency[currency] ?? "0",
    expenseMinor: point.expenseMinorByCurrency[currency] ?? "0",
  }));
  const maximum = rows.reduce((max, row) => [max, magnitude(BigInt(row.incomeMinor)), magnitude(BigInt(row.expenseMinor))].reduce((a, b) => a > b ? a : b), 0n);
  return rows.map(row => ({ ...row, income: chartCoordinate(BigInt(row.incomeMinor), maximum), expense: chartCoordinate(BigInt(row.expenseMinor), maximum) }));
}

export function amountChartData(rows: { label: string; amountMinor: string; fill?: string }[]) {
  const maximum = rows.reduce((max, row) => magnitude(BigInt(row.amountMinor)) > max ? magnitude(BigInt(row.amountMinor)) : max, 0n);
  return rows.map(row => ({ ...row, value: chartCoordinate(BigInt(row.amountMinor), maximum) }));
}

export function recentMonths(to: string, count = 6) {
  const [year, month] = to.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - count + index, 1));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const last = new Date(Date.UTC(y, date.getUTCMonth() + 1, 0)).getUTCDate();
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
  });
}

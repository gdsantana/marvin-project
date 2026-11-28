import type { CategoryReport } from "@finance/contracts";
import { offsetReportMonth, reportPeriod, todayCivil, type ReportRange } from "./finance-format";
import type { ExpenseForecastOption, StatementOption } from "./workspace-types";

export function previousCategoryPeriod(range: ReportRange, from: string) {
  if (from === "0001-01-01") return null;
  if (range !== "year") return reportPeriod(offsetReportMonth(from, -1));
  const year = String(Number(from.slice(0, 4)) - 1).padStart(4, "0");
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function categoryChanges(current: CategoryReport[], previous: CategoryReport[], currency: string) {
  const amounts = new Map<string | null, { name: string; current: bigint; previous: bigint }>();
  for (const [period, categories] of [["current", current], ["previous", previous]] as const) {
    for (const category of categories) {
      if (category.currency !== currency) continue;
      const row = amounts.get(category.categoryId) ?? { name: category.categoryName ?? "Sem categoria", current: 0n, previous: 0n };
      row[period] = BigInt(category.expenseMinor);
      amounts.set(category.categoryId, row);
    }
  }
  return [...amounts].flatMap(([id, row]) => {
    if (row.current === 0n && row.previous === 0n) return [];
    const delta = row.current - row.previous;
    return [{ ...row, id, delta, impact: delta < 0n ? -delta : delta }];
  }).sort((a, b) => a.impact === b.impact ? a.name.localeCompare(b.name, "pt-BR") : a.impact > b.impact ? -1 : 1);
}

export function upcomingCommitments(statements: StatementOption[], forecasts: ExpenseForecastOption[], now = new Date()) {
  const today = todayCivil(now);
  const months = [1, 2, 3].map(offset => ({
    month: offsetReportMonth(today, offset),
    statementsMinor: 0n,
    forecastsMinor: 0n,
  }));
  for (const statement of statements) {
    const month = months.find(row => statement.dueOn.startsWith(row.month));
    const remaining = BigInt(statement.remainingMinor ?? "0");
    if (month && statement.currency === "BRL" && remaining > 0n) month.statementsMinor += remaining;
  }
  for (const forecast of forecasts) {
    const month = months.find(row => forecast.expectedOn.startsWith(row.month));
    if (month && forecast.currency === "BRL" && forecast.status === "projected") month.forecastsMinor += BigInt(forecast.amountMinor);
  }
  return months;
}

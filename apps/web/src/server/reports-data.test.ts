import assert from "node:assert/strict";
import { test } from "node:test";
import type { CategoryReport } from "@finance/contracts";
import { categoryChanges, previousCategoryPeriod, upcomingCommitments } from "../components/reports-data";
import type { ExpenseForecastOption, StatementOption } from "../components/workspace-types";

test("category comparison uses the previous calendar month or year", () => {
  assert.deepEqual(previousCategoryPeriod("2027-01", "2027-01-01"), { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(previousCategoryPeriod("year", "2025-01-01"), { from: "2024-01-01", to: "2024-12-31" });
  assert.equal(previousCategoryPeriod("0001-01", "0001-01-01"), null);
});

test("category comparison retains missing categories and sorts exact signed changes by impact", () => {
  const category = (id: string | null, name: string | null, expenseMinor: string): CategoryReport => ({ categoryId: id, categoryName: name, currency: "BRL", expenseMinor, incomeMinor: "0", netMinor: "0" });
  const changes = categoryChanges([
    category("market", "Mercado", "900719925474099301"), category(null, null, "-500"), category("income", "Salário", "0"),
  ], [category("market", "Mercado", "900719925474099001"), category("travel", "Viagem", "1000")], "BRL");
  assert.deepEqual(changes.map(({ name, current, previous, delta }) => [name, current, previous, delta]), [
    ["Viagem", 0n, 1000n, -1000n], ["Sem categoria", -500n, 0n, -500n], ["Mercado", 900719925474099301n, 900719925474099001n, 300n],
  ]);
});

test("future commitments add only positive invoice balances and projected expenses in the next three months", () => {
  const statement = (dueOn: string, remainingMinor: string): StatementOption => ({ id: dueOn, cardAccountId: "card", cardAccountName: "Cartão", currency: "BRL", status: "partially_paid", dueOn, remainingMinor });
  const forecast = (expectedOn: string, status: ExpenseForecastOption["status"]): ExpenseForecastOption => ({ id: expectedOn, accountId: "account", categoryId: null, description: "Previsão", expectedOn, currency: "BRL", amountMinor: "5000", status, realizedTransactionId: null, createdAt: "2026-11-10T00:00:00Z" });
  const months = upcomingCommitments(
    [statement("2026-11-30", "1000"), statement("2026-12-15", "12000"), statement("2027-01-02", "0"), statement("2027-01-20", "-100"), statement("2027-02-28", "1001"), statement("2027-03-01", "9999")],
    [forecast("2026-12-10", "projected"), forecast("2027-01-12", "realized"), forecast("2027-02-10", "cancelled"), forecast("2027-03-01", "projected")],
    new Date("2026-12-01T01:00:00Z"),
  );
  assert.deepEqual(months, [
    { month: "2026-12", statementsMinor: 12000n, forecastsMinor: 5000n },
    { month: "2027-01", statementsMinor: 0n, forecastsMinor: 0n },
    { month: "2027-02", statementsMinor: 1001n, forecastsMinor: 0n },
  ]);
});

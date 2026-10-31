import assert from "node:assert/strict";
import { test } from "node:test";
import { filterTransactions } from "../components/transaction-list";
import type { TransactionOption } from "../components/workspace-types";

const rows: TransactionOption[] = [
  { id: "split", kind: "expense", description: "Mercado", occurredOn: "2026-10-20", entries: [{ accountId: "bank", accountName: "Conta", accountType: "checking", amountMinor: "-15000", currency: "BRL" }], allocations: [{ categoryId: "food", categoryName: "Alimentação", amountMinor: "10000" }, { categoryId: "home", categoryName: "Casa", amountMinor: "5000" }] },
  { id: "transfer", kind: "transfer", description: "Entre contas", occurredOn: "2026-10-19", entries: [{ accountId: "bank", accountName: "Conta", accountType: "checking", amountMinor: "-100", currency: "BRL" }, { accountId: "other", accountName: "Outra", accountType: "checking", amountMinor: "100", currency: "BRL" }] },
  { id: "income", kind: "income", description: "Salário", occurredOn: "2026-10-18" },
];

test("combines account, split category, kind and text filters", () => {
  assert.deepEqual(filterTransactions(rows, { accountId: "bank", categoryId: "home", filter: "expense", query: " MERCADO " }).map(row => row.id), ["split"]);
  assert.deepEqual(filterTransactions(rows, { accountId: "other" }).map(row => row.id), ["transfer"]);
  assert.deepEqual(filterTransactions(rows, { accountId: "other", categoryId: "food" }), []);
});

test("cleared filters preserve rows and optional fields are supported", () => {
  assert.deepEqual(filterTransactions(rows, {}), rows);
  assert.deepEqual(filterTransactions(rows, { filter: "income", query: "salário" }).map(row => row.id), ["income"]);
  assert.deepEqual(filterTransactions(rows, { query: "alimentação" }).map(row => row.id), ["split"]);
  assert.equal(rows.length, 3);
});

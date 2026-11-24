import assert from "node:assert/strict";
import { test } from "node:test";
import { addedTransactionIds, type TransactionSnapshot } from "../components/transaction-updates";

function snapshot(ids: string[], token = 1, scope = "entries:month"): TransactionSnapshot {
  return { ids: new Set(ids), token, scope };
}

test("SSE refresh animates only added IDs, preserving response order", () => {
  assert.deepEqual(addedTransactionIds(snapshot(["existing", "removed"]), snapshot(["second", "existing", "first"], 2)), ["second", "first"]);
  assert.deepEqual(addedTransactionIds(snapshot(["existing"]), snapshot(["existing"], 2)), []);
});

test("initial load, period navigation and duplicate refresh do not animate arrivals", () => {
  const current = snapshot(["new"]);
  assert.deepEqual(addedTransactionIds(null, current), []);
  assert.deepEqual(addedTransactionIds(snapshot([]), current), []);
  assert.deepEqual(addedTransactionIds(snapshot([], 0, "entries:last-month"), current), []);
});

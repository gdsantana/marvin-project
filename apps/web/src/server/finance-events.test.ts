import assert from "node:assert/strict";
import test from "node:test";
import { createFinanceEventStream, notifyFinanceChanges, subscribeFinanceChanges, withFinanceNotifications } from "./finance-events";

test("successful mutations notify subscribers, including when response enrichment fails", async () => {
  let notifications = 0;
  const unsubscribe = subscribeFinanceChanges(() => { notifications++; });
  const service = withFinanceNotifications({
    async createIncome() { return { value: { id: "1" }, replayed: false }; },
    async transactionHistory() { throw new Error("read failed"); },
    async previewTransaction() { return {}; },
    async createExpense() { throw new Error("write failed"); },
  });
  try {
    await service.previewTransaction();
    await assert.rejects(service.createExpense());
    assert.equal(notifications, 0);
    await service.createIncome();
    await assert.rejects(service.transactionHistory());
    assert.equal(notifications, 1);
  } finally { unsubscribe(); }
  notifyFinanceChanges();
  assert.equal(notifications, 1);
});

test("one broken subscriber does not prevent other notifications", () => {
  let notifications = 0;
  const removeBroken = subscribeFinanceChanges(() => { throw new Error("disconnected"); });
  const removeGood = subscribeFinanceChanges(() => { notifications++; });
  try { notifyFinanceChanges(); assert.equal(notifications, 1); }
  finally { removeBroken(); removeGood(); }
});

test("MCP API writes notify after commit, but rejected writes do not", async () => {
  const runtime = globalThis as typeof globalThis & { marvinFinance?: unknown; marvinRepository?: unknown };
  const previousService = runtime.marvinFinance;
  const previousRepository = runtime.marvinRepository;
  const previousToken = process.env.MCP_API_TOKEN;
  process.env.MCP_API_TOKEN = "test-api-token-with-at-least-32-bytes-long";
  runtime.marvinRepository = {};
  let notifications = 0;
  const unsubscribe = subscribeFinanceChanges(() => { notifications++; });
  const { POST } = await import("../app/api/v1/[...path]/route");
  const request = () => new Request("http://localhost/api/v1/transactions/income", {
    method: "POST", headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": "event-test" },
    body: JSON.stringify({ accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "2500", categoryId: null, occurredOn: "2026-10-01", description: "Salário" }),
  });
  const context = { params: Promise.resolve({ path: ["transactions", "income"] }) };
  try {
    runtime.marvinFinance = { createIncome: async () => { throw new Error("rejected"); }, transactionHistory: async () => [] };
    assert.equal((await POST(request(), context)).status, 500);
    assert.equal(notifications, 0);
    runtime.marvinFinance = {
      createIncome: async () => ({ value: { id: "1" }, replayed: false }),
      transactionHistory: async () => { throw new Error("read failed"); },
    };
    assert.equal((await POST(request(), context)).status, 500);
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
    if (previousService === undefined) delete runtime.marvinFinance; else runtime.marvinFinance = previousService;
    if (previousRepository === undefined) delete runtime.marvinRepository; else runtime.marvinRepository = previousRepository;
    if (previousToken === undefined) delete process.env.MCP_API_TOKEN; else process.env.MCP_API_TOKEN = previousToken;
  }
});

test("SSE streams generic change events and closes on disconnect", async () => {
  const abort = new AbortController();
  const stream = createFinanceEventStream(abort.signal, async () => ({}));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  assert.equal(decoder.decode((await reader.read()).value), ": connected\n\n");
  notifyFinanceChanges();
  assert.equal(decoder.decode((await reader.read()).value), "event: finance-changed\ndata: {}\n\n");
  abort.abort();
  assert.equal((await reader.read()).done, true);
});

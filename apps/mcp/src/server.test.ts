import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebApiClient } from "./api-client.js";
import { createMcpApp } from "./server.js";

const token = "hermes-secret-that-is-at-least-32-bytes-long";
const apiToken = "api-secret-that-is-distinct-and-long-enough";

test("Streamable HTTP exposes typed tools and forwards reads/writes to the authenticated API", async () => {
  const requests: Array<{ url: string; headers: Headers; body: unknown }> = [];
  const api = new WebApiClient("http://web.test/api/", apiToken, async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url: url.href, headers, body });
    if (url.pathname === "/api/v1/accounts") return Response.json({ ok: true, data: [{
      id: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", institutionId: null, name: "Corrente", type: "checking",
      currency: "BRL", openingBalanceMinor: "10000", openingDate: "2026-01-01", isArchived: false, balanceMinor: "10000",
    }] });
    if (url.pathname === "/api/v1/cards/settings") return Response.json({ ok: true, data: {
      accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", creditLimitMinor: "500000", closingDay: 20,
      dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual",
    } });
    if (url.pathname === "/api/v1/cards/configuration") return Response.json({ ok: true, data: {
      accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", creditLimitMinor: "600000", closingDay: 21,
      dueDay: 29, billingTimezone: "America/Sao_Paulo", billingMode: "automatic",
    } });
    const historyTransaction = {
      id: "c32a74c0-cbbb-4ecc-9fbb-6d0e902c65b6", kind: "expense", occurredOn: "2026-10-01", postedOn: null,
      description: "Lanche", counterpartyName: null, notes: null, reviewStatus: "confirmed", paymentMethod: "debit",
      relatedTransactionId: null, source: "hermes", entries: [], allocations: [], revisions: [],
      reversalOfTransactionId: null, reversedByTransactionIds: [],
    };
    const expenseForecast = {
      id: "4e8a0380-a64a-431c-a0b2-8d8f24faab4a", accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54",
      expectedOn: "2026-10-10", amountMinor: "2500", categoryId: null, description: "Lanche", currency: "BRL",
      status: "projected", realizedTransactionId: null, createdAt: "2026-10-01T12:00:00.000Z",
    };
    if (url.pathname === "/api/v1/expense-forecasts" && init?.method !== "POST") return Response.json({ ok: true, data: [expenseForecast] });
    if (url.pathname === "/api/v1/expense-forecasts") return Response.json({ ok: true, data: { value: expenseForecast, replayed: false } }, { status: 201 });
    if (url.pathname.endsWith("/realize")) return Response.json({ ok: true, data: { value: { forecast: { ...expenseForecast, status: "realized", realizedTransactionId: historyTransaction.id }, transaction: historyTransaction }, replayed: false } }, { status: 201 });
    if (url.pathname.endsWith("/cancel")) return Response.json({ ok: true, data: {
      value: { ...expenseForecast, status: "cancelled" }, replayed: headers.get("idempotency-key") === "forecast-cancel-replay-1",
    } });
    if (url.pathname === "/api/v1/transactions/correct") return Response.json({ ok: true, data: { value: { ...historyTransaction, revisions: [{ id: "3f194c10-21d9-4c28-bf03-11bd00eea323", revisionNumber: 1, reason: "Descrição ajustada", actor: "hermes", source: "hermes", createdAt: "2026-10-01T12:00:00.000Z" }] }, replayed: false } });
    if (url.pathname === "/api/v1/transactions/reverse") return Response.json({ ok: true, data: { value: { reversal: { ...historyTransaction, id: "c60ddf53-eef2-48fd-8e55-752b9bb2e262", kind: "adjustment", description: "Reversão: Lanche" }, replacement: null }, replayed: false } }, { status: 201 });
    if (url.pathname === "/api/v1/transactions/income") return Response.json({ ok: true, data: { value: {
      id: "c32a74c0-cbbb-4ecc-9fbb-6d0e902c65b6", kind: "income", occurredOn: "2026-10-01", postedOn: null,
      description: "Salário", counterpartyName: null, notes: null, reviewStatus: "confirmed", paymentMethod: null,
      relatedTransactionId: null, source: "hermes", entries: [], allocations: [],
    }, replayed: false } }, { status: 201 });
    if (url.pathname === "/api/v1/transactions/preview") return Response.json({ ok: true, data: {
      operation: "income", kind: "income", entries: [{ accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "10000" }],
      allocations: [{ categoryId: null, amountMinor: "10000" }],
    } });
    if (url.pathname === "/api/v1/categories") return Response.json({ ok: true, data: [{
      id: "e90e4ed7-74e0-43cf-b8cf-b6f155b43093", name: "Salário", type: "income", parentId: null, isArchived: false,
    }] });
    if (url.pathname === "/api/v1/reports/summary") return Response.json({ ok: false, error: { code: "NOT_FOUND", message: "Summary unavailable" } }, { status: 503 });
    if (url.pathname === "/api/v1/statements/payment") return Response.json({ ok: true, data: { value: {
      transaction: {
        id: "c32a74c0-cbbb-4ecc-9fbb-6d0e902c65b6", kind: "transfer", occurredOn: "2026-10-01", postedOn: null,
        description: "Pagamento fatura", counterpartyName: null, notes: null, reviewStatus: "confirmed", paymentMethod: "bank_transfer",
        relatedTransactionId: null, source: "hermes", entries: [], allocations: [],
      },
      payment: { id: "57f79aee-3d05-43c1-aab4-6bc8a208d8a9", statementId: "1a6ef40c-371d-4ead-a763-b6be838fdd60", transferTransactionId: "c32a74c0-cbbb-4ecc-9fbb-6d0e902c65b6", amountMinor: "10000" },
    }, replayed: false } }, { status: 201 });
    return Response.json({ ok: false, error: { code: "NOT_FOUND", message: "Rota não encontrada" } }, { status: 404 });
  });
  const httpServer = createHttpServer(createMcpApp(token, api));
  await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "test-hermes", version: "1.0.0" });

  try {
    const health = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.deepEqual(await health.json(), { ok: true, data: { status: "ok" } });
    const unauthorized = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: "POST" });
    assert.equal(unauthorized.status, 401);
    assert.doesNotMatch(await unauthorized.text(), /api-secret|hermes-secret/);
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.some(tool => tool.name === "get_accounts"));
    assert.ok(tools.some(tool => tool.name === "get_card_settings"));
    assert.ok(tools.some(tool => tool.name === "configure_card"));
    assert.ok(tools.some(tool => tool.name === "get_categories"));
    assert.ok(tools.some(tool => tool.name === "create_income"));
    assert.ok(tools.some(tool => tool.name === "preview_transaction"));
    assert.ok(tools.some(tool => tool.name === "pay_statement"));
    for (const name of ["get_expense_forecasts", "create_expense_forecast", "realize_expense_forecast", "cancel_expense_forecast", "correct_transaction", "reverse_transaction"]) {
      assert.ok(tools.some(tool => tool.name === name), `missing ${name}`);
    }

    const accountResult = await client.callTool({ name: "get_accounts", arguments: {} });
    assert.equal(accountResult.isError, undefined);
    assert.match((accountResult.content as Array<{ text?: string }>)[0]?.text ?? "", /"balanceMinor":"10000"/);
    const cardSettings = await client.callTool({ name: "get_card_settings", arguments: { accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54" } });
    assert.equal(cardSettings.isError, undefined);
    assert.match((cardSettings.content as Array<{ text?: string }>)[0]?.text ?? "", /"creditLimitMinor":"500000"/);
    const configuredCard = await client.callTool({ name: "configure_card", arguments: {
      accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", creditLimitMinor: "600000", closingDay: 21,
      dueDay: 29, billingTimezone: "America/Sao_Paulo", billingMode: "automatic", idempotencyKey: "card-config-1",
    } });
    assert.equal(configuredCard.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/cards/configuration");
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "card-config-1");
    const categories = await client.callTool({ name: "get_categories", arguments: {} });
    assert.equal(categories.isError, undefined);
    assert.match((categories.content as Array<{ text?: string }>)[0]?.text ?? "", /Salário/);

    const writeResult = await client.callTool({ name: "create_income", arguments: {
      idempotencyKey: "income-1", accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "10000",
      categoryId: null, occurredOn: "2026-10-01", description: "Salário",
    } });
    assert.equal(writeResult.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/transactions/income");
    assert.equal(requests.at(-1)?.headers.get("authorization"), `Bearer ${apiToken}`);
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "income-1");
    assert.equal((requests.at(-1)?.body as { source: string }).source, "hermes");

    const payment = await client.callTool({ name: "pay_statement", arguments: {
      idempotencyKey: "statement-payment-1", statementId: "1a6ef40c-371d-4ead-a763-b6be838fdd60",
      fromAccountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "10000",
      occurredOn: "2026-10-01", description: "Pagamento fatura",
    } });
    assert.equal(payment.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/statements/payment");
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "statement-payment-1");
    assert.equal((requests.at(-1)?.body as { source: string }).source, "hermes");

    const preview = await client.callTool({ name: "preview_transaction", arguments: { transaction: {
      operation: "income", accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "10000",
      categoryId: null, occurredOn: "2026-10-01", description: "Prévia",
    } } });
    assert.equal(preview.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/transactions/preview");
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), null);
    assert.equal((requests.at(-1)?.body as { source: string }).source, "hermes");

    const forecasts = await client.callTool({ name: "get_expense_forecasts", arguments: { from: "2026-10-01", to: "2026-10-31", currency: "BRL" } });
    assert.equal(forecasts.isError, undefined);
    assert.match(requests.at(-1)?.url ?? "", /expense-forecasts\?from=2026-10-01&to=2026-10-31&currency=BRL/);
    const forecastWrite = await client.callTool({ name: "create_expense_forecast", arguments: {
      idempotencyKey: "forecast-1", accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", expectedOn: "2026-10-10",
      amountMinor: "2500", categoryId: null, description: "Lanche",
    } });
    assert.equal(forecastWrite.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/expense-forecasts");
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "forecast-1");

    const realized = await client.callTool({ name: "realize_expense_forecast", arguments: {
      forecastId: "4e8a0380-a64a-431c-a0b2-8d8f24faab4a", idempotencyKey: "forecast-realize-1",
      occurredOn: "2026-10-10", paymentMethod: "debit",
    } });
    assert.equal(realized.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/expense-forecasts/4e8a0380-a64a-431c-a0b2-8d8f24faab4a/realize");
    assert.equal((requests.at(-1)?.body as { source: string }).source, "hermes");
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "forecast-realize-1");

    const cancelled = await client.callTool({ name: "cancel_expense_forecast", arguments: {
      forecastId: "4e8a0380-a64a-431c-a0b2-8d8f24faab4a", idempotencyKey: "forecast-cancel-1",
    } });
    assert.notEqual(cancelled.isError, true);
    assert.deepEqual(requests.at(-1)?.body, {});
    assert.match((cancelled.content as Array<{ text?: string }>)[0]?.text ?? "", /"replayed":false/);
    const cancelledReplay = await client.callTool({ name: "cancel_expense_forecast", arguments: {
      forecastId: "4e8a0380-a64a-431c-a0b2-8d8f24faab4a", idempotencyKey: "forecast-cancel-replay-1",
    } });
    assert.notEqual(cancelledReplay.isError, true);
    assert.match((cancelledReplay.content as Array<{ text?: string }>)[0]?.text ?? "", /"replayed":true/);

    const corrected = await client.callTool({ name: "correct_transaction", arguments: {
      idempotencyKey: "correct-1", transactionId: "c32a74c0-cbbb-4ecc-9fbb-6d0e902c65b6",
      reason: "Descrição ajustada", metadata: { description: "Lanche da tarde" }, actor: "forged",
    } });
    assert.equal(corrected.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/transactions/correct");
    assert.equal(Object.hasOwn(requests.at(-1)?.body as object, "actor"), false);
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "correct-1");

    const reversed = await client.callTool({ name: "reverse_transaction", arguments: {
      idempotencyKey: "reverse-1", transactionId: "c32a74c0-cbbb-4ecc-9fbb-6d0e902c65b6",
      occurredOn: "2026-10-02", reason: "Lançamento duplicado", actor: "forged",
    } });
    assert.equal(reversed.isError, undefined);
    assert.equal(requests.at(-1)?.url, "http://web.test/api/v1/transactions/reverse");
    assert.equal(Object.hasOwn(requests.at(-1)?.body as object, "actor"), false);
    assert.equal(requests.at(-1)?.headers.get("idempotency-key"), "reverse-1");

    const apiError = await client.callTool({ name: "get_monthly_summary", arguments: { from: "2026-10-01", to: "2026-10-31" } });
    assert.equal(apiError.isError, true);
    assert.match((apiError.content as Array<{ text?: string }>)[0]?.text ?? "", /NOT_FOUND/);
    assert.doesNotMatch(JSON.stringify(apiError), /api-secret/);

    const invalidJson = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json" }, body: "{",
    });
    assert.equal(invalidJson.status, 400);
    const tooLarge = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json" }, body: JSON.stringify({ data: "x".repeat(65_536) }),
    });
    assert.equal(tooLarge.status, 413);
  } finally {
    await client.close().catch(() => undefined);
    await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
  }
});

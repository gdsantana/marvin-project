import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@finance/domain";
import { GET } from "../app/api/v1/[...path]/route";
import { domainErrorResponse } from "./http";

test("route boundary returns the typed idempotency conflict instead of rejecting", async () => {
  const response = domainErrorResponse(new DomainError("IDEMPOTENCY_CONFLICT", "Chave de idempotência reutilizada com dados diferentes"));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: {
    code: "IDEMPOTENCY_CONFLICT", message: "Chave de idempotência reutilizada com dados diferentes",
  } });
});

test("route boundary maps domain validation failures to 422", async () => {
  const response = domainErrorResponse(new DomainError("INVALID_ACCOUNT_TYPE", "Conta incompatível"));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { ok: false, error: { code: "INVALID_ACCOUNT_TYPE", message: "Conta incompatível" } });
});

test("POST awaits rejected financial writes and returns the domain envelope", async () => {
  const token = process.env.MCP_API_TOKEN;
  const runtime = globalThis as typeof globalThis & { marvinFinance?: unknown; marvinRepository?: unknown };
  const previousService = runtime.marvinFinance;
  const previousRepository = runtime.marvinRepository;
  process.env.MCP_API_TOKEN = "test-api-token-with-at-least-32-bytes-long";
  runtime.marvinRepository = {};
  try {
    for (const [code, status] of [["IDEMPOTENCY_CONFLICT", 409], ["INVALID_ACCOUNT_TYPE", 422]] as const) {
      runtime.marvinFinance = {
        createIncome: async () => { throw new DomainError(code, "domain rejection"); },
        transactionHistory: async () => [],
      };
      const response = await (await import("../app/api/v1/[...path]/route")).POST(new Request("http://localhost/api/v1/transactions/income", {
        method: "POST", headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": `route-${code}` },
        body: JSON.stringify({ accountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "2500", categoryId: null, occurredOn: "2026-10-01", description: "Salário" }),
      }), { params: Promise.resolve({ path: ["transactions", "income"] }) });
      assert.equal(response.status, status);
      assert.equal((await response.json() as { error: { code: string } }).error.code, code);
    }
  } finally {
    if (token === undefined) delete process.env.MCP_API_TOKEN;
    else process.env.MCP_API_TOKEN = token;
    if (previousService === undefined) delete runtime.marvinFinance;
    else runtime.marvinFinance = previousService;
    if (previousRepository === undefined) delete runtime.marvinRepository;
    else runtime.marvinRepository = previousRepository;
  }
});

test("credit purchase maps a DomainError from a second module instance to its typed conflict", async () => {
  const originalToken = process.env.MCP_API_TOKEN;
  const runtime = globalThis as typeof globalThis & { marvinFinance?: unknown; marvinRepository?: unknown };
  const previousService = runtime.marvinFinance;
  const previousRepository = runtime.marvinRepository;
  process.env.MCP_API_TOKEN = "test-api-token-with-at-least-32-bytes-long";
  runtime.marvinRepository = {};
  runtime.marvinFinance = {
    createCreditPurchase: async () => { throw { name: "DomainError", code: "CONFLICT", message: "Não é possível alterar uma fatura fechada" }; },
  };
  try {
    const response = await (await import("../app/api/v1/[...path]/route")).POST(new Request("http://localhost/api/v1/transactions/credit-purchase", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": "closed-statement-purchase" },
      body: JSON.stringify({
        occurredOn: "2026-10-25", description: "Three installments", source: "manual", cardAccountId: "3b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54",
        totalAmountMinor: "100000", installmentCount: 3,
        allocations: [{ categoryId: "4b68c5e8-e4b7-43f1-8ce8-e8d16a0cba54", amountMinor: "100000" }],
      }),
    }), { params: Promise.resolve({ path: ["transactions", "credit-purchase"] }) });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { ok: false, error: { code: "CONFLICT", message: "Não é possível alterar uma fatura fechada" } });
  } finally {
    if (originalToken === undefined) delete process.env.MCP_API_TOKEN;
    else process.env.MCP_API_TOKEN = originalToken;
    if (previousService === undefined) delete runtime.marvinFinance;
    else runtime.marvinFinance = previousService;
    if (previousRepository === undefined) delete runtime.marvinRepository;
    else runtime.marvinRepository = previousRepository;
  }
});

test("a failed session lookup stays a JSON 401 at the GET handler boundary", async () => {
  const originalToken = process.env.MCP_API_TOKEN;
  delete process.env.MCP_API_TOKEN;
  try {
    const response = await GET(new Request("http://localhost/api/v1/accounts"), { params: Promise.resolve({ path: ["accounts"] }) });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: { code: "UNAUTHENTICATED", message: "Entre para continuar." } });
  } finally {
    if (originalToken === undefined) delete process.env.MCP_API_TOKEN;
    else process.env.MCP_API_TOKEN = originalToken;
  }
});

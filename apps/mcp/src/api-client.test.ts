import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { WebApiClient, WebApiError } from "./api-client.js";

test("POST requires idempotency unless explicitly marked as preview", async () => {
  let sentHeaders: HeadersInit | undefined;
  const client = new WebApiClient("http://web:3000/api/", "api-secret", async (_input, init) => {
    sentHeaders = init?.headers;
    return Response.json({ ok: true, data: { ready: true } });
  });

  await assert.rejects(client.request("preview", z.object({ ready: z.boolean() }), { method: "POST", body: {} }), /idempotência/);
  assert.deepEqual(await client.request("write", z.object({ ready: z.boolean() }), { method: "POST", body: {}, idempotencyKey: "request-1" }), { ready: true });
  assert.equal(new Headers(sentHeaders).get("authorization"), "Bearer api-secret");
  assert.equal(new Headers(sentHeaders).get("idempotency-key"), "request-1");
});

test("typed idempotency conflicts survive the HTTP client boundary", async () => {
  const client = new WebApiClient("http://web:3000/api/", "api-secret", async () => Response.json({
    ok: false, error: { code: "IDEMPOTENCY_CONFLICT", message: "Chave de idempotência reutilizada com dados diferentes" },
  }, { status: 409 }));
  await assert.rejects(
    client.request("v1/transactions/income", z.object({ id: z.string() }), { method: "POST", body: {}, idempotencyKey: "same-key" }),
    error => error instanceof WebApiError && error.status === 409 && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type { createAuthRepository } from "@finance/db";
import { POST } from "../app/api/auth/login/route";

test("login route rejects missing credentials and origins, sets secure cookies, and distinguishes failures", async () => {
  const runtime = globalThis as typeof globalThis & { marvinAuth?: ReturnType<typeof createAuthRepository> };
  const previous = runtime.marvinAuth;
  const origin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://marvin.test";
  let calls = 0;
  let status: "authenticated" | "invalid" | "rate_limited" | "unavailable" = "authenticated";
  runtime.marvinAuth = {
    async login(username, password) {
      calls++;
      assert.equal(username, "owner");
      assert.equal(password, " secret ");
      if (status === "unavailable") throw new Error("private database error");
      return status === "authenticated" ? { status, token: "test-token", csrfToken: "csrf" } : { status };
    },
    async readSession() { return null; },
    async revokeSession() {},
  };
  const request = (body: unknown, allowed = true) => new NextRequest("https://marvin.test/api/auth/login", { method: "POST", headers: { origin: allowed ? "https://marvin.test" : "https://evil.test", "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await POST(request({ password: "secret" }))).status, 400);
    assert.equal((await POST(request({ username: "owner", password: " secret " }, false))).status, 403);
    assert.equal(calls, 0);
    const response = await POST(request({ username: " Owner ", password: " secret " }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
    assert.match(response.headers.get("set-cookie")!, /SameSite=strict/i);
    assert.equal(response.headers.get("cache-control"), "no-store");
    status = "invalid";
    assert.equal((await POST(request({ username: "owner", password: " secret " }))).status, 401);
    status = "rate_limited";
    const limited = await POST(request({ username: "owner", password: " secret " }));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "900");
    status = "unavailable";
    const unavailable = await POST(request({ username: "owner", password: " secret " }));
    assert.equal(unavailable.status, 503);
    assert.doesNotMatch(await unavailable.text(), /private database error/);
  } finally {
    if (previous === undefined) delete runtime.marvinAuth; else runtime.marvinAuth = previous;
    if (origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = origin;
  }
});

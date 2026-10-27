import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLoginRateLimit, clearLoginFailures, csrfIsValid, hashPassword, originIsAllowed, readSession, recordLoginFailure, signSession, verifyPassword } from "./auth";
import { readJsonBody } from "./http";

process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-bytes";
process.env.APP_ORIGIN = "https://marvin.test";

test("scrypt password hashes verify only the matching password", async () => {
  const hash = await hashPassword("senha de teste");
  assert.equal(await verifyPassword("senha de teste", hash), true);
  assert.equal(await verifyPassword("outra senha", hash), false);
});

test("signed sessions reject tampering and expired sessions", () => {
  const valid = signSession({ expiresAt: Date.now() + 60_000, csrfToken: "csrf" });
  assert.equal(readSession(valid)?.csrfToken, "csrf");
  assert.equal(readSession(`${valid}x`), null);
  assert.equal(readSession(signSession({ expiresAt: Date.now() - 1, csrfToken: "csrf" })), null);
});

test("writes require a same-origin request and the session CSRF token", () => {
  const session = { expiresAt: Date.now() + 60_000, csrfToken: "csrf" };
  const valid = new Request("https://marvin.test/api/items", { method: "POST", headers: { origin: "https://marvin.test", "x-csrf-token": "csrf" } });
  const badOrigin = new Request("https://marvin.test/api/items", { method: "POST", headers: { origin: "https://attacker.test", "x-csrf-token": "csrf" } });
  assert.equal(csrfIsValid(valid, session, "csrf"), true);
  assert.equal(csrfIsValid(badOrigin, session, "csrf"), false);
  assert.equal(csrfIsValid(valid, session, "wrong"), false);
});

test("origin checks use APP_ORIGIN and fail closed when origin is absent or malformed", () => {
  assert.equal(originIsAllowed(new Request("https://marvin.test/api", { headers: { origin: "https://marvin.test" } })), true);
  assert.equal(originIsAllowed(new Request("https://marvin.test/api", { headers: { origin: "https://other.test" } })), false);
  assert.equal(originIsAllowed(new Request("https://marvin.test/api")), false);
  process.env.APP_ORIGIN = "not a URL";
  assert.equal(originIsAllowed(new Request("https://marvin.test/api", { headers: { origin: "https://marvin.test" } })), false);
  process.env.APP_ORIGIN = "https://marvin.test";
});

test("login failures are globally rate limited without trusting proxy headers", () => {
  const key = "test-login-limit";
  clearLoginFailures(key);
  const now = 10_000;
  assert.equal(checkLoginRateLimit(key, now), true);
  for (let attempt = 0; attempt < 5; attempt++) recordLoginFailure(key, now + attempt);
  assert.equal(checkLoginRateLimit(key, now + 6), false);
  clearLoginFailures(key);
});

test("JSON bodies reject malformed and oversized payloads", async () => {
  const valid = await readJsonBody(new Request("https://marvin.test", { method: "POST", body: JSON.stringify({ amountMinor: "5000" }) }), 100);
  const malformed = await readJsonBody(new Request("https://marvin.test", { method: "POST", body: "{" }), 100);
  const oversized = await readJsonBody(new Request("https://marvin.test", { method: "POST", body: "123456" }), 4);
  assert.deepEqual(valid, { ok: true, data: { amountMinor: "5000" } });
  assert.deepEqual(malformed, { ok: false, status: 400 });
  assert.deepEqual(oversized, { ok: false, status: 413 });
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { createDatabase } from "./client.js";
import { createAuthRepository, provisionOwner } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";

test("password hashes use explicit scrypt costs and reject malformed hashes", async () => {
  const hash = await hashPassword("a long test password");
  assert.equal(await verifyPassword("a long test password", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("wrong", hash + "$ignored"), false);
  assert.equal(await verifyPassword("wrong", "scrypt$bad"), false);
});

const url = process.env.DATABASE_URL_TEST;
test("owner login persists limits and revocable sessions without creating a second owner", { skip: !url }, async () => {
  const admin = new Pool({ connectionString: url });
  const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const { db, pool } = createDatabase(url!, { options: `-c search_path=${schema}` });
  try {
    await pool.query(await readFile(new URL("../migrations/0003_local_auth.sql", import.meta.url), "utf8"));
    const auth = createAuthRepository(db);
    await provisionOwner(db, "owner", "a long test password");
    await assert.rejects(provisionOwner(db, "another", "a long test password"));
    await assert.rejects(pool.query("INSERT INTO auth_users (username, password_hash) VALUES ('another', 'hash')"));
    assert.deepEqual(await auth.login("unknown", "wrong"), { status: "invalid" });
    assert.deepEqual(await auth.login("owner", "wrong"), { status: "invalid" });
    const login = await auth.login("owner", "a long test password");
    assert.equal(login.status, "authenticated");
    if (login.status !== "authenticated") throw new Error("login failed");
    const session = await createAuthRepository(db).readSession(login.token);
    assert.equal(session?.username, "owner");
    assert.match(session!.userId, /^[a-f0-9-]{36}$/);
    assert.equal(await auth.readSession(`${login.token}x`), null);
    assert.notEqual((await pool.query("SELECT token_hash FROM auth_sessions")).rows[0].token_hash, login.token);
    await auth.revokeSession(login.token);
    assert.equal(await auth.readSession(login.token), null);
    const next = await auth.login("owner", "a long test password");
    assert.equal(next.status, "authenticated");
    if (next.status !== "authenticated") throw new Error("login failed");
    await provisionOwner(db, "owner", "another long password", true);
    assert.equal(await auth.readSession(next.token), null);
    assert.deepEqual(await auth.login("owner", "a long test password"), { status: "invalid" });
    await pool.query("DELETE FROM auth_login_attempts");
    const attempts = await Promise.all(Array.from({ length: 9 }, () => createAuthRepository(db).login("unknown", "wrong")));
    assert.equal(attempts.filter(attempt => attempt.status === "invalid").length, 5);
    assert.equal(attempts.filter(attempt => attempt.status === "rate_limited").length, 4);
    assert.deepEqual(await createAuthRepository(db).login("owner", "another long password"), { status: "rate_limited" });
    await pool.query("UPDATE auth_login_attempts SET reset_at = now() - interval '1 second'");
    const renewed = await auth.login("owner", "another long password");
    assert.equal(renewed.status, "authenticated");
    if (renewed.status !== "authenticated") throw new Error("login failed");
    await pool.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second'");
    assert.equal(await auth.readSession(renewed.token), null);
    await pool.query("UPDATE auth_users SET is_active = false");
    assert.deepEqual(await auth.login("owner", "another long password"), { status: "invalid" });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});

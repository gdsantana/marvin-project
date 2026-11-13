import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordVerifier, requireMigrationDatabaseUrl } from "./database-roles.js";

test("migration connection never falls back to the Web credential and errors hide secrets", () => {
  assert.throws(() => requireMigrationDatabaseUrl({ DATABASE_URL: "postgresql://private-secret@localhost/db" }), /MIGRATION_DATABASE_URL/);
  assert.throws(() => requireMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: "private-secret" }), error => error instanceof Error && !error.message.includes("private-secret"));
  assert.equal(requireMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: "postgresql://localhost/db" }), "postgresql://localhost/db");
});

test("role password verifiers are salted SCRAM and reject ambiguous or short passwords", () => {
  const password = "a".repeat(64);
  const first = passwordVerifier(password);
  assert.match(first, /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
  assert.notEqual(first, passwordVerifier(password));
  assert.ok(!first.includes(password));
  for (const invalid of ["short", "a".repeat(129), "a".repeat(32) + "'", "é".repeat(32)]) assert.throws(() => passwordVerifier(invalid));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerDatabaseUrl, OwnerProvisionError, ownerProvisionErrorMessage } from "./provision-config.js";

test("owner provisioning selects the development connection only outside production", () => {
  const env = { DATABASE_URL: "postgresql://db/private", DEVELOPMENT_DATABASE_URL: "postgresql://127.0.0.1/local" };
  assert.equal(ownerDatabaseUrl(env), env.DEVELOPMENT_DATABASE_URL);
  assert.equal(ownerDatabaseUrl({ ...env, NODE_ENV: "production" }), env.DATABASE_URL);
  assert.equal(ownerDatabaseUrl({ DATABASE_URL: env.DATABASE_URL }), env.DATABASE_URL);
  assert.throws(() => ownerDatabaseUrl({}), OwnerProvisionError);
  assert.throws(() => ownerDatabaseUrl({ DATABASE_URL: "private-secret" }), OwnerProvisionError);
});

test("provisioning errors identify safe causes without exposing driver messages", () => {
  for (const [code, expected] of [["ECONNREFUSED", /pnpm db:up/], ["EAI_AGAIN", /Compose/], ["42P01", /migrate/], ["28P01", /credenciais/], ["23505", /reset-password/]] as const) {
    const error = new Error("postgresql://private:secret@host/db");
    Object.assign(error, { code });
    const message = ownerProvisionErrorMessage(new Error("SQL payload", { cause: error }));
    assert.match(message, expected!);
    assert.doesNotMatch(message, /private|secret|SQL payload/);
  }
  assert.equal(ownerProvisionErrorMessage(new OwnerProvisionError("As senhas não coincidem.")), "As senhas não coincidem.");
  assert.doesNotMatch(ownerProvisionErrorMessage(new Error("private secret")), /private|secret/);
});

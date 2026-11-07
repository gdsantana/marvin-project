import assert from "node:assert/strict";
import { test } from "node:test";
import { configureDevelopmentDatabase } from "./database-url";

test("host development replaces only the Compose database address", () => {
  const env = { NODE_ENV: "development", DATABASE_URL: "postgresql://db/marvin", DEVELOPMENT_DATABASE_URL: "postgresql://127.0.0.1/marvin" };
  configureDevelopmentDatabase(env);
  assert.equal(env.DATABASE_URL, env.DEVELOPMENT_DATABASE_URL);
  for (const databaseUrl of ["postgresql://127.0.0.1/disposable", "postgresql://another-host/marvin", "invalid"]) {
    const explicit = { ...env, DATABASE_URL: databaseUrl };
    configureDevelopmentDatabase(explicit);
    assert.equal(explicit.DATABASE_URL, databaseUrl);
  }
  const production = { ...env, NODE_ENV: "production", DATABASE_URL: "postgresql://db/marvin" };
  configureDevelopmentDatabase(production);
  assert.equal(production.DATABASE_URL, "postgresql://db/marvin");
  const missing = { DATABASE_URL: "postgresql://db/marvin" };
  configureDevelopmentDatabase(missing);
  assert.equal(missing.DATABASE_URL, "postgresql://db/marvin");
});

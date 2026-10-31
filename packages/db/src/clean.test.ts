import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { developmentDatabaseErrorMessage, developmentDatabaseUrl } from "./clean.js";

test("development database commands require opt-in, reject production and remote targets", () => {
  const env = { DATABASE_URL: "postgresql://localhost/marvin_dev", SEED_DEVELOPMENT: "true", NODE_ENV: "test" };
  assert.equal(developmentDatabaseUrl(env), env.DATABASE_URL);
  assert.throws(() => developmentDatabaseUrl({ ...env, SEED_DEVELOPMENT: undefined }));
  assert.throws(() => developmentDatabaseUrl({ ...env, NODE_ENV: "production" }));
  assert.throws(() => developmentDatabaseUrl({ ...env, DATABASE_URL: undefined }));
  for (const target of ["postgresql://remote.example/marvin", "https://localhost/marvin", "not-a-url", "postgresql://localhost/marvin?host=remote.example"]) {
    assert.throws(() => developmentDatabaseUrl({ ...env, DATABASE_URL: target }));
  }
  for (const host of ["127.0.0.1", "[::1]"]) {
    const DATABASE_URL = `postgresql://${host}/marvin_dev`;
    assert.equal(developmentDatabaseUrl({ ...env, DATABASE_URL }), DATABASE_URL);
  }
});

test("development commands explain Compose URLs without leaking credentials", () => {
  for (const DATABASE_URL of ["postgresql://user:secret@db/marvin", "not-a-url-secret", "postgresql://user:secret@remote.example/marvin"]) {
    let failure: unknown;
    try { developmentDatabaseUrl({ DATABASE_URL, SEED_DEVELOPMENT: "true" }); }
    catch (error) { failure = error; }
    assert.ok(failure instanceof Error);
    const message = developmentDatabaseErrorMessage(failure);
    assert.ok(!message.includes("secret"));
    if (DATABASE_URL.includes("@db/")) assert.match(message, /Docker Compose.*localhost.*porta/);
    else assert.match(message, /PostgreSQL local/);
  }
});

test("development commands report safe causes from wrapped driver errors", () => {
  for (const [code, expected] of [
    ["ECONNREFUSED", /Conexão recusada/], ["ENOTFOUND", /Host.*não encontrado/],
    ["28P01", /Autenticação recusada/], ["42P01", /db:migrate/], ["42501", /Permissão insuficiente/],
  ] as const) {
    const cause = Object.assign(new Error("private-driver-payload"), { code });
    const error = new Error("private-sql", { cause });
    const message = developmentDatabaseErrorMessage(error);
    assert.match(message, expected);
    assert.ok(!message.includes("private"));
  }
  assert.ok(!developmentDatabaseErrorMessage(new Error("private-connection-string")).includes("private"));
});

test("clean and seed CLIs show the Compose configuration error before connecting", () => {
  for (const command of ["clean", "seed"]) {
    const env: NodeJS.ProcessEnv = { ...process.env, DEVELOPMENT_DATABASE_URL: undefined, DATABASE_URL: "postgresql://user:secret@db/marvin", SEED_DEVELOPMENT: "true", NODE_ENV: "test" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL(`./${command}.ts`, import.meta.url))], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Docker Compose.*localhost.*porta/);
    assert.ok(!result.stderr.includes("secret"));
  }
});

test("explicit development URL takes priority over the Compose URL", () => {
  const env = { DATABASE_URL: "postgresql://db/marvin", DEVELOPMENT_DATABASE_URL: "postgresql://localhost/marvin", SEED_DEVELOPMENT: "true" };
  assert.equal(developmentDatabaseUrl(env), env.DEVELOPMENT_DATABASE_URL);
  assert.throws(() => developmentDatabaseUrl({ ...env, NODE_ENV: "production" }));
});

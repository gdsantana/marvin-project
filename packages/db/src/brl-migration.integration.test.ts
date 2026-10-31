import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL_TEST;

test("BRL migration rejects existing foreign-currency accounts without changing data", { skip: !databaseUrl }, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schemaName = `marvin_brl_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schemaName}` });

  try {
    const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));
    const migrationFiles = (await readdir(migrationsDirectory)).filter(file => /^000[01]_.*\.sql$/.test(file)).sort();
    for (const file of migrationFiles) {
      const migration = await readFile(`${migrationsDirectory}/${file}`, "utf8");
      for (const statement of migration.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) await pool.query(statement);
    }

    const accountId = randomUUID();
    await pool.query("INSERT INTO accounts (id, name, type, currency, opening_date) VALUES ($1, 'Legacy EUR', 'checking', 'EUR', '2026-01-01')", [accountId]);
    const migration = await readFile(`${migrationsDirectory}/0002_brl_only.sql`, "utf8");
    await pool.query("BEGIN");
    await assert.rejects(async () => {
      for (const statement of migration.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) await pool.query(statement);
    }, /BRL migration blocked/);
    await pool.query("ROLLBACK");

    const { rows } = await pool.query("SELECT currency FROM accounts WHERE id = $1", [accountId]);
    assert.equal(rows[0]?.currency, "EUR");
    const { rows: constraints } = await pool.query("SELECT 1 FROM pg_constraint WHERE conname = 'accounts_currency_brl' AND connamespace = $1::regnamespace", [schemaName]);
    assert.equal(constraints.length, 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await admin.end();
  }
});

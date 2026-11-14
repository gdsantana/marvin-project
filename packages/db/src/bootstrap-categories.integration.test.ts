import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Pool } from "pg";
import { createDatabase } from "./client.js";
import { bootstrapCategories } from "./bootstrap-categories.js";

const url = process.env.DATABASE_URL_TEST;
test("category bootstrap preserves existing data and supports concurrent replays atomically", { skip: !url }, async () => {
  const admin = new Pool({ connectionString: url });
  const schema = `bootstrap_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const { db, pool } = createDatabase(url!, { options: `-c search_path=${schema}` });
  try {
    const dir = fileURLToPath(new URL("../migrations", import.meta.url));
    for (const file of (await readdir(dir)).filter(name => name.endsWith(".sql")).sort()) {
      for (const statement of (await readFile(`${dir}/${file}`, "utf8")).split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await pool.query(statement);
    }
    const adjustmentMigration = await readFile(`${dir}/0004_statement_adjustment_category.sql`, "utf8");
    await pool.query(adjustmentMigration);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM categories WHERE name = 'Ajuste de fatura' AND type = 'expense' AND parent_id IS NULL")).rows[0].count, 1);
    await pool.query("INSERT INTO institutions (name) VALUES ('Banco existente')");
    await pool.query("INSERT INTO categories (name, type, is_archived) VALUES (' salário ', 'income', true), ('Personalizada', 'expense', false), ('Salário', 'expense', false)");
    const before = (await pool.query("SELECT * FROM categories ORDER BY id")).rows;
    const results = await Promise.all([bootstrapCategories(db), bootstrapCategories(db)]);
    assert.equal(results.reduce((sum, n) => sum + n, 0), 12);
    assert.equal(await bootstrapCategories(db), 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM categories")).rows[0].count, 16);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM institutions")).rows[0].count, 1);
    for (const row of before) assert.deepEqual((await pool.query("SELECT * FROM categories WHERE id = $1", [row.id])).rows[0], row);

    await pool.query("DELETE FROM categories WHERE name IN ('Alimentação', 'Mercado')");
    await pool.query("ALTER TABLE categories ADD CONSTRAINT reject_market CHECK (name <> 'Mercado')");
    await assert.rejects(bootstrapCategories(db));
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM categories WHERE name = 'Alimentação'")).rows[0].count, 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});

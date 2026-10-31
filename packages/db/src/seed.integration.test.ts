import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Pool } from "pg";
import { FinanceService } from "@finance/domain";
import { createDatabase } from "./client.js";
import { cleanDevelopment } from "./clean.js";
import { createFinanceRepository } from "./repositories.js";
import { seedDevelopment } from "./seed.js";

const url = process.env.DATABASE_URL_TEST;
const scenarios = [
  { now: "2026-10-31T15:00:00Z", months: ["2026-08", "2026-09", "2026-10"], today: "2026-10-31" },
  { now: "2027-01-01T15:00:00Z", months: ["2026-11", "2026-12", "2027-01"], today: "2027-01-01" },
  { now: "2028-03-01T01:00:00Z", months: ["2027-12", "2028-01", "2028-02"], today: "2028-02-29" },
];
for (const scenario of scenarios) test(`development seed: ${scenario.today}`, { skip: !url }, async () => {
  const admin = new Pool({ connectionString: url });
  const schema = `seed_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const { db, pool } = createDatabase(url!, { options: `-c search_path=${schema}` });
  const env = { DATABASE_URL: url!, SEED_DEVELOPMENT: "true", NODE_ENV: "test" };
  try {
    const dir = fileURLToPath(new URL("../migrations", import.meta.url));
    for (const file of (await readdir(dir)).filter(name => name.endsWith(".sql")).sort()) {
      for (const statement of (await readFile(`${dir}/${file}`, "utf8")).split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await pool.query(statement);
    }
    await pool.query('CREATE TABLE __drizzle_migrations (id int); INSERT INTO __drizzle_migrations VALUES (1)');
    const service = new FinanceService(createFinanceRepository(db));
    const now = new Date(scenario.now);
    const seed = () => seedDevelopment(service, now);
    await cleanDevelopment(db, env);
    await seed();
    await seed();
    const assertSeed = async () => {
      const counts = await pool.query("SELECT (SELECT count(*) FROM institutions)::int AS institutions, (SELECT count(*) FROM accounts)::int AS accounts, (SELECT count(*) FROM categories)::int AS categories, (SELECT count(*) FROM transactions)::int AS transactions, (SELECT count(*) FROM installment_plans)::int AS plans, (SELECT count(*) FROM statement_payments)::int AS payments");
      assert.deepEqual(counts.rows[0], { institutions: 2, accounts: 4, categories: 13, transactions: 34, plans: 12, payments: 4 });
      const balances = await pool.query("SELECT a.type, a.opening_balance_minor + COALESCE(sum(e.amount_minor), 0) AS balance FROM accounts a LEFT JOIN account_entries e ON e.account_id = a.id GROUP BY a.id");
      assert.ok(balances.rows.every(row => row.type === "checking" ? BigInt(row.balance) > 0n : BigInt(row.balance) < 0n));
      const invalid = await pool.query("SELECT count(*)::int AS count FROM installment_plans p WHERE p.total_amount_minor <> (SELECT sum(i.amount_minor) FROM card_statement_items i WHERE i.installment_plan_id = p.id)");
      assert.equal(invalid.rows[0].count, 0);
      const dates = await pool.query("SELECT DISTINCT to_char(occurred_on, 'YYYY-MM') AS month FROM transactions ORDER BY month");
      assert.deepEqual(dates.rows.map(row => row.month), scenario.months);
      const future = await pool.query("SELECT count(*)::int AS count FROM transactions WHERE occurred_on > $1", [scenario.today]);
      assert.equal(future.rows[0].count, 0);
      const statements = await pool.query("SELECT id, to_char(closing_on, 'YYYY-MM') AS month, status FROM card_statements ORDER BY closing_on");
      assert.equal(statements.rowCount, 6);
      for (const row of statements.rows) {
        const current = row.month === scenario.months[2];
        assert.equal(row.status, current ? "open" : "paid");
        const detail = await service.statementDetail(row.id);
        assert.equal(detail.remainingMinor, current ? detail.billedMinor : 0n);
        assert.equal(detail.payments.length, current ? 0 : 1);
      }
      for (const [index, month] of scenario.months.entries()) {
        const delta = BigInt(index) * 1000n;
        const report = await service.monthlyReport(`${month}-01`, `${month}-31`);
        assert.deepEqual(report.BRL, {
          incomeMinor: (735000n + 2n * delta).toString(),
          expenseMinor: (284283n + 8n * delta).toString(),
          netMinor: (450717n - 6n * delta).toString(),
        });
        const salary = await pool.query("SELECT count(*)::int AS count FROM transactions t JOIN category_allocations a ON a.transaction_id = t.id JOIN categories c ON c.id = a.category_id WHERE c.name = 'Salário' AND to_char(t.occurred_on, 'YYYY-MM') = $1", [month]);
        assert.equal(salary.rows[0].count, 1);
      }
    };
    await assertSeed();
    // Include rows outside the fixture so cleanup cannot only delete seeded IDs.
    await service.createCategory({ name: "Categoria manual", type: "expense", parentId: null }, "manual-category");
    await cleanDevelopment(db, env);
    await cleanDevelopment(db, env);
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '__drizzle_migrations'");
    for (const { tablename } of tables.rows) {
      const result = await pool.query(`SELECT count(*)::int AS count FROM "${tablename}"`);
      assert.equal(result.rows[0].count, 0, tablename);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM __drizzle_migrations")).rows[0].count, 1);
    await seed();
    await assertSeed();
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});

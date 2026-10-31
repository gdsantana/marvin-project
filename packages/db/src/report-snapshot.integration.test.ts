import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Pool } from "pg";
import { FinanceService, type FinanceRepository } from "@finance/domain";
import { createDatabase } from "./client.js";
import { createFinanceRepository } from "./repositories.js";

const url = process.env.DATABASE_URL_TEST;

test("summary retains one PostgreSQL snapshot while a concurrent income commits", { skip: !url }, async () => {
  const admin = new Pool({ connectionString: url });
  const schema = `snapshot_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const { db, pool } = createDatabase(url!, { options: `-c search_path=${schema}` });
  try {
    const dir = fileURLToPath(new URL("../migrations", import.meta.url));
    for (const file of (await readdir(dir)).filter(name => name.endsWith(".sql")).sort()) {
      for (const statement of (await readFile(`${dir}/${file}`, "utf8")).split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) await pool.query(statement);
    }
    const repository = createFinanceRepository(db);
    const writer = new FinanceService(repository);
    const accountId = await writer.createAccount({ name: "Snapshot", type: "checking", currency: "BRL", openingBalanceMinor: 1000n, openingDate: "2026-10-01", institutionId: null }, "snapshot-account");
    const income = { accountId, occurredOn: "2026-10-10", description: "Snapshot income", source: "manual" as const, reviewStatus: "confirmed" as const, categoryId: null };
    await writer.createIncome({ ...income, amountMinor: "500" }, "snapshot-before");
    let loads = 0;
    const interleaved: FinanceRepository = {
      transaction: work => repository.transaction(tx => work({ ...tx, reporting: {
        load: async () => {
          loads++;
          const snapshot = await tx.reporting.load();
          await writer.createIncome({ ...income, amountMinor: "100" }, "snapshot-concurrent");
          return snapshot;
        },
      } })),
    };
    const summary = await new FinanceService(interleaved).monthlySummary("2026-10-01", "2026-10-31");
    assert.equal(loads, 1);
    assert.equal(summary.incomeMinorByCurrency.BRL, "500");
    assert.equal(summary.balancesByCurrency.BRL, "1500");
    const after = await writer.monthlySummary("2026-10-01", "2026-10-31");
    assert.equal(after.incomeMinorByCurrency.BRL, "600");
    assert.equal(after.balancesByCurrency.BRL, "1600");
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});

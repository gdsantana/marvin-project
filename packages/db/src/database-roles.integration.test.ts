import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool, escapeIdentifier } from "pg";
import { provisionDatabaseRoles } from "./database-roles.js";
import { migrateDatabase } from "./migrate-database.js";
import { createDatabase } from "./client.js";
import { createAuthRepository, provisionOwner } from "./auth.js";
import { createFinanceRepository } from "./repositories.js";
import { FinanceService } from "@finance/domain";

const adminUrl = process.env.DATABASE_URL_TEST;

test("database roles isolate runtime from migrations and keep login and finance working", { skip: !adminUrl }, async () => {
  const admin = new Pool({ connectionString: adminUrl });
  assert.equal((await admin.query("SELECT 1 FROM pg_roles WHERE rolname IN ('marvin_app', 'marvin_migrator')")).rowCount, 0, "Use an isolated cluster without existing Marvin roles");
  const database = `roles_test_${randomUUID().replaceAll("-", "")}`;
  const appPassword = "app-test-password-" + "a".repeat(32);
  const migrationPassword = "migration-test-password-" + "b".repeat(32);
  const url = new URL(adminUrl!);
  url.pathname = `/${database}`;
  await admin.query(`CREATE DATABASE ${escapeIdentifier(database)}`);
  const operator = new Pool({ connectionString: url.href });
  const connection = (user: string, password: string) => {
    const result = new URL(url);
    result.username = user; result.password = password;
    return result.href;
  };
  let app: ReturnType<typeof createDatabase> | undefined;
  const migrator = new Pool({ connectionString: connection("marvin_migrator", migrationPassword) });
  try {
    await provisionDatabaseRoles(operator, { appPassword, migrationPassword });
    await migrateDatabase(connection("marvin_migrator", migrationPassword));
    await migrateDatabase(connection("marvin_migrator", migrationPassword));
    await provisionDatabaseRoles(operator, { appPassword, migrationPassword });
    await assert.rejects(migrateDatabase(connection("marvin_app", appPassword)), /marvin_migrator/);
    await migrator.query("CREATE TABLE public.future_table (id integer)");
    app = createDatabase(connection("marvin_app", appPassword));
    for (const query of [
      "CREATE TABLE public.forbidden (id integer)", "CREATE TEMP TABLE forbidden (id integer)",
      "ALTER TABLE accounts ADD COLUMN forbidden integer", "TRUNCATE accounts",
      "DROP TABLE accounts", "CREATE ROLE forbidden_role", "SET ROLE marvin_migrator", "GRANT marvin_migrator TO marvin_app",
      "SELECT * FROM drizzle.__drizzle_migrations", "SELECT * FROM public.future_table",
      "UPDATE auth_users SET password_hash = 'forbidden'", "DELETE FROM transactions",
      "ALTER TABLE account_entries DISABLE TRIGGER ALL",
    ]) await assert.rejects(app.pool.query(query), { code: "42501" });

    const management = createDatabase(connection("marvin_migrator", migrationPassword));
    try { await provisionOwner(management.db, "owner", "a long test password"); }
    finally { await management.pool.end(); }
    const auth = createAuthRepository(app.db);
    const login = await auth.login("owner", "a long test password");
    assert.equal(login.status, "authenticated");
    if (login.status !== "authenticated") throw new Error("login failed");
    assert.equal((await auth.readSession(login.token))?.username, "owner");
    await auth.revokeSession(login.token);
    assert.equal(await auth.readSession(login.token), null);

    const service = new FinanceService(createFinanceRepository(app.db));
    const checking = await service.createAccount({ name: "Checking", type: "checking", currency: "BRL", openingBalanceMinor: 100000n, openingDate: "2026-01-01", institutionId: null }, "role-checking");
    const savings = await service.createAccount({ name: "Savings", type: "savings", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null }, "role-savings");
    const category = await service.createCategory({ name: "General", type: "expense", parentId: null }, "role-category");
    const card = await service.createAccount({ name: "Card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: 100000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "role-card");
    const meta = { occurredOn: "2026-01-05", description: "Role fixture", source: "manual" as const, reviewStatus: "confirmed" as const };
    await service.createIncome({ ...meta, accountId: checking, amountMinor: "1000", categoryId: null }, "role-income");
    await service.createExpense({ ...meta, accountId: checking, amountMinor: "500", paymentMethod: "debit", allocations: [{ categoryId: category, amountMinor: "500" }] }, "role-expense");
    await service.createTransfer({ ...meta, fromAccountId: checking, toAccountId: savings, amountMinor: "200" }, "role-transfer");
    const purchase = await service.createCreditPurchase({ ...meta, cardAccountId: card, totalAmountMinor: "1200", installmentCount: 2, allocations: [{ categoryId: category, amountMinor: "1200" }] }, "role-purchase");
    const replay = await service.createCreditPurchase({ ...meta, cardAccountId: card, totalAmountMinor: "1200", installmentCount: 2, allocations: [{ categoryId: category, amountMinor: "1200" }] }, "role-purchase");
    assert.equal(replay.replayed, true);
    await service.createRefund({ ...meta, originalTransactionId: purchase.value.transaction.id, accountId: card, amountMinor: "100" }, "role-refund");
    await service.closeStatement(purchase.value.items[0]!.statementId, "role-close");
    await service.payStatement({ ...meta, statementId: purchase.value.items[0]!.statementId, fromAccountId: checking, amountMinor: "100" }, "role-payment");
    assert.equal(await service.accountBalance(card), -1000n);
    const permissions = await app.pool.query("SELECT has_table_privilege(current_user, 'account_entries', 'UPDATE') AS mutable, has_schema_privilege(current_user, 'public', 'CREATE') AS ddl");
    assert.deepEqual(permissions.rows[0], { mutable: false, ddl: false });
  } finally {
    await app?.pool.end(); await migrator.end(); await operator.end();
    await admin.query(`DROP DATABASE ${escapeIdentifier(database)} WITH (FORCE)`);
    // Roles are cluster-global. This test uses only the disposable test cluster.
    await admin.query("DROP ROLE IF EXISTS marvin_app, marvin_migrator");
    await admin.end();
  }
});


test("legacy ownership adoption is explicit, atomic and preserves financial rows", { skip: !adminUrl }, async () => {
  const admin = new Pool({ connectionString: adminUrl });
  const database = `legacy_roles_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(adminUrl!); url.pathname = `/${database}`;
  await admin.query(`CREATE DATABASE ${escapeIdentifier(database)}`);
  const legacy = new Pool({ connectionString: url.href });
  let created = false;
  try {
    const folder = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(folder)).filter(name => name.endsWith(".sql")).sort()) {
      for (const query of (await readFile(new URL(name, folder), "utf8")).split("--> statement-breakpoint").filter(part => part.trim())) await legacy.query(query);
    }
    await legacy.query("CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)");
    const id = randomUUID();
    await legacy.query("INSERT INTO institutions(id, name) VALUES ($1, 'Existing institution')", [id]);
    const passwords = { appPassword: "a".repeat(64), migrationPassword: "b".repeat(64) };
    await assert.rejects(provisionDatabaseRoles(legacy, passwords), /adopt-existing/);
    assert.equal((await legacy.query("SELECT 1 FROM pg_roles WHERE rolname IN ('marvin_app', 'marvin_migrator')")).rowCount, 0);
    await provisionDatabaseRoles(legacy, { ...passwords, adoptExisting: true });
    created = true;
    assert.equal((await legacy.query("SELECT name FROM institutions WHERE id = $1", [id])).rows[0].name, "Existing institution");
    assert.equal((await legacy.query("SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'institutions'")).rows[0].tableowner, "marvin_migrator");
    await legacy.query("GRANT marvin_migrator TO marvin_app");
    await assert.rejects(provisionDatabaseRoles(legacy, { ...passwords, rotatePasswords: true }), /incompatíveis/);
    await legacy.query("REVOKE marvin_migrator FROM marvin_app");
  } finally {
    await legacy.end();
    await admin.query(`DROP DATABASE ${escapeIdentifier(database)} WITH (FORCE)`);
    if (created) await admin.query("DROP ROLE marvin_app, marvin_migrator");
    await admin.end();
  }
});

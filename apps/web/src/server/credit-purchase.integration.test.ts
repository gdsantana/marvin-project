import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDatabase, createFinanceRepository } from "@finance/db";
import { FinanceService } from "@finance/domain";
import { POST } from "../app/api/v1/[...path]/route";

const databaseUrl = process.env.DATABASE_URL_TEST;

test("credit purchase API persists installments and protects paid statement cycles", { skip: !databaseUrl }, async () => {
  const adminPool = createDatabase(databaseUrl!).pool;
  const schemaName = `marvin_credit_api_${randomUUID().replaceAll("-", "")}`;
  await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
  const { db, pool } = createDatabase(databaseUrl!, { options: `-c search_path=${schemaName}` });
  const runtime = globalThis as typeof globalThis & { marvinFinance?: FinanceService; marvinRepository?: ReturnType<typeof createFinanceRepository> };
  const previousService = runtime.marvinFinance;
  const previousRepository = runtime.marvinRepository;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousApiToken = process.env.MCP_API_TOKEN;

  try {
    const migrationsDirectory = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));
    const migrationFiles = (await readdir(migrationsDirectory)).filter(file => file.endsWith(".sql")).sort();
    for (const file of migrationFiles) {
      const migration = await readFile(`${migrationsDirectory}/${file}`, "utf8");
      for (const statement of migration.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) await pool.query(statement);
    }

    runtime.marvinRepository = createFinanceRepository(db);
    runtime.marvinFinance = new FinanceService(runtime.marvinRepository);
    process.env.DATABASE_URL = databaseUrl;
    process.env.MCP_API_TOKEN = "credit-purchase-api-integration-token-32-bytes";

    const service = runtime.marvinFinance;
    const institutionId = await service.createInstitution({ name: "Integration bank" }, "credit-api-institution");
    const categoryId = await service.createCategory({ name: "Home", type: "expense", parentId: null }, "credit-api-category");
    const secondCategoryId = await service.createCategory({ name: "Utilities", type: "expense", parentId: null }, "credit-api-second-category");
    const checkingAccountId = await service.createAccount({ name: "Checking", type: "checking", currency: "BRL", openingBalanceMinor: 50000n, openingDate: "2026-01-01", institutionId }, "credit-api-checking");
    const cardAccountId = await service.createAccount({
      name: "Credit card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n,
      openingDate: "2026-01-01", institutionId,
      cardSettings: { creditLimitMinor: 500000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" },
    }, "credit-api-card");

    const response = await POST(new Request("http://localhost/api/v1/transactions/credit-purchase", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": "credit-api-purchase" },
      body: JSON.stringify({
        occurredOn: "2026-10-25", description: "Three installments", source: "manual",
        cardAccountId, totalAmountMinor: "100000", installmentCount: 3,
        allocations: [{ categoryId, amountMinor: "70000" }, { categoryId: secondCategoryId, amountMinor: "30000" }],
      }),
    }), { params: Promise.resolve({ path: ["transactions", "credit-purchase"] }) });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.value.items.map((item: { amountMinor: string }) => item.amountMinor), ["33333", "33333", "33334"]);
    assert.equal(body.data.value.transaction.entries.find((entry: { accountId: string }) => entry.accountId === cardAccountId)?.amountMinor, "-100000");

    const statementId = body.data.value.items[0].statementId as string;
    const closeResponse = await POST(new Request("http://localhost/api/v1/statements/close", {
      method: "POST", headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": "credit-api-close" },
      body: JSON.stringify({ statementId }),
    }), { params: Promise.resolve({ path: ["statements", "close"] }) });
    assert.equal(closeResponse.status, 200);
    const paymentResponse = await POST(new Request("http://localhost/api/v1/statements/payment", {
      method: "POST", headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": "credit-api-payment" },
      body: JSON.stringify({ occurredOn: "2026-11-28", description: "Pay November statement", source: "manual", statementId, fromAccountId: checkingAccountId, amountMinor: "33333" }),
    }), { params: Promise.resolve({ path: ["statements", "payment"] }) });
    assert.equal(paymentResponse.status, 201);
    const closedCyclePurchase = await POST(new Request("http://localhost/api/v1/transactions/credit-purchase", {
      method: "POST", headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": "credit-api-closed-cycle-purchase" },
      body: JSON.stringify({
        occurredOn: "2026-10-20", postedOn: "2026-10-21", description: "Posted after closing", source: "manual",
        cardAccountId, totalAmountMinor: "1000", installmentCount: 1, allocations: [{ categoryId, amountMinor: "1000" }],
      }),
    }), { params: Promise.resolve({ path: ["transactions", "credit-purchase"] }) });
    assert.equal(closedCyclePurchase.status, 409);
    assert.deepEqual(await closedCyclePurchase.json(), { ok: false, error: { code: "CONFLICT", message: "Não é possível alterar uma fatura fechada" } });

    const adjustmentStatement = await service.createStatement({ cardAccountId, cycleStartOn: "2027-01-20", closingOn: "2027-02-20", dueOn: "2027-02-28" });
    const adjustmentBody = { occurredOn: "2027-02-01", description: "Diferença da fatura", cardAccountId, statementId: adjustmentStatement.id, amountMinor: "30000", confirmsUnrecordedDebt: true };
    const adjust = (key: string, payload: unknown = adjustmentBody) => POST(new Request("http://localhost/api/v1/statements/adjustment", {
      method: "POST", headers: { authorization: `Bearer ${process.env.MCP_API_TOKEN}`, "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(payload),
    }), { params: Promise.resolve({ path: ["statements", "adjustment"] }) });
    const adjustments = await Promise.all([adjust("adjustment-concurrent"), adjust("adjustment-concurrent")]);
    for (const result of adjustments) assert.equal(result.status, 201);
    const adjustmentResults = await Promise.all(adjustments.map(result => result.json()));
    assert.equal(adjustmentResults.filter(result => result.data.replayed).length, 1);
    assert.equal(adjustmentResults[0].data.value.allocations[0].categoryName, "Ajuste de fatura");
    assert.equal((await service.statementDetail(adjustmentStatement.id)).billedMinor, 30000n);
    assert.equal((await service.statementDetail(adjustmentStatement.id)).items.length, 1);
    assert.equal((await adjust("adjustment-concurrent", { ...adjustmentBody, amountMinor: "1" })).status, 409);
    assert.equal((await adjust("adjustment-unconfirmed", { ...adjustmentBody, confirmsUnrecordedDebt: false })).status, 400);
    await service.closeStatement(adjustmentStatement.id, "adjustment-close");
    assert.equal((await adjust("adjustment-closed")).status, 409);
    const nextAdjustment = await adjust("adjustment-new-cycle", { ...adjustmentBody, statementId: undefined, occurredOn: "2027-03-01" });
    assert.equal(nextAdjustment.status, 201);
    const nextTransaction = (await nextAdjustment.json()).data.value;
    assert.equal(nextTransaction.entries[0].amountMinor, "-30000");
    const item = (await pool.query("SELECT * FROM card_statement_items WHERE source_transaction_id = $1", [nextTransaction.id])).rows[0];
    assert.equal(item.item_type, "adjustment");
    assert.equal(item.installment_plan_id, null);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousApiToken === undefined) delete process.env.MCP_API_TOKEN;
    else process.env.MCP_API_TOKEN = previousApiToken;
    if (previousService === undefined) delete runtime.marvinFinance;
    else runtime.marvinFinance = previousService;
    if (previousRepository === undefined) delete runtime.marvinRepository;
    else runtime.marvinRepository = previousRepository;
    await pool.end();
    await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
  }
});

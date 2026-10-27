import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { FinanceService } from "@finance/domain";
import { createDatabase } from "./client.js";
import { createFinanceRepository } from "./repositories.js";

const databaseUrl = process.env.DATABASE_URL_TEST;

test("PostgreSQL constraints and domain ports persist financial operations, forecasts and revisions", { skip: !databaseUrl }, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schemaName = `marvin_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  const { db, pool } = createDatabase(databaseUrl!, { options: `-c search_path=${schemaName}` });

  try {
    const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));
    const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of migrationFiles) {
      const migration = await readFile(`${migrationsDirectory}/${file}`, "utf8");
      for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await pool.query(statement);
    }

    const institutionId = randomUUID();
    const checkingId = randomUUID();
    const cardId = randomUUID();
    await pool.query("INSERT INTO institutions (id, name) VALUES ($1, 'Test bank')", [institutionId]);
    await pool.query("INSERT INTO accounts (id, institution_id, name, type, currency, opening_date) VALUES ($1, $3, 'Checking', 'checking', 'BRL', '2026-01-01'), ($2, $3, 'Card', 'credit_card', 'BRL', '2026-01-01')", [checkingId, cardId, institutionId]);
    await pool.query("INSERT INTO credit_card_settings (account_id, closing_day, due_day, billing_timezone) VALUES ($1, 20, 28, 'America/Sao_Paulo')", [cardId]);

    const originalId = randomUUID();
    await pool.query("INSERT INTO transactions (id, kind, occurred_on, description, source) VALUES ($1, 'expense', '2026-02-01', 'Purchase', 'manual')", [originalId]);
    await pool.query("INSERT INTO account_entries (transaction_id, account_id, amount_minor) VALUES ($1, $2, -100)", [originalId, checkingId]);
    const refundAttempts = await Promise.allSettled([1, 2].map(async () => {
      const refundId = randomUUID();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO transactions (id, kind, occurred_on, description, source, related_transaction_id) VALUES ($1, 'refund', '2026-02-02', 'Refund', 'manual', $2)", [refundId, originalId]);
        await client.query("INSERT INTO account_entries (transaction_id, account_id, amount_minor) VALUES ($1, $2, 80)", [refundId, checkingId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }));
    assert.equal(refundAttempts.filter((result) => result.status === "fulfilled").length, 1);

    const statementId = randomUUID();
    const chargeId = randomUUID();
    await pool.query("INSERT INTO transactions (id, kind, occurred_on, description, source, payment_method) VALUES ($1, 'expense', '2026-02-03', 'Card purchase', 'manual', 'credit')", [chargeId]);
    await pool.query("INSERT INTO account_entries (transaction_id, account_id, amount_minor) VALUES ($1, $2, -100)", [chargeId, cardId]);
    await pool.query("INSERT INTO card_statements (id, card_account_id, cycle_start_on, closing_on, due_on) VALUES ($1, $2, '2026-01-21', '2026-02-20', '2026-02-28')", [statementId, cardId]);
    const planId = randomUUID();
    const planClient = await pool.connect();
    try {
      await planClient.query("BEGIN");
      await planClient.query("INSERT INTO installment_plans (id, purchase_transaction_id, total_amount_minor, installment_count) VALUES ($1, $2, 100, 1)", [planId, chargeId]);
      await planClient.query("INSERT INTO card_statement_items (statement_id, source_transaction_id, installment_plan_id, installment_number, item_type, amount_minor, description) VALUES ($1, $2, $3, 1, 'purchase', 100, 'Card purchase')", [statementId, chargeId, planId]);
      await planClient.query("COMMIT");
    } catch (error) {
      await planClient.query("ROLLBACK");
      throw error;
    } finally { planClient.release(); }

    const paymentAttempts = await Promise.allSettled([1, 2].map(async () => {
      const transferId = randomUUID();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO transactions (id, kind, occurred_on, description, source) VALUES ($1, 'transfer', '2026-02-28', 'Payment', 'manual')", [transferId]);
        await client.query("INSERT INTO account_entries (transaction_id, account_id, amount_minor) VALUES ($1, $2, -80), ($1, $3, 80)", [transferId, checkingId, cardId]);
        await client.query("INSERT INTO statement_payments (statement_id, transfer_transaction_id, amount_minor) VALUES ($1, $2, 80)", [statementId, transferId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }));
    assert.equal(paymentAttempts.filter((result) => result.status === "fulfilled").length, 1);

    const overlap = await Promise.allSettled([
      ["2026-02-20", "2026-03-15"], ["2026-02-25", "2026-03-20"],
    ].map(async ([cycleStart, closing]) => {
      await pool.query("INSERT INTO card_statements (card_account_id, cycle_start_on, closing_on, due_on) VALUES ($1, $2, $3, $3::date + 8)", [cardId, cycleStart, closing]);
    }));
    assert.equal(overlap.filter((result) => result.status === "fulfilled").length, 1);

    const repository = createFinanceRepository(db);
    const first = await repository.transaction(async (tx) => {
      const claim = await tx.idempotency.claim("integration-key", { amountMinor: "12" });
      await tx.idempotency.complete("integration-key", { amountMinor: 12n });
      return claim;
    });
    assert.equal(first.replayed, false);
    const replay = await repository.transaction((tx) => tx.idempotency.claim("integration-key", { amountMinor: "12" }));
    assert.deepEqual(replay, { replayed: true, result: { amountMinor: 12n } });
    await assert.rejects(repository.transaction((tx) => tx.idempotency.claim("integration-key", { amountMinor: "13" })), { code: "IDEMPOTENCY_CONFLICT" });

    const service = new FinanceService(repository);
    const cashAccount = await service.createAccount({ name: "Service checking", type: "checking", currency: "BRL", openingBalanceMinor: 50000n, openingDate: "2026-10-01", institutionId: null }, "service-account-checking");
    const serviceCard = await service.createAccount({
      name: "Service card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-10-01", institutionId: null,
      cardSettings: { creditLimitMinor: 100000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" },
    }, "service-account-card");
    const automaticCard = await service.createAccount({
      name: "Automatic card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-10-01", institutionId: null,
      cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "automatic" },
    }, "service-automatic-card");
    const incomeCategory = await service.createCategory({ name: "Salary", type: "income", parentId: null }, "service-category-income");
    const expenseCategory = await service.createCategory({ name: "Purchase", type: "expense", parentId: null }, "service-category-expense");
    const aggregateAccount = await service.createAccount({ name: "Aggregate", type: "checking", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-10-01", institutionId: null }, "aggregate-account");
    await service.createIncome({ occurredOn: "2026-10-25", description: "Maximum row", source: "manual", reviewStatus: "confirmed", accountId: aggregateAccount, amountMinor: "9223372036854775807", categoryId: incomeCategory }, "aggregate-income-max");
    await service.createIncome({ occurredOn: "2026-10-25", description: "One more", source: "manual", reviewStatus: "confirmed", accountId: aggregateAccount, amountMinor: "1", categoryId: incomeCategory }, "aggregate-income-one");
    assert.equal(await service.accountBalance(aggregateAccount), 9223372036854775808n);
    assert.equal((await service.listAccounts()).find(account => account.id === aggregateAccount)?.balanceMinor, 9223372036854775808n);
    assert.equal((await service.monthlyReport("2026-10-01", "2026-10-31")).BRL?.incomeMinor, "9223372036854775808");
    const overdueStatement = await service.createStatement({ cardAccountId: automaticCard, cycleStartOn: "2026-09-21", closingOn: "2026-10-20", dueOn: "2026-10-28" });
    const entriesBeforeClose = await pool.query("SELECT count(*)::int AS count FROM account_entries");
    const scheduledClosures = await Promise.all(["close-auto-a", "close-auto-b"].map(() => service.closeDueAutomaticStatements("2026-10-26T12:00:00.000Z")));
    assert.equal(scheduledClosures.reduce((sum, result) => sum + result.closedCount, 0), 1);
    assert.equal((await service.statementDetail(overdueStatement.id)).status, "closed");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM account_entries")).rows[0]!.count, entriesBeforeClose.rows[0]!.count);
    const metadata = { occurredOn: "2026-10-25", description: "Salary", source: "manual" as const, reviewStatus: "confirmed" as const };
    const salary = await service.createIncome({ ...metadata, accountId: cashAccount, amountMinor: "50000", categoryId: incomeCategory }, "service-salary");
    assert.equal(await service.accountBalance(cashAccount), 100000n);
    await service.correctTransaction({
      transactionId: salary.value.id, reason: "Correct description", metadata: { description: "Salary corrected" },
      allocations: [{ categoryId: incomeCategory, amountMinor: "50000" }],
    }, "service-salary-correction", { actor: "integration-test", source: "manual" });
    const secondRevision = await service.correctTransaction({
      transactionId: salary.value.id, reason: "Add note", metadata: { notes: "Reviewed" },
    }, "service-salary-correction-2", { actor: "integration-test", source: "manual" });
    assert.equal(secondRevision.value.revisionNumber, 2);
    const history = await service.transactionHistory("2026-10-01", "2026-10-31");
    assert.equal(history.find((transaction) => transaction.id === salary.value.id)?.description, "Salary corrected");
    assert.equal(history.find((transaction) => transaction.id === salary.value.id)?.notes, "Reviewed");
    assert.equal(history.find((transaction) => transaction.id === salary.value.id)?.revisions.length, 2);
    assert.equal(history.find((transaction) => transaction.id === salary.value.id)?.allocations[0]?.amountMinor, 50000n);

    const forecast = await service.createExpenseForecast({ accountId: cashAccount, expectedOn: "2026-10-30", amountMinor: "2000", categoryId: expenseCategory, description: "Projected expense" }, "service-forecast");
    assert.equal(await service.accountBalance(cashAccount), 100000n);
    assert.equal((await service.listExpenseForecasts("2026-10-01", "2026-10-31", "BRL")).find((item) => item.id === forecast.value.id)?.status, "projected");
    const realized = await service.realizeExpenseForecast(forecast.value.id, { occurredOn: "2026-10-26", paymentMethod: "debit", source: "manual", reviewStatus: "confirmed" }, "service-realize-forecast");
    assert.equal(realized.value.forecast.status, "realized");
    assert.equal(realized.value.forecast.realizedTransactionId, realized.value.transaction.id);
    assert.equal(await service.accountBalance(cashAccount), 98000n);
    const duplicateForecast = randomUUID();
    await pool.query("INSERT INTO expense_forecasts (id, account_id, expected_on, amount_minor, category_id, description, currency) VALUES ($1, $2, '2026-10-31', 2000, $3, 'Duplicate link', 'BRL')", [duplicateForecast, cashAccount, expenseCategory]);
    await assert.rejects(pool.query("UPDATE expense_forecasts SET status = 'realized', realized_transaction_id = $1 WHERE id = $2", [realized.value.transaction.id, duplicateForecast]));
    await assert.rejects(pool.query("INSERT INTO expense_forecasts (id, account_id, expected_on, amount_minor, description, currency) VALUES ($1, $2, '2026-10-31', 100, 'Invalid card forecast', 'BRL')", [randomUUID(), cardId]));

    const cancelledForecast = await service.createExpenseForecast({ accountId: cashAccount, expectedOn: "2026-10-31", amountMinor: "500", categoryId: expenseCategory, description: "Cancelled expense" }, "service-cancel-forecast");
    const cancelled = await service.cancelExpenseForecast(cancelledForecast.value.id, "service-cancel-forecast-action");
    assert.equal(cancelled.value.status, "cancelled");

    const contestedForecast = await service.createExpenseForecast({ accountId: cashAccount, expectedOn: "2026-10-31", amountMinor: "700", categoryId: expenseCategory, description: "Concurrent forecast" }, "contested-forecast");
    const forecastRealizations = await Promise.allSettled(["forecast-race-a", "forecast-race-b"].map(key => service.realizeExpenseForecast(contestedForecast.value.id, { occurredOn: "2026-10-27", paymentMethod: "debit", source: "manual", reviewStatus: "confirmed" }, key)));
    assert.equal(forecastRealizations.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await service.listExpenseForecasts("2026-10-01", "2026-10-31", "BRL")).find(item => item.id === contestedForecast.value.id)?.status, "realized");

    const contestedIncome = await service.createIncome({ ...metadata, accountId: cashAccount, amountMinor: "100", categoryId: incomeCategory }, "contested-reversal-income");
    const reversals = await Promise.allSettled(["reverse-race-a", "reverse-race-b"].map(key => service.reverseTransaction({ transactionId: contestedIncome.value.id, occurredOn: "2026-10-27", reason: "Duplicate" }, key, { actor: "integration-test", source: "manual" })));
    assert.equal(reversals.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await repository.transaction(tx => tx.transactions.list("2026-10-01", "2026-10-31"))).filter(transaction => transaction.kind === "adjustment" && transaction.relatedTransactionId === contestedIncome.value.id).length, 1);
    await assert.rejects(pool.query("INSERT INTO transactions (id, kind, occurred_on, description, source, related_transaction_id) VALUES ($1, 'adjustment', '2026-10-27', 'Duplicate reversal', 'manual', $2)", [randomUUID(), contestedIncome.value.id]));

    await assert.rejects(pool.query("UPDATE transactions SET description = 'mutated' WHERE id = $1", [salary.value.id]));
    const persistedAllocation = await pool.query("INSERT INTO category_allocations (transaction_id, category_id, amount_minor) VALUES ($1, $2, 50000) RETURNING id", [salary.value.id, incomeCategory]);
    await assert.rejects(pool.query("UPDATE category_allocations SET amount_minor = 1 WHERE id = $1", [persistedAllocation.rows[0]!.id]));
    await assert.rejects(pool.query("DELETE FROM expense_forecasts WHERE id = $1", [forecast.value.id]));
    const purchase = await service.createCreditPurchase({
      ...metadata,
      description: "Purchase",
      cardAccountId: serviceCard,
      totalAmountMinor: "1000",
      installmentCount: 1,
      allocations: [{ categoryId: expenseCategory, amountMinor: "1000" }],
    }, "service-purchase");
    const serviceStatementId = purchase.value.items[0]!.statementId;
    await service.closeStatement(serviceStatementId, "service-close-statement");
    await service.payStatement({
      ...metadata,
      statementId: serviceStatementId,
      fromAccountId: cashAccount,
      amountMinor: "1000",
    }, "service-payment");
    assert.equal(await service.accountBalance(cashAccount), 96300n);
    assert.equal(await service.accountBalance(serviceCard), 0n);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await admin.end();
  }
});

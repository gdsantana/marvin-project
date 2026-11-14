import assert from "node:assert/strict";
import test from "node:test";
import { accountWithBalanceSchema, categoryReportResponseSchema, createAccountSchema, createExpenseSchema, correctTransactionSchema, derivedMinorAmountSchema, minorAmountSchema, monthlySummarySchema, positiveMinorAmountSchema, reverseTransactionSchema, statementForecastEntrySchema, transactionAuditContextSchema, transactionCorrectionResponseSchema, transactionReversedResponseSchema } from "@finance/contracts";
import {
  addMonths, DomainError, FinanceService, splitInstallments,
  type Account, type Allocation, type Entry, type FinanceRepository, type Statement,
  type StatementItem, type StatementPayment, type Transaction, type TransactionContext,
  type ExpenseForecast, type TransactionRevision,
} from "./index.js";

class MemoryRepository implements FinanceRepository {
  institutions = new Map<string, { id: string; name: string; isArchived: boolean }>();
  accounts = new Map<string, Account>(); categories = new Map<string, { id: string; type: "income" | "expense"; isArchived: boolean; name: string; parentId: string | null }>();
  transactions = new Map<string, Transaction>(); entries: Entry[] = []; allocations: Allocation[] = [];
  forecasts = new Map<string, ExpenseForecast>(); revisions: TransactionRevision[] = [];
  settings = new Map<string, { accountId: string; creditLimitMinor: bigint | null; closingDay: number; dueDay: number; billingTimezone: string; billingMode: "manual" | "automatic" }>();
  statements = new Map<string, Statement>(); items: StatementItem[] = []; plans = new Map<string, { id: string; purchaseTransactionId: string; totalAmountMinor: bigint; installmentCount: number }>(); payments: StatementPayment[] = [];
  idempotency = new Map<string, { payload: string; result: unknown | null }>();
  transactionCount = 0;
  reportingLoadCount = 0;

  async transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    this.transactionCount++;
    const snapshot = { institutions: new Map(this.institutions), accounts: new Map(this.accounts), categories: new Map(this.categories), transactions: new Map(this.transactions), entries: [...this.entries], allocations: [...this.allocations], forecasts: new Map(this.forecasts), revisions: [...this.revisions], settings: new Map(this.settings), statements: new Map(this.statements), items: [...this.items], plans: new Map(this.plans), payments: [...this.payments], idempotency: new Map([...this.idempotency].map(([key, value]) => [key, { ...value }])) };
    const tx: TransactionContext = {
      institutions: { get: async id => this.institutions.get(id) ?? null, save: async value => { this.institutions.set(value.id, value); }, list: async () => [...this.institutions.values()] },
      accounts: {
        get: async id => this.accounts.get(id) ?? null, save: async account => { this.accounts.set(account.id, account); }, list: async () => [...this.accounts.values()],
        balance: async (id, through) => this.entries.filter(entry => entry.accountId === id && (!through || (this.transactions.get(entry.transactionId)?.occurredOn ?? "9999-12-31") <= through)).reduce((total, entry) => total + entry.amountMinor, 0n),
      },
      categories: { get: async id => this.categories.get(id) ?? null, save: async category => { this.categories.set(category.id, category); }, list: async () => [...this.categories.values()] },
      transactions: {
        save: async transaction => { this.transactions.set(transaction.id, transaction); }, get: async id => this.transactions.get(id) ?? null,
        list: async (from, to) => [...this.transactions.values()].filter(transaction => transaction.occurredOn >= from && transaction.occurredOn <= to),
        findByIdempotency: async key => { const item = [...this.transactions.values()].find(transaction => transaction.idempotencyKey === key); return item ? { transaction: item, payload: null } : null; },
      },
      entries: {
        add: async entry => { const result = { ...entry, id: crypto.randomUUID() }; this.entries.push(result); return result; },
        listByAccount: async (id, through) => this.entries.filter(entry => entry.accountId === id && (!through || (this.transactions.get(entry.transactionId)?.occurredOn ?? "9999-12-31") <= through)),
        listByTransaction: async id => this.entries.filter(entry => entry.transactionId === id),
      },
      allocations: {
        addMany: async values => { const result = values.map(value => ({ ...value, id: crypto.randomUUID() })); this.allocations.push(...result); return result; },
        listByTransaction: async id => this.allocations.filter(allocation => allocation.transactionId === id),
      },
      forecasts: {
        save: async forecast => { this.forecasts.set(forecast.id, forecast); },
        get: async id => this.forecasts.get(id) ?? null,
        list: async (from, to, currency) => [...this.forecasts.values()].filter(item => item.expectedOn >= from && item.expectedOn <= to && (!currency || item.currency === currency)),
      },
      revisions: {
        add: async revision => { this.revisions.push(revision); },
        listByTransaction: async id => this.revisions.filter(revision => revision.transactionId === id),
      },
      cards: { getSettings: async id => this.settings.get(id) ?? null, saveSettings: async settings => { this.settings.set(settings.accountId, settings); } },
      statements: {
        get: async id => this.statements.get(id) ?? null,
        findByClosingDate: async (card, closing) => [...this.statements.values()].find(statement => statement.cardAccountId === card && statement.closingOn === closing) ?? null,
        list: async card => [...this.statements.values()].filter(statement => statement.cardAccountId === card),
        save: async statement => { this.statements.set(statement.id, statement); },
        addItems: async values => { const result = values.map(value => ({ ...value, id: crypto.randomUUID() })); this.items.push(...result); return result; },
        items: async id => this.items.filter(item => item.statementId === id),
      },
      installmentPlans: { save: async plan => { this.plans.set(plan.id, plan); }, getByPurchase: async id => [...this.plans.values()].find(plan => plan.purchaseTransactionId === id) ?? null },
      payments: {
        save: async payment => { this.payments.push(payment); }, list: async statementId => this.payments.filter(payment => payment.statementId === statementId),
        findByTransfer: async id => this.payments.filter(payment => payment.transferTransactionId === id),
      },
      idempotency: {
        claim: async (key, payload) => {
          const serialized = JSON.stringify(payload); const existing = this.idempotency.get(key);
          if (existing && existing.payload !== serialized) throw new DomainError("IDEMPOTENCY_CONFLICT", "Chave reutilizada com payload divergente");
          if (existing) return { replayed: true, result: existing.result };
          this.idempotency.set(key, { payload: serialized, result: null }); return { replayed: false, result: null };
        },
        complete: async (key, result) => { const entry = this.idempotency.get(key)!; entry.result = result; },
      },
      reporting: { load: async () => { this.reportingLoadCount++; return { transactions: [...this.transactions.values()], entries: [...this.entries], allocations: [...this.allocations], revisions: [...this.revisions], accounts: [...this.accounts.values()], categories: [...this.categories.values()] }; } },
    };
    try { return await work(tx); } catch (error) {
      this.institutions = snapshot.institutions; this.accounts = snapshot.accounts; this.categories = snapshot.categories; this.transactions = snapshot.transactions; this.entries = snapshot.entries; this.allocations = snapshot.allocations; this.forecasts = snapshot.forecasts; this.revisions = snapshot.revisions; this.settings = snapshot.settings; this.statements = snapshot.statements; this.items = snapshot.items; this.plans = snapshot.plans; this.payments = snapshot.payments; this.idempotency = snapshot.idempotency;
      throw error;
    }
  }
}

const metadata = { occurredOn: "2026-10-25", description: "Compra", source: "manual" as const, reviewStatus: "confirmed" as const };

test("parcelas usam BigInt, resto na última e calendário civil", () => {
  assert.deepEqual(splitInstallments(100000n, 3), [33333n, 33333n, 33334n]);
  assert.throws(() => splitInstallments(2n, 3));
  assert.equal(addMonths("2026-01-31", 1, 31), "2026-02-28");
});

test("schemas rejeitam alocação negativa e valores fora do BIGINT", () => {
  assert.equal(minorAmountSchema.safeParse("9223372036854775808").success, false);
  for (const value of ["abc", "1.2", "", "--1", "9223372036854775808", "-9223372036854775809"]) {
    assert.doesNotThrow(() => minorAmountSchema.safeParse(value));
    assert.equal(minorAmountSchema.safeParse(value).success, false);
  }
  for (const value of ["abc", "1.2", "", "0", "-1", "9223372036854775808"]) {
    assert.doesNotThrow(() => positiveMinorAmountSchema.safeParse(value));
    assert.equal(positiveMinorAmountSchema.safeParse(value).success, false);
  }
  assert.equal(minorAmountSchema.safeParse("-9223372036854775808").success, true);
  assert.equal(minorAmountSchema.safeParse("9223372036854775807").success, true);
  assert.equal(positiveMinorAmountSchema.safeParse("9223372036854775807").success, true);
  assert.equal(createExpenseSchema.safeParse({ ...metadata, accountId: crypto.randomUUID(), amountMinor: "100", paymentMethod: "debit", allocations: [{ categoryId: null, amountMinor: "-100" }] }).success, false);
});

test("contratos de resumo aceitam mapas vazios e BRL, rejeitam EUR e domínio recusa conta EUR", async () => {
  const base = { from: "2026-10-01", to: "2026-10-31", balancesByCurrency: {}, incomeMinorByCurrency: {}, expenseMinorByCurrency: {} };
  assert.equal(monthlySummarySchema.safeParse(base).success, true);
  assert.equal(monthlySummarySchema.safeParse({ ...base, balancesByCurrency: { BRL: "0" } }).success, true);
  assert.equal(monthlySummarySchema.safeParse({ ...base, balancesByCurrency: { EUR: "0" } }).success, false);
  assert.equal(createAccountSchema.safeParse({ name: "Euro", type: "checking", currency: "EUR", openingBalanceMinor: "0", openingDate: "2026-01-01", institutionId: null }).success, false);
  const service = new FinanceService(new MemoryRepository());
  await assert.rejects(() => service.createAccount({ name: "Euro", type: "checking", currency: "EUR", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null }, "eur-domain"), { code: "CURRENCY_MISMATCH" });
});

test("contratos de correção derivam autoria do contexto confiável e tipam respostas distintas", () => {
  const transactionId = crypto.randomUUID();
  const correction = correctTransactionSchema.parse({ transactionId, reason: "Fix", actor: "untrusted", source: "hermes", metadata: { description: "Corrected" } });
  const reversal = reverseTransactionSchema.parse({ transactionId, occurredOn: "2026-10-25", reason: "Void", actor: "untrusted", source: "hermes" });
  assert.equal("actor" in correction, false);
  assert.equal("source" in correction, false);
  assert.equal("actor" in reversal, false);
  assert.deepEqual(transactionAuditContextSchema.parse({ actor: "authenticated-owner", source: "hermes" }), { actor: "authenticated-owner", source: "hermes" });
  assert.equal(transactionCorrectionResponseSchema.safeParse({ ok: false, error: { code: "CONFLICT", message: "conflict" } }).success, true);
  assert.equal(transactionReversedResponseSchema.safeParse({ ok: false, error: { code: "CONFLICT", message: "conflict" } }).success, true);
});

test("outputs financeiros agregados aceitam BigInt arbitrário sem ampliar inputs persistidos", () => {
  const huge = "18446744073709551614";
  assert.equal(minorAmountSchema.safeParse(huge).success, false);
  assert.equal(derivedMinorAmountSchema.safeParse(huge).success, true);
  const account = { id: crypto.randomUUID(), institutionId: null, name: "Checking", type: "checking" as const, currency: "BRL", openingBalanceMinor: "1", openingDate: "2026-01-01", isArchived: false, balanceMinor: huge };
  assert.equal(accountWithBalanceSchema.safeParse(account).success, true);
  assert.equal(monthlySummarySchema.safeParse({ from: "2026-10-01", to: "2026-10-31", balancesByCurrency: { BRL: huge }, incomeMinorByCurrency: { BRL: huge }, expenseMinorByCurrency: { BRL: "0" } }).success, true);
  assert.equal(statementForecastEntrySchema.safeParse({ statementId: crypto.randomUUID(), dueOn: "2026-10-31", billedMinor: `-${huge}`, paidMinor: "0", remainingMinor: `-${huge}` }).success, true);
  assert.equal(createAccountSchema.safeParse({ name: "Card", type: "credit_card", currency: "BRL", openingBalanceMinor: "0", openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "Mars/Phobos", billingMode: "automatic" } }).success, false);
});

test("saldo anterior à abertura é zero e relatórios carregam uma projeção por transação", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const account = await service.createAccount({ name: "Conta", type: "checking", currency: "BRL", openingBalanceMinor: 1250n, openingDate: "2026-10-10", institutionId: null }, "cutoff-account");
  assert.equal(await service.accountBalance(account, "2026-10-09"), 0n);
  assert.equal((await service.listAccounts("2026-10-09")).find(row => row.id === account)?.balanceMinor, 0n);
  const beforeTransactions = repository.transactionCount, beforeLoads = repository.reportingLoadCount;
  await service.monthlySummary("2026-10-01", "2026-10-31");
  assert.equal(repository.transactionCount, beforeTransactions + 1);
  assert.equal(repository.reportingLoadCount, beforeLoads + 1);
  const beforeSeriesTransactions = repository.transactionCount, beforeSeriesLoads = repository.reportingLoadCount;
  const series = await service.monthlySeries("2026-10-01", "2026-11-30");
  assert.equal(series.length, 2);
  assert.equal(repository.transactionCount, beforeSeriesTransactions + 1);
  assert.equal(repository.reportingLoadCount, beforeSeriesLoads + 1);
});

test("preview e commit de compra parcelada respeitam vencimento já persistido", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "due-existing-card");
  const category = await service.createCategory({ name: "Casa", type: "expense", parentId: null }, "due-existing-category");
  const statement = await service.createStatement({ cardAccountId: card, cycleStartOn: "2026-09-21", closingOn: "2026-10-20", dueOn: "2026-10-30" });
  const input = { ...metadata, occurredOn: "2026-10-19", operation: "credit_purchase" as const, cardAccountId: card, totalAmountMinor: "300", installmentCount: 1, allocations: [{ categoryId: category, amountMinor: "300" }] };
  const preview = await service.previewTransaction(input);
  assert.equal(preview.installments?.[0]?.dueOn, "2026-10-30");
  const committed = await service.createCreditPurchase(input, "existing-due-purchase");
  assert.equal(committed.value.items[0]?.statementId, statement.id);
  assert.equal(repository.statements.get(statement.id)?.dueOn, "2026-10-30");
});

test("reembolso de despesa revertida é recusado no preview e no commit; fechamento no dia de corte avança ciclo", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const checking = await service.createAccount({ name: "Conta", type: "checking", currency: "BRL", openingBalanceMinor: 10000n, openingDate: "2026-01-01", institutionId: null }, "refund-reversed-account");
  const category = await service.createCategory({ name: "Casa", type: "expense", parentId: null }, "refund-reversed-category");
  const original = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "500", paymentMethod: "pix", allocations: [{ categoryId: category, amountMinor: "500" }] }, "refund-reversed-expense");
  await service.reverseTransaction({ transactionId: original.value.id, occurredOn: "2026-10-26", reason: "Duplicada" }, "refund-reversed-reversal", { actor: "owner", source: "manual" });
  const refund = { ...metadata, operation: "refund" as const, originalTransactionId: original.value.id, amountMinor: "100", accountId: checking };
  await assert.rejects(() => service.previewTransaction(refund), { code: "INVALID_REFUND" });
  await assert.rejects(() => service.createRefund(refund, "refund-reversed-commit"), { code: "INVALID_REFUND" });

  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "refund-cutoff-card");
  const purchase = await service.createCreditPurchase({ ...metadata, occurredOn: "2026-10-19", cardAccountId: card, totalAmountMinor: "500", installmentCount: 1, allocations: [{ categoryId: category, amountMinor: "500" }] }, "refund-cutoff-purchase");
  const postedOnClosing = { ...metadata, occurredOn: "2026-10-19", postedOn: "2026-10-20", operation: "refund" as const, originalTransactionId: purchase.value.transaction.id, amountMinor: "100", accountId: card };
  const cutoffPreview = await service.previewTransaction(postedOnClosing);
  assert.equal(cutoffPreview.statementPlan?.closingOn, "2026-11-20");
  const committedRefund = await service.createRefund(postedOnClosing, "refund-cutoff-commit");
  assert.equal(repository.items.find(item => item.sourceTransactionId === committedRefund.value.id)?.statementId, cutoffPreview.statementId ?? [...repository.statements.values()].find(statement => statement.closingOn === "2026-11-20")?.id);
});

test("status derivado da fatura prioriza aberta, atraso, parcial, quitada e crédito", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2020-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "derived-status-card");
  const addBill = async (closing: string, due: string, status: Statement["status"], billed: bigint, paid = 0n) => {
    const statement = await service.createStatement({ cardAccountId: card, cycleStartOn: closing.slice(0, 7) + "-01", closingOn: closing, dueOn: due });
    repository.statements.set(statement.id, { ...statement, status });
    if (billed) repository.items.push({ id: crypto.randomUUID(), statementId: statement.id, sourceTransactionId: crypto.randomUUID(), installmentPlanId: null, installmentNumber: null, itemType: "adjustment", amountMinor: billed, description: "bill" });
    if (paid) repository.payments.push({ id: crypto.randomUUID(), statementId: statement.id, transferTransactionId: crypto.randomUUID(), amountMinor: paid });
    return statement;
  };
  const open = await addBill("2020-01-20", "2020-01-28", "open", 100n);
  const overdue = await addBill("2020-02-20", "2020-02-28", "closed", 100n);
  const partial = await addBill("2020-03-20", "2020-03-28", "closed", 100n, 20n);
  const credit = await addBill("2020-04-20", "2020-04-28", "closed", -50n);
  assert.equal((await service.statementDetail(open.id)).status, "open");
  assert.equal((await service.statementDetail(overdue.id)).status, "overdue");
  assert.equal((await service.statementDetail(partial.id)).status, "overdue");
  assert.equal((await service.statementDetail(credit.id)).status, "paid");
  assert.equal((await service.statementDetail(credit.id)).creditBalanceMinor, 50n);
  const future = await addBill("2099-04-20", "2099-04-28", "closed", 100n);
  assert.equal((await service.statementDetail(future.id)).status, "closed");
});

test("realização idempotente não duplica lançamentos e previsões antigas opcionais permanecem visíveis", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const account = await service.createAccount({ name: "Conta", type: "checking", currency: "BRL", openingBalanceMinor: 10000n, openingDate: "2020-01-01", institutionId: null }, "forecast-idem-account");
  const category = await service.createCategory({ name: "Casa", type: "expense", parentId: null }, "forecast-idem-category");
  const forecast = await service.createExpenseForecast({ accountId: account, expectedOn: "2020-02-01", description: "Conta antiga", amountMinor: "500", categoryId: category }, "forecast-idem-create");
  assert.equal((await service.listExpenseForecasts("2026-10-01", "2026-10-31")).length, 0);
  assert.equal((await service.listExpenseForecasts("2026-10-01", "2026-10-31", undefined, true)).length, 1);
  const realize = { occurredOn: "2026-10-25", paymentMethod: "pix" as const, source: "manual" as const, reviewStatus: "confirmed" as const };
  const first = await service.realizeExpenseForecast(forecast.value.id, realize, "forecast-realize-idem");
  const second = await service.realizeExpenseForecast(forecast.value.id, realize, "forecast-realize-idem");
  assert.equal(second.replayed, true);
  assert.equal(repository.entries.filter(entry => entry.transactionId === first.value.transaction.id).length, 1);
  assert.equal(repository.transactions.size, 1);
});

test("estorno de compra parcelada após pagamento preserva parcelas pagas e credita o valor exato", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: 50000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "installment-refund-card");
  const bank = await service.createAccount({ name: "Banco", type: "checking", currency: "BRL", openingBalanceMinor: 100000n, openingDate: "2026-01-01", institutionId: null }, "installment-refund-bank");
  const category = await service.createCategory({ name: "Casa", type: "expense", parentId: null }, "installment-refund-category");
  const purchase = await service.createCreditPurchase({ ...metadata, occurredOn: "2026-10-10", cardAccountId: card, totalAmountMinor: "1000", installmentCount: 3, allocations: [{ categoryId: category, amountMinor: "1000" }] }, "installment-refund-purchase");
  const firstItem = purchase.value.items[0]!;
  const firstStatement = repository.statements.get(firstItem.statementId)!;
  await service.closeStatement(firstStatement.id, "installment-refund-close");
  await service.payStatement({ ...metadata, statementId: firstStatement.id, fromAccountId: bank, amountMinor: firstItem.amountMinor.toString() }, "installment-refund-pay");
  const beforeItems = [...repository.items], beforePayments = [...repository.payments];
  const input = { ...metadata, originalTransactionId: purchase.value.transaction.id, amountMinor: "1000", accountId: card };
  const refund = await service.createRefund(input, "installment-refund-create");
  const replay = await service.createRefund(input, "installment-refund-create");
  assert.equal(replay.replayed, true);
  assert.deepEqual(repository.items.filter(item => item.installmentPlanId === purchase.value.plan.id), beforeItems.filter(item => item.installmentPlanId === purchase.value.plan.id));
  assert.deepEqual(repository.payments, beforePayments);
  assert.equal(repository.items.find(item => item.sourceTransactionId === refund.value.id)?.amountMinor, -1000n);
  assert.equal(repository.items.length, beforeItems.length + 1);
  assert.equal(repository.payments.length, beforePayments.length);
});

test("statementForecast includePending inclui fatura vencida em aberto e omite fatura antiga quitada", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2020-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "forecast-statement-card");
  const open = await service.createStatement({ cardAccountId: card, cycleStartOn: "2020-01-01", closingOn: "2020-01-20", dueOn: "2020-01-28" });
  const paid = await service.createStatement({ cardAccountId: card, cycleStartOn: "2020-02-01", closingOn: "2020-02-20", dueOn: "2020-02-28" });
  for (const statement of [open, paid]) repository.items.push({ id: crypto.randomUUID(), statementId: statement.id, sourceTransactionId: crypto.randomUUID(), installmentPlanId: null, installmentNumber: null, itemType: "adjustment", amountMinor: 500n, description: "Conta" });
  repository.payments.push({ id: crypto.randomUUID(), statementId: paid.id, transferTransactionId: crypto.randomUUID(), amountMinor: 500n });
  assert.equal(Object.values(await service.statementForecast("2026-10-01", "2026-10-31")).flat().length, 0);
  const pending = Object.values(await service.statementForecast("2026-10-01", "2026-10-31", true)).flat();
  assert.deepEqual(pending.map(row => row.statementId), [open.id]);
});

test("saldos, crédito disponível e totais de fatura derivados excedem BIGINT sem perder precisão", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Large card", type: "credit_card", currency: "BRL", openingBalanceMinor: 1n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: 9223372036854775807n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "large-card");
  assert.equal(await service.availableCredit(card), 9223372036854775808n);
  const statement = await service.createStatement({ cardAccountId: card, cycleStartOn: "2026-10-01", closingOn: "2026-10-20", dueOn: "2026-10-28" });
  repository.items.push({ id: crypto.randomUUID(), statementId: statement.id, sourceTransactionId: crypto.randomUUID(), installmentPlanId: null, installmentNumber: null, itemType: "adjustment", amountMinor: 9223372036854775807n, description: "A" }, { id: crypto.randomUUID(), statementId: statement.id, sourceTransactionId: crypto.randomUUID(), installmentPlanId: null, installmentNumber: null, itemType: "adjustment", amountMinor: 9223372036854775807n, description: "B" });
  repository.payments.push({ id: crypto.randomUUID(), statementId: statement.id, transferTransactionId: crypto.randomUUID(), amountMinor: 9223372036854775807n });
  const detail = await service.statementDetail(statement.id);
  assert.equal(detail.billedMinor, 18446744073709551614n);
  assert.equal(detail.paidMinor, 9223372036854775807n);
  assert.equal(detail.remainingMinor, 9223372036854775807n);
});

test("receita, despesa, transferência, compra parcelada, reembolso, pagamento parcial e idempotência", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const checking = await service.createAccount({ name: "Corrente", type: "checking", currency: "BRL", openingBalanceMinor: 500000n, openingDate: "2026-01-01", institutionId: null }, "account-checking");
  const savings = await service.createAccount({ name: "Poupança", type: "savings", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null }, "account-savings");
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: 1000000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "account-card");
  assert.equal(repository.settings.get(card)?.creditLimitMinor, 1000000n);
  const expenseCategory = await service.createCategory({ name: "Casa", type: "expense", parentId: null }, "category-expense");
  const incomeCategory = await service.createCategory({ name: "Salário", type: "income", parentId: null }, "category-income");
  await service.configureCard({ accountId: card, creditLimitMinor: 1000000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" }, "card-settings");
  await assert.rejects(() => service.configureCard({ accountId: card, creditLimitMinor: 1000000n, closingDay: 20, dueDay: 28, billingTimezone: "Mars/Phobos", billingMode: "automatic" }, "invalid-card-settings"), { code: "VALIDATION_ERROR" });
  await service.createIncome({ ...metadata, accountId: checking, amountMinor: "500000", categoryId: incomeCategory }, "salary-1");
  await assert.rejects(() => service.createCashback({ ...metadata, accountId: checking, amountMinor: "500000", categoryId: incomeCategory }, "salary-1"), (error: unknown) => error instanceof DomainError && error.code === "IDEMPOTENCY_CONFLICT");
  const expense = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "10000", paymentMethod: "debit", allocations: [{ categoryId: expenseCategory, amountMinor: "10000" }] }, "expense-1");
  assert.equal(await service.accountBalance(checking), 990000n);
  assert.equal(await service.accountBalance(checking, "2025-12-31"), 0n);
  await service.createTransfer({ ...metadata, fromAccountId: checking, toAccountId: savings, amountMinor: "1000" }, "transfer-1");
  assert.equal(await service.accountBalance(checking) + await service.accountBalance(savings), 990000n);
  const history = await service.transactionHistory("2026-10-01", "2026-10-31");
  assert.equal(history.find(item => item.kind === "expense")?.entries[0]?.accountName, "Corrente");
  assert.equal(history.find(item => item.kind === "expense")?.allocations[0]?.categoryName, "Casa");

  const entryCountBeforePreview = repository.entries.length;
  const preview = await service.previewTransaction({ ...metadata, operation: "expense", accountId: checking, amountMinor: "2500", paymentMethod: "pix", allocations: [{ categoryId: expenseCategory, amountMinor: "2500" }] });
  assert.deepEqual(preview.entries, [{ accountId: checking, amountMinor: "-2500" }]);
  assert.equal(repository.entries.length, entryCountBeforePreview);

  const purchase = await service.createCreditPurchase({ ...metadata, cardAccountId: card, totalAmountMinor: "100000", installmentCount: 3, allocations: [{ categoryId: expenseCategory, amountMinor: "70000" }, { categoryId: expenseCategory, amountMinor: "30000" }] }, "purchase-1");
  assert.deepEqual(purchase.value.items.map(item => item.amountMinor), [33333n, 33333n, 33334n]);
  assert.deepEqual(purchase.value.items.map(item => repository.statements.get(item.statementId)?.dueOn), ["2026-11-28", "2026-12-28", "2027-01-28"]);
  assert.equal(await service.accountBalance(card), -100000n);
  assert.equal(await service.availableCredit(card), 900000n);
  assert.equal((await service.listAccounts()).find(account => account.id === card)?.availableCreditMinor, 900000n);

  const refund = await service.createRefund({ ...metadata, originalTransactionId: purchase.value.transaction.id, amountMinor: "10000", accountId: card }, "refund-1");
  assert.equal(repository.allocations.filter(row => row.transactionId === refund.value.id).reduce((sum, row) => sum + row.amountMinor, 0n), 10000n);
  assert.equal(repository.transactions.get(refund.value.id)?.kind, "refund");
  const report = await service.monthlyReport("2026-10-01", "2026-10-31");
  assert.equal(report.BRL?.incomeMinor, "500000");
  assert.equal(report.BRL?.expenseMinor, "100000");

  const firstStatement = repository.statements.get(purchase.value.items[0]!.statementId)!;
  const closeResult = await service.closeStatement(firstStatement.id, "close-first-statement");
  assert.equal(closeResult.value.status, "closed");
  assert.equal((await service.closeStatement(firstStatement.id, "close-first-statement")).replayed, true);
  const paymentInput = { ...metadata, statementId: firstStatement.id, fromAccountId: checking, amountMinor: "20000" };
  const paid = await service.payStatement(paymentInput, "payment-1");
  const replay = await service.payStatement(paymentInput, "payment-1");
  assert.equal(replay.replayed, true);
  assert.equal(repository.payments.length, 1);
  assert.equal(await service.accountBalance(checking), 969000n);
  assert.equal(await service.accountBalance(card), -70000n);
  assert.equal(await service.availableCredit(card), 930000n);
  assert.equal((await service.statementDetail(firstStatement.id)).status, "partially_paid");
  await assert.rejects(() => service.reverseTransaction({ transactionId: paid.value.transaction.id, occurredOn: "2026-10-27", reason: "Pagamento" }, "reverse-payment", { actor: "owner", source: "manual" }), { code: "CONFLICT" });
  await assert.rejects(() => service.payStatement({ ...paymentInput, amountMinor: "1" }, "payment-1"), (error: unknown) => error instanceof DomainError && error.code === "IDEMPOTENCY_CONFLICT");
  await assert.rejects(() => service.createExpense({ ...metadata, occurredOn: "2025-12-31", accountId: checking, amountMinor: "1", paymentMethod: "pix", allocations: [{ categoryId: expenseCategory, amountMinor: "1" }] }, "before-opening"), (error: unknown) => error instanceof DomainError && error.code === "VALIDATION_ERROR");
  await assert.rejects(() => service.payStatement({ ...paymentInput, fromAccountId: card, amountMinor: "1" }, "bad-payment"), (error: unknown) => error instanceof DomainError && error.code === "INVALID_ACCOUNT_TYPE");
  assert.ok(paid.value.transaction.id);
  assert.equal(expense.value.kind, "expense");
});

test("vencimento em/antes do fechamento cai no mês seguinte e fatura fechada não é reescrita", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 20, billingTimezone: "Europe/Warsaw", billingMode: "manual" } }, "auto-card");
  await service.configureCard({ accountId: card, creditLimitMinor: null, closingDay: 20, dueDay: 20, billingTimezone: "Europe/Warsaw", billingMode: "manual" }, "auto-card-settings");
  const category = await service.createCategory({ name: "Gasto", type: "expense", parentId: null }, "auto-category");
  const purchase = await service.createCreditPurchase({ ...metadata, cardAccountId: card, totalAmountMinor: "100", installmentCount: 1, allocations: [{ categoryId: category, amountMinor: "100" }] }, "close-purchase");
  const statement = repository.statements.get(purchase.value.items[0]!.statementId)!;
  assert.equal(statement.dueOn, "2026-12-20");
  await service.closeStatement(statement.id, "close-statement");
  await assert.rejects(() => service.createCreditPurchase({ ...metadata, cardAccountId: card, totalAmountMinor: "100", installmentCount: 1, allocations: [{ categoryId: category, amountMinor: "100" }] }, "closed-cycle"), (error: unknown) => error instanceof DomainError && error.code === "CONFLICT");
  await service.configureCard({ accountId: card, creditLimitMinor: null, closingDay: 15, dueDay: 20, billingTimezone: "Europe/Warsaw", billingMode: "manual" }, "changed-settings");
  await assert.rejects(() => service.createCreditPurchase({ ...metadata, occurredOn: "2026-11-01", cardAccountId: card, totalAmountMinor: "100", installmentCount: 1, allocations: [{ categoryId: category, amountMinor: "100" }] }, "overlap-cycle"), (error: unknown) => error instanceof DomainError && error.code === "CONFLICT");
});

test("previsão avulsa só altera saldo no fluxo idempotente de realização; correções e reversões são rastreáveis", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const checking = await service.createAccount({ name: "Checking", type: "checking", currency: "BRL", openingBalanceMinor: 10_000n, openingDate: "2026-01-01", institutionId: null }, "forecast-account");
  const category = await service.createCategory({ name: "Food", type: "expense", parentId: null }, "forecast-category");
  const incomeCategory = await service.createCategory({ name: "Income", type: "income", parentId: null }, "forecast-income-category");
  const forecast = await service.createExpenseForecast({ accountId: checking, expectedOn: "2026-10-30", amountMinor: "2500", categoryId: category, description: "Market" }, "forecast-create");
  assert.equal(await service.accountBalance(checking), 10_000n);
  assert.equal((await service.monthlyReport("2026-10-01", "2026-10-31")).BRL?.expenseMinor, undefined);
  assert.equal((await service.listExpenseForecasts("2026-10-01", "2026-10-31", "BRL")).length, 1);
  const realized = await service.realizeExpenseForecast(forecast.value.id, { occurredOn: "2026-10-26", paymentMethod: "debit", source: "manual", reviewStatus: "confirmed" }, "forecast-realize");
  assert.equal(realized.value.transaction.kind, "expense");
  assert.equal(await service.accountBalance(checking), 7_500n);
  assert.equal((await service.realizeExpenseForecast(forecast.value.id, { occurredOn: "2026-10-26", paymentMethod: "debit", source: "manual", reviewStatus: "confirmed" }, "forecast-realize")).replayed, true);
  assert.equal(repository.entries.filter(item => item.transactionId === realized.value.transaction.id).length, 1);

  const cancelled = await service.createExpenseForecast({ accountId: checking, expectedOn: "2026-10-31", amountMinor: "100", categoryId: category, description: "Cancelled" }, "forecast-cancel-create");
  await service.cancelExpenseForecast(cancelled.value.id, "forecast-cancel");
  assert.equal((await service.listExpenseForecasts("2026-10-01", "2026-10-31"))[1]?.status, "cancelled");
  await assert.rejects(() => service.realizeExpenseForecast(cancelled.value.id, { occurredOn: "2026-10-31", paymentMethod: "cash", source: "manual", reviewStatus: "confirmed" }, "forecast-cancelled-realize"), { code: "CONFLICT" });

  const expense = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "500", paymentMethod: "pix", allocations: [{ categoryId: category, amountMinor: "500" }] }, "correctable-expense");
  await service.correctTransaction({ transactionId: expense.value.id, reason: "Classificação corrigida", metadata: { description: "Lunch" }, allocations: [{ categoryId: category, amountMinor: "500" }] }, "revision-one", { actor: "owner", source: "manual" });
  await service.correctTransaction({ transactionId: expense.value.id, reason: "Metadados revisados", metadata: { notes: "Revisão posterior" } }, "revision-two", { actor: "owner", source: "manual" });
  const revised = (await service.transactionHistory("2026-10-01", "2026-10-31")).find(item => item.id === expense.value.id)!;
  assert.equal(revised.description, "Lunch"); assert.equal(revised.notes, "Revisão posterior");
  assert.deepEqual(revised.revisions.map(item => item.revisionNumber), [1, 2]);
  assert.equal((await service.monthlyReport("2026-10-01", "2026-10-31")).BRL?.expenseMinor, "3000");

  const reversed = await service.reverseTransaction({ transactionId: expense.value.id, occurredOn: "2026-10-27", reason: "Lançado em duplicidade" }, "reverse-expense", { actor: "owner", source: "manual" });
  assert.equal(reversed.value.reversal.relatedTransactionId, expense.value.id);
  assert.equal(await service.accountBalance(checking), 7_500n);
  assert.equal((await service.monthlyReport("2026-10-01", "2026-10-31")).BRL?.expenseMinor, "2500");
  await assert.rejects(() => service.reverseTransaction({ transactionId: expense.value.id, occurredOn: "2026-10-27", reason: "Duplo" }, "reverse-expense-again", { actor: "owner", source: "manual" }), { code: "CONFLICT" });

  const salary = await service.createIncome({ ...metadata, accountId: checking, amountMinor: "100", categoryId: incomeCategory }, "reversed-salary");
  await service.reverseTransaction({ transactionId: salary.value.id, occurredOn: "2026-10-27", reason: "Corrigindo valor", replacement: { kind: "income", ...metadata, accountId: checking, amountMinor: "80", categoryId: incomeCategory } }, "reverse-with-replacement", { actor: "owner", source: "manual" });
  assert.equal((await service.monthlyReport("2026-10-01", "2026-10-31")).BRL?.incomeMinor, "80");
});

test("relatório por categoria usa última revisão, estornos, reversões e compra parcelada uma vez", async () => {
  const service = new FinanceService(new MemoryRepository());
  const checking = await service.createAccount({ name: "Checking", type: "checking", currency: "BRL", openingBalanceMinor: 100_000n, openingDate: "2026-01-01", institutionId: null }, "category-report-checking");
  const card = await service.createAccount({ name: "Card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "Europe/Warsaw", billingMode: "manual" } }, "category-report-card");
  const groceries = await service.createCategory({ name: "Mercado", type: "expense", parentId: null }, "category-report-groceries");
  const dining = await service.createCategory({ name: "Restaurante", type: "expense", parentId: null }, "category-report-dining");
  const salary = await service.createCategory({ name: "Salário", type: "income", parentId: null }, "category-report-salary");
  const expense = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "1000", paymentMethod: "debit", allocations: [{ categoryId: groceries, amountMinor: "1000" }] }, "category-report-expense");
  await service.correctTransaction({ transactionId: expense.value.id, reason: "Reclassificação", metadata: {}, allocations: [{ categoryId: dining, amountMinor: "1000" }] }, "category-report-revision", { actor: "owner", source: "manual" });
  await service.createRefund({ ...metadata, originalTransactionId: expense.value.id, amountMinor: "200", accountId: checking }, "category-report-refund");
  const reversed = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "300", paymentMethod: "cash", allocations: [{ categoryId: groceries, amountMinor: "300" }] }, "category-report-reversed");
  await service.reverseTransaction({ transactionId: reversed.value.id, occurredOn: "2026-10-27", reason: "Correção" }, "category-report-reversal", { actor: "owner", source: "manual" });
  await service.createIncome({ ...metadata, accountId: checking, amountMinor: "5000", categoryId: salary }, "category-report-income");
  await service.createCreditPurchase({ ...metadata, cardAccountId: card, totalAmountMinor: "900", installmentCount: 3, allocations: [{ categoryId: groceries, amountMinor: "900" }] }, "category-report-installment");
  const report = await service.categoryReport("2026-10-01", "2026-10-31");
  assert.deepEqual(report, [
    { currency: "BRL", categoryId: dining, categoryName: "Restaurante", incomeMinor: "0", expenseMinor: "800", netMinor: "-800" },
    { currency: "BRL", categoryId: salary, categoryName: "Salário", incomeMinor: "5000", expenseMinor: "0", netMinor: "5000" },
    { currency: "BRL", categoryId: groceries, categoryName: "Mercado", incomeMinor: "0", expenseMinor: "900", netMinor: "-900" },
  ]);
  assert.equal(categoryReportResponseSchema.safeParse({ ok: true, data: report }).success, true);
});

test("fechamento automático usa data local do cartão, faz catch-up e não cria movimentos", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  await assert.rejects(() => service.createAccount({ name: "Invalid zone", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "Mars/Phobos", billingMode: "automatic" } }, "invalid-zone-card"), { code: "VALIDATION_ERROR" });
  const makeCard = (name: string, billingTimezone: string, billingMode: "manual" | "automatic") => service.createAccount({ name, type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone, billingMode } }, `card-${name}`);
  const saoPaulo = await makeCard("SP", "America/Sao_Paulo", "automatic"), warsaw = await makeCard("Warsaw", "Europe/Warsaw", "automatic"), manual = await makeCard("Manual", "America/Sao_Paulo", "manual");
  const create = async (cardAccountId: string, closingOn: string) => service.createStatement({ cardAccountId, cycleStartOn: closingOn.slice(0, 7) + "-01", closingOn, dueOn: "2026-10-31" });
  const spDue = await create(saoPaulo, "2026-10-25"), warsawDue = await create(warsaw, "2026-10-26"), manualDue = await create(manual, "2026-10-25");
  const before = repository.entries.length;
  const result = await service.closeDueAutomaticStatements("2026-10-26T02:00:00.000Z");
  assert.equal(result.closedCount, 2);
  assert.equal(repository.statements.get(spDue.id)?.status, "closed");
  assert.equal(repository.statements.get(warsawDue.id)?.status, "closed");
  assert.equal(repository.statements.get(manualDue.id)?.status, "open");
  assert.equal(repository.entries.length, before);
  assert.equal((await service.closeDueAutomaticStatements("2026-10-26T02:00:00.000Z")).closedCount, 0);
});

test("reversões preservam conciliação de estornos, cartões e categorias", async () => {
  const service = new FinanceService(new MemoryRepository());
  const checking = await service.createAccount({ name: "Checking", type: "checking", currency: "BRL", openingBalanceMinor: 10000n, openingDate: "2026-01-01", institutionId: null }, "guards-checking");
  const card = await service.createAccount({ name: "Card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "guards-card");
  const card2 = await service.createAccount({ name: "Card 2", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "guards-card-2");
  const expenseCategory = await service.createCategory({ name: "Expense", type: "expense", parentId: null }, "guards-expense-category");
  const incomeCategory = await service.createCategory({ name: "Income", type: "income", parentId: null }, "guards-income-category");
  const expense = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "1000", paymentMethod: "pix", allocations: [{ categoryId: expenseCategory, amountMinor: "1000" }] }, "guards-expense");
  await service.createRefund({ ...metadata, originalTransactionId: expense.value.id, amountMinor: "100", accountId: checking }, "guards-refund");
  await assert.rejects(() => service.reverseTransaction({ transactionId: expense.value.id, occurredOn: "2026-10-27", reason: "Invalid duplicate credit" }, "guards-refund-reverse", { actor: "owner", source: "manual" }), { code: "CONFLICT" });
  await assert.rejects(() => service.correctTransaction({ transactionId: expense.value.id, reason: "Reallocate", metadata: {}, allocations: [{ categoryId: expenseCategory, amountMinor: "1000" }] }, "guards-refund-reclassify", { actor: "owner", source: "manual" }), { code: "CONFLICT" });

  const reversed = await service.createExpense({ ...metadata, accountId: checking, amountMinor: "200", paymentMethod: "cash", allocations: [{ categoryId: expenseCategory, amountMinor: "200" }] }, "guards-reversed-expense");
  await service.reverseTransaction({ transactionId: reversed.value.id, occurredOn: "2026-10-27", reason: "Void" }, "guards-reversal", { actor: "owner", source: "manual" });
  await assert.rejects(() => service.createRefund({ ...metadata, originalTransactionId: reversed.value.id, amountMinor: "100", accountId: checking }, "guards-refund-reversed"), { code: "INVALID_REFUND" });

  const statement = await service.createStatement({ cardAccountId: card, cycleStartOn: "2026-10-01", closingOn: "2026-10-20", dueOn: "2026-10-28" });
  const cashback = await service.createCashback({ ...metadata, accountId: card, amountMinor: "50", categoryId: incomeCategory, cardStatementId: statement.id }, "guards-card-cashback");
  await assert.rejects(() => service.reverseTransaction({ transactionId: cashback.value.id, occurredOn: "2026-10-27", reason: "Reverse card credit" }, "guards-card-cashback-reverse", { actor: "owner", source: "manual" }), { code: "CONFLICT" });
  const cardTransfer = await service.createTransfer({ ...metadata, fromAccountId: card, toAccountId: card2, amountMinor: "25" }, "guards-card-transfer");
  await assert.rejects(() => service.reverseTransaction({ transactionId: cardTransfer.value.id, occurredOn: "2026-10-27", reason: "Reverse card transfer" }, "guards-card-transfer-reverse", { actor: "owner", source: "manual" }), { code: "CONFLICT" });
  const cardPurchase = await service.createCreditPurchase({ ...metadata, cardAccountId: card, totalAmountMinor: "100", installmentCount: 1, allocations: [{ categoryId: expenseCategory, amountMinor: "100" }] }, "guards-card-purchase");
  await assert.rejects(() => service.reverseTransaction({ transactionId: cardPurchase.value.transaction.id, occurredOn: "2026-10-27", reason: "Reverse card purchase" }, "guards-card-purchase-reverse", { actor: "owner", source: "manual" }), { code: "CONFLICT" });
});

test("reembolso de cartão usa data postada e alocações efetivas também no preview", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const card = await service.createAccount({ name: "Card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "refund-card");
  const categoryA = await service.createCategory({ name: "A", type: "expense", parentId: null }, "refund-cat-a");
  const categoryB = await service.createCategory({ name: "B", type: "expense", parentId: null }, "refund-cat-b");
  const purchase = await service.createCreditPurchase({ ...metadata, occurredOn: "2026-10-19", cardAccountId: card, totalAmountMinor: "10000", installmentCount: 1, allocations: [{ categoryId: categoryA, amountMinor: "10000" }] }, "refund-purchase");
  await service.correctTransaction({ transactionId: purchase.value.transaction.id, reason: "Categoria corrigida", metadata: {}, allocations: [{ categoryId: categoryB, amountMinor: "10000" }] }, "refund-correction", { actor: "owner", source: "manual" });
  const preview = await service.previewTransaction({ ...metadata, occurredOn: "2026-10-19", postedOn: "2026-10-21", operation: "refund", originalTransactionId: purchase.value.transaction.id, amountMinor: "2000", accountId: card });
  assert.deepEqual(preview.allocations, [{ categoryId: categoryB, amountMinor: "2000" }]);
  assert.equal(preview.statementId, undefined);
  assert.deepEqual(preview.statementPlan, { cycleStartOn: "2026-10-20", closingOn: "2026-11-20", dueOn: "2026-11-28" });
  const refund = await service.createRefund({ ...metadata, occurredOn: "2026-10-19", postedOn: "2026-10-21", originalTransactionId: purchase.value.transaction.id, amountMinor: "2000", accountId: card }, "refund-commit");
  const detail = await service.statementDetail(preview.statementId ?? [...repository.statements.values()].find(item => item.closingOn === "2026-11-20")!.id);
  assert.equal(detail.items.find(item => item.sourceTransactionId === refund.value.id)?.amountMinor, -2000n);
  assert.deepEqual((await service.transactionHistory("2026-10-01", "2026-10-31")).find(item => item.id === refund.value.id)?.allocations.map(item => [item.categoryId, item.amountMinor]), [[categoryB, 2000n]]);
});


test("monthly series preserves ISO years below 100 and the final supported year", async () => {
  const service = new FinanceService(new MemoryRepository());
  const ancient = await service.monthlySeries("0001-01-15", "0001-02-10");
  assert.deepEqual(ancient.map(row => [row.from, row.to]), [["0001-01-15", "0001-01-31"], ["0001-02-01", "0001-02-10"]]);
  const final = await service.monthlySeries("9999-12-01", "9999-12-31");
  assert.equal(final.length, 1);
  assert.equal(final[0]?.to, "9999-12-31");
});

test("ajuste de fatura reconhece somente a diferença como despesa e dívida, sem parcelas futuras", async () => {
  const repository = new MemoryRepository(), service = new FinanceService(repository);
  const categoryId = await service.createCategory({ name: "Ajuste de fatura", type: "expense", parentId: null }, "adjust-category");
  const card = await service.createAccount({ name: "Cartão", type: "credit_card", currency: "BRL", openingBalanceMinor: -80000n, openingDate: "2026-10-01", institutionId: null, cardSettings: { creditLimitMinor: null, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "adjust-card");
  const statement = await service.createStatement({ cardAccountId: card, cycleStartOn: "2026-10-20", closingOn: "2026-11-20", dueOn: "2026-11-28" });
  const input = { ...metadata, cardAccountId: card, statementId: statement.id, amountMinor: "30000", confirmsUnrecordedDebt: true as const };
  const preview = await service.previewTransaction({ ...input, operation: "statement_adjustment" });
  assert.deepEqual(preview.allocations, [{ categoryId, amountMinor: "-30000" }]);
  assert.equal(repository.entries.length, 0);
  const created = await service.createStatementAdjustment(input, "adjust-once");
  assert.equal((await service.createStatementAdjustment(input, "adjust-once")).replayed, true);
  assert.equal(repository.entries.length, 1);
  assert.equal(repository.entries[0]!.amountMinor, -30000n);
  assert.equal(repository.items.length, 1);
  assert.equal(repository.items[0]!.itemType, "adjustment");
  assert.equal(repository.items[0]!.installmentPlanId, null);
  assert.equal(repository.plans.size, 0);
  assert.equal(repository.allocations[0]!.categoryId, categoryId);
  assert.equal((await service.statementDetail(statement.id)).billedMinor, 30000n);
  const report = await service.categoryReport("2026-10-01", "2026-10-31");
  assert.equal(report.find(row => row.categoryId === categoryId)?.expenseMinor, "30000");
  assert.equal(created.value.kind, "expense");
  await assert.rejects(service.createStatementAdjustment({ ...input, amountMinor: "31000" }, "adjust-once"), { code: "IDEMPOTENCY_CONFLICT" });
  for (const amountMinor of ["0", "-1", "9223372036854775808"]) await assert.rejects(service.createStatementAdjustment({ ...input, amountMinor }, `invalid-${amountMinor}`), { code: "VALIDATION_ERROR" });
  await assert.rejects(service.createStatementAdjustment({ ...input, occurredOn: "2026-09-30" }, "adjust-before-opening"), { code: "VALIDATION_ERROR" });
  repository.categories.get(categoryId)!.isArchived = true;
  await assert.rejects(service.createStatementAdjustment(input, "adjust-archived"), { code: "CONFLICT" });
  repository.categories.get(categoryId)!.isArchived = false;
  await service.closeStatement(statement.id, "adjust-close");
  await assert.rejects(service.previewTransaction({ ...input, operation: "statement_adjustment" }), { code: "CONFLICT" });
  await assert.rejects(service.createStatementAdjustment(input, "adjust-closed"), { code: "CONFLICT" });
  assert.equal(repository.entries.length, 1);
});

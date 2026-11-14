import type {
  CreateStatementAdjustmentInput, CreateCashbackInput, CreateCreditPurchaseInput, CreateExpenseInput, CreateIncomeInput, CreateRefundInput,
  CreateStatementInput, CreateTransferInput, DomainErrorCode, PayStatementInput,
  PreviewTransactionInput, PreviewTransactionOutput, CreateExpenseForecastInput, CategoryReport,
  RealizeExpenseForecastInput, CorrectTransactionInput, ReverseTransactionInput, TransactionAuditContext,
} from "@finance/contracts";

export type UUID = string;
export type Minor = bigint;
export type Account = { id: UUID; name: string; type: "checking" | "savings" | "cash" | "credit_card"; currency: string; openingBalanceMinor: Minor; openingDate: string; institutionId: UUID | null; isArchived: boolean };
export type Institution = { id: UUID; name: string; isArchived: boolean };
export type Category = { id: UUID; name: string; type: "income" | "expense"; parentId: UUID | null; isArchived: boolean };
export type CardSettings = { creditLimitMinor: Minor | null; closingDay: number; dueDay: number; billingTimezone: string; billingMode: "manual" | "automatic" };
export type CreateAccountCommand = Omit<Account, "id" | "isArchived"> & { id?: UUID; cardSettings?: CardSettings };
export type Transaction = { id: UUID; kind: string; occurredOn: string; postedOn: string | null; description: string; counterpartyName: string | null; notes: string | null; reviewStatus: "confirmed" | "needs_review"; paymentMethod: string | null; relatedTransactionId: UUID | null; idempotencyKey: string | null; source: string };
export type ExpenseForecast = CreateExpenseForecastInput & { id: UUID; currency: string; status: "projected" | "realized" | "cancelled"; realizedTransactionId: UUID | null; createdAt: string };
export type TransactionRevision = { id: UUID; transactionId: UUID; revisionNumber: number; reason: string; actor: string; source: string; metadata: Partial<Pick<Transaction, "description" | "counterpartyName" | "notes" | "reviewStatus">>; allocations: Array<{ categoryId: UUID | null; amountMinor: Minor }> | null; createdAt: string };
export type Entry = { id: UUID; transactionId: UUID; accountId: UUID; amountMinor: Minor };
export type Allocation = { id: UUID; transactionId: UUID; categoryId: UUID | null; amountMinor: Minor };
export type Statement = { id: UUID; cardAccountId: UUID; cycleStartOn: string; closingOn: string; dueOn: string; status: "open" | "closed" | "paid" | "partially_paid" | "overdue" };
type RefundStatementTarget = { statement: Statement; plan: null } | { statement: null; plan: { cycleStartOn: string; closingOn: string; dueOn: string } };
export type StatementItem = { id: UUID; statementId: UUID; sourceTransactionId: UUID; installmentPlanId: UUID | null; installmentNumber: number | null; itemType: string; amountMinor: Minor; description: string };
export type InstallmentPlan = { id: UUID; purchaseTransactionId: UUID; totalAmountMinor: Minor; installmentCount: number };
export type StatementPayment = { id: UUID; statementId: UUID; transferTransactionId: UUID; amountMinor: Minor };
export type Persisted<T> = { value: T; replayed: boolean };
export type Idempotency = { key: string; payload: unknown };

export type ReportingData = { transactions: Transaction[]; entries: Entry[]; allocations: Allocation[]; revisions: TransactionRevision[]; accounts: Account[]; categories: Category[] };

export interface TransactionContext {
  readonly reporting: { load(): Promise<ReportingData> };
  readonly institutions: { get(id: UUID): Promise<Institution | null>; save(value: Institution): Promise<void>; list(): Promise<Institution[]> };
  readonly accounts: { get(id: UUID): Promise<Account | null>; save(value: Account): Promise<void>; balance(id: UUID, through?: string): Promise<Minor>; list(): Promise<Account[]> };
  readonly categories: { get(id: UUID): Promise<Category | null>; save(value: Category & { name: string; parentId: UUID | null }): Promise<void>; list(): Promise<Category[]> };
  readonly transactions: { save(value: Transaction): Promise<void>; findByIdempotency(key: string): Promise<{ transaction: Transaction; payload: unknown } | null>; get(id: UUID): Promise<Transaction | null>; list(from: string, to: string): Promise<Transaction[]> };
  readonly entries: { add(value: Omit<Entry, "id">): Promise<Entry>; listByAccount(id: UUID, through?: string): Promise<Entry[]>; listByTransaction(id: UUID): Promise<Entry[]> };
  readonly allocations: { addMany(values: Array<Omit<Allocation, "id">>): Promise<Allocation[]>; listByTransaction(id: UUID): Promise<Allocation[]> };
  readonly forecasts: { save(value: ExpenseForecast): Promise<void>; get(id: UUID, lock?: boolean): Promise<ExpenseForecast | null>; list(from: string, to: string, currency?: string): Promise<ExpenseForecast[]> };
  readonly revisions: { add(value: TransactionRevision): Promise<void>; listByTransaction(id: UUID): Promise<TransactionRevision[]> };
  readonly cards: {
    getSettings(accountId: UUID): Promise<{ accountId: UUID; creditLimitMinor: Minor | null; closingDay: number; dueDay: number; billingTimezone: string; billingMode: "manual" | "automatic" } | null>;
    saveSettings(value: { accountId: UUID; creditLimitMinor: Minor | null; closingDay: number; dueDay: number; billingTimezone: string; billingMode: "manual" | "automatic" }): Promise<void>;
  };
  readonly statements: {
    get(id: UUID): Promise<Statement | null>; findByClosingDate(cardAccountId: UUID, closingOn: string): Promise<Statement | null>;
    list(cardAccountId: UUID, from?: string, to?: string): Promise<Statement[]>; save(value: Statement): Promise<void>;
    addItems(values: Array<Omit<StatementItem, "id">>): Promise<StatementItem[]>; items(id: UUID): Promise<StatementItem[]>;
  };
  readonly installmentPlans: { save(value: InstallmentPlan): Promise<void>; getByPurchase(id: UUID): Promise<InstallmentPlan | null> };
  readonly payments: { save(value: StatementPayment): Promise<void>; list(statementId: UUID): Promise<StatementPayment[]>; findByTransfer(id: UUID): Promise<StatementPayment[]> };
  readonly idempotency: { claim(key: string, payload: unknown): Promise<{ replayed: boolean; result: unknown | null }> ; complete(key: string, result: unknown): Promise<void> };
}

export interface FinanceRepository {
  /** Must provide serializable/row-locked atomic writes, unique idempotency claims, and conflict on payload mismatch. */
  transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, message: string, readonly details?: Record<string, unknown>) { super(message); this.name = "DomainError"; }
}

const fail = (code: DomainErrorCode, message: string, details?: Record<string, unknown>): never => { throw new DomainError(code, message, details); };
const asMinor = (value: string): bigint => BigInt(value);
const id = (): UUID => globalThis.crypto.randomUUID();
function isIanaTimeZone(value: string): boolean { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }

export function splitInstallments(total: Minor, count: number): Minor[] {
  if (total <= 0n || !Number.isInteger(count) || count < 1 || count > 120 || total < BigInt(count)) fail("VALIDATION_ERROR", "Total e número de parcelas inválidos");
  const base = total / BigInt(count);
  const remainder = total % BigInt(count);
  return Array.from({ length: count }, (_, index) => base + (index === count - 1 ? remainder : 0n));
}

export function addMonths(date: string, months: number, day: number): string {
  const [year, month] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function dueDate(closingOn: string, closingDay: number, dueDay: number): string {
  const dueInClosingMonth = addMonths(closingOn, 0, dueDay);
  return dueDay <= closingDay ? addMonths(dueInClosingMonth, 1, dueDay) : dueInClosingMonth;
}

function splitByCurrency<T extends { currency: string }>(rows: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(row.currency, [...(result.get(row.currency) ?? []), row]);
  return result;
}

export class FinanceService {
  constructor(private readonly repository: FinanceRepository) {}

  private async idempotent<T>(operation: string, key: string, payload: unknown, work: (tx: TransactionContext) => Promise<T>): Promise<Persisted<T>> {
    return this.repository.transaction(async tx => {
      const fingerprint = JSON.parse(JSON.stringify({ operation, payload }, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value));
      const claim = await tx.idempotency.claim(key, fingerprint);
      if (claim.replayed && claim.result !== null) return { value: claim.result as T, replayed: true };
      const result = await work(tx);
      await tx.idempotency.complete(key, result);
      return { value: result, replayed: false };
    });
  }

  async createInstitution(input: { id?: UUID; name: string }, key: string): Promise<UUID> {
    return (await this.idempotent("createInstitution", key, input, async tx => { const institutionId = input.id ?? id(); if (await tx.institutions.get(institutionId)) fail("CONFLICT", "Instituição já existe"); await tx.institutions.save({ id: institutionId, name: input.name.trim(), isArchived: false }); return institutionId; })).value;
  }

  async createAccount(input: CreateAccountCommand, key: string): Promise<UUID> {
    return (await this.idempotent("createAccount", key, input, async tx => {
      if (input.currency !== "BRL") fail("CURRENCY_MISMATCH", "Somente BRL é suportado");
      if (input.cardSettings && !isIanaTimeZone(input.cardSettings.billingTimezone)) fail("VALIDATION_ERROR", "Fuso horário IANA inválido");
      if (input.institutionId && !await tx.institutions.get(input.institutionId)) fail("NOT_FOUND", "Instituição não encontrada");
      if (input.type === "credit_card" && !input.cardSettings) fail("VALIDATION_ERROR", "Configuração obrigatória para cartão");
      if (input.type !== "credit_card" && input.cardSettings) fail("INVALID_ACCOUNT_TYPE", "Configuração de cartão não se aplica a esta conta");
      const accountId = input.id ?? id();
      if (await tx.accounts.get(accountId)) fail("CONFLICT", "Conta já existe");
      const { cardSettings, ...accountInput } = input;
      await tx.accounts.save({ ...accountInput, id: accountId, isArchived: false });
      if (cardSettings) await tx.cards.saveSettings({ ...cardSettings, accountId });
      return accountId;
    })).value;
  }

  async configureCard(input: { accountId: UUID; creditLimitMinor: Minor | null; closingDay: number; dueDay: number; billingTimezone: string; billingMode: "manual" | "automatic" }, key: string): Promise<void> {
    await this.idempotent("configureCard", key, input, async tx => {
      if (!isIanaTimeZone(input.billingTimezone)) fail("VALIDATION_ERROR", "Fuso horário IANA inválido");
      const account = await this.requireAccount(tx, input.accountId);
      if (account.type !== "credit_card") fail("INVALID_ACCOUNT_TYPE", "Configuração exige conta de cartão");
      if (input.closingDay < 1 || input.closingDay > 31 || input.dueDay < 1 || input.dueDay > 31 || input.creditLimitMinor !== null && input.creditLimitMinor < 0n) fail("VALIDATION_ERROR", "Configuração de cartão inválida");
      await tx.cards.saveSettings(input);
      return true;
    });
  }

  async createCategory(input: { id?: UUID; name: string; type: "income" | "expense"; parentId: UUID | null }, key: string): Promise<UUID> {
    return (await this.idempotent("createCategory", key, input, async tx => {
      if (input.parentId && !await tx.categories.get(input.parentId)) fail("NOT_FOUND", "Categoria pai não encontrada");
      if (input.id && input.id === input.parentId) fail("VALIDATION_ERROR", "Categoria não pode ser pai de si mesma");
      const categoryId = input.id ?? id(); if (await tx.categories.get(categoryId)) fail("CONFLICT", "Categoria já existe"); await tx.categories.save({ ...input, id: categoryId, isArchived: false }); return categoryId;
    })).value;
  }

  async createIncome(input: CreateIncomeInput, key: string): Promise<Persisted<Transaction>> {
    return this.idempotent("createIncome", key, input, tx => this.persistIncome(tx, input, key));
  }

  async createExpense(input: CreateExpenseInput, key: string): Promise<Persisted<Transaction>> {
    return this.idempotent("createExpense", key, input, async tx => {
      return this.persistExpense(tx, input, key);
    });
  }

  async createExpenseForecast(input: CreateExpenseForecastInput, key: string): Promise<Persisted<ExpenseForecast>> {
    return this.idempotent("createExpenseForecast", key, input, async tx => {
      const account = await this.requireAccount(tx, input.accountId);
      this.ensureAllowedAccount(account, false); this.assertAfterOpening(account, input.expectedOn);
      await this.validateAllocations(tx, [{ categoryId: input.categoryId, amountMinor: -asMinor(input.amountMinor) }], "expense");
      const forecast: ExpenseForecast = { ...input, description: input.description.trim(), id: id(), currency: account.currency, status: "projected", realizedTransactionId: null, createdAt: new Date().toISOString() };
      await tx.forecasts.save(forecast); return forecast;
    });
  }

  async listExpenseForecasts(from: string, to: string, currency?: string, includePending = false): Promise<ExpenseForecast[]> {
    return this.repository.transaction(async tx => {
      if (!includePending) return tx.forecasts.list(from, to, currency);
      return (await tx.forecasts.list("0001-01-01", "9999-12-31", currency)).filter(row => row.status === "projected" || (row.expectedOn >= from && row.expectedOn <= to));
    });
  }

  async realizeExpenseForecast(forecastId: UUID, input: RealizeExpenseForecastInput, key: string): Promise<Persisted<{ forecast: ExpenseForecast; transaction: Transaction }>> {
    return this.idempotent("realizeExpenseForecast", key, { forecastId, input }, async tx => {
      const forecast = await tx.forecasts.get(forecastId, true);
      if (!forecast) return fail("NOT_FOUND", "Previsão não encontrada");
      if (forecast.status !== "projected") return fail("CONFLICT", "Previsão não está projetada");
      const transaction = await this.persistExpense(tx, {
        occurredOn: input.occurredOn, postedOn: input.postedOn, description: forecast.description,
        accountId: forecast.accountId, amountMinor: forecast.amountMinor, paymentMethod: input.paymentMethod,
        source: input.source, reviewStatus: input.reviewStatus,
        counterpartyName: null, notes: null, allocations: [{ categoryId: forecast.categoryId, amountMinor: forecast.amountMinor }],
      }, key);
      const realized = { ...forecast, status: "realized" as const, realizedTransactionId: transaction.id };
      await tx.forecasts.save(realized); return { forecast: realized, transaction };
    });
  }

  async cancelExpenseForecast(forecastId: UUID, key: string): Promise<Persisted<ExpenseForecast>> {
    return this.idempotent("cancelExpenseForecast", key, { forecastId }, async tx => {
      const forecast = await tx.forecasts.get(forecastId, true);
      if (!forecast) return fail("NOT_FOUND", "Previsão não encontrada");
      if (forecast.status !== "projected") return fail("CONFLICT", "Somente previsão projetada pode ser cancelada");
      const cancelled = { ...forecast, status: "cancelled" as const }; await tx.forecasts.save(cancelled); return cancelled;
    });
  }

  async correctTransaction(input: CorrectTransactionInput, key: string, audit: TransactionAuditContext): Promise<Persisted<TransactionRevision>> {
    return this.idempotent("correctTransaction", key, { input, audit }, async tx => {
      if (Object.keys(input.metadata).length === 0 && input.allocations === undefined) return fail("VALIDATION_ERROR", "Informe ao menos um campo a corrigir");
      const transaction = await tx.transactions.get(input.transactionId);
      if (!transaction || !["income", "expense", "transfer"].includes(transaction.kind)) return fail("CONFLICT", "Tipo de transação não permite correção de metadados");
      const existingRefunds = (await tx.transactions.list("0001-01-01", "9999-12-31")).some(item => item.kind === "refund" && item.relatedTransactionId === transaction.id);
      if (input.allocations && existingRefunds) return fail("CONFLICT", "Não reclassifique categorias após reembolso; preserve os valores já conciliados");
      const priorRevisions = await tx.revisions.listByTransaction(transaction.id);
      const current = [...priorRevisions].reverse().find(revision => revision.allocations !== null)?.allocations ?? await tx.allocations.listByTransaction(transaction.id);
      if (input.allocations) {
        if (transaction.kind === "transfer") return fail("CONFLICT", "Transferência não possui classificação por categoria");
        const sign = transaction.kind === "income" ? 1n : -1n;
        const next = input.allocations.map(item => ({ categoryId: item.categoryId, amountMinor: sign * asMinor(item.amountMinor) }));
        this.assertAllocationSum(next, current.reduce((sum, allocation) => sum + allocation.amountMinor, 0n));
        await this.validateAllocations(tx, next, transaction.kind === "income" ? "income" : "expense");
      }
      const revision: TransactionRevision = {
        id: id(), transactionId: transaction.id, revisionNumber: priorRevisions.length + 1, reason: input.reason, actor: audit.actor, source: audit.source,
        metadata: input.metadata, allocations: input.allocations?.map(item => ({ categoryId: item.categoryId, amountMinor: (transaction.kind === "income" ? 1n : -1n) * asMinor(item.amountMinor) })) ?? null,
        createdAt: new Date().toISOString(),
      };
      await tx.revisions.add(revision); return revision;
    });
  }

  async reverseTransaction(input: ReverseTransactionInput, key: string, audit: TransactionAuditContext): Promise<Persisted<{ reversal: Transaction; replacement: Transaction | null }>> {
    return this.idempotent("reverseTransaction", key, { input, audit }, async tx => {
      const original = await tx.transactions.get(input.transactionId);
      if (!original || !["income", "expense", "transfer"].includes(original.kind)) return fail("CONFLICT", "Só é possível reverter receita, despesa avulsa ou transferência");
      if (original.kind === "expense" && original.paymentMethod === "credit") return fail("CONFLICT", "Compra no crédito exige correção via estorno vinculado; parcelas permanecem inalteradas");
      if ((await tx.payments.findByTransfer(original.id)).length) return fail("CONFLICT", "Pagamento de fatura não pode ser revertido por esta operação");
      const allTransactions = await tx.transactions.list("0001-01-01", "9999-12-31");
      const existingReverse = allTransactions.find(item => item.kind === "adjustment" && item.relatedTransactionId === original.id);
      if (existingReverse) return fail("CONFLICT", "Transação já possui reversão");
      const originalEntries = await tx.entries.listByTransaction(original.id);
      for (const entry of originalEntries) {
        const account = await this.requireAccount(tx, entry.accountId);
        if (account.type === "credit_card") return fail("CONFLICT", "Reversão em conta de cartão pode divergir da fatura; use estorno vinculado quando aplicável");
        this.assertAfterOpening(account, input.occurredOn);
      }
      if (original.kind === "expense" && allTransactions.some(item => item.kind === "refund" && item.relatedTransactionId === original.id)) return fail("CONFLICT", "Despesa com reembolso não pode ser revertida");
      const reversal: Transaction = { ...this.transactionFrom({ occurredOn: input.occurredOn, description: `Reversão: ${original.description}`, notes: input.reason, source: audit.source }, "adjustment", original.id, `${key}:reversal`, null), counterpartyName: null };
      await tx.transactions.save(reversal);
      for (const entry of originalEntries) await tx.entries.add({ transactionId: reversal.id, accountId: entry.accountId, amountMinor: -entry.amountMinor });
      for (const allocation of await tx.allocations.listByTransaction(original.id)) await tx.allocations.addMany([{ transactionId: reversal.id, categoryId: allocation.categoryId, amountMinor: -allocation.amountMinor }]);
      let replacement: Transaction | null = null;
      if (input.replacement) {
        const command = input.replacement;
        if (command.kind === "income") replacement = await this.persistIncome(tx, { ...command, source: audit.source }, `${key}:replacement`);
        else if (command.kind === "expense") replacement = await this.persistExpense(tx, { ...command, source: audit.source }, `${key}:replacement`);
        else replacement = await this.persistTransfer(tx, { ...command, source: audit.source }, `${key}:replacement`);
      }
      await tx.revisions.add({ id: id(), transactionId: reversal.id, revisionNumber: 1, reason: input.reason, actor: audit.actor, source: audit.source, metadata: {}, allocations: null, createdAt: new Date().toISOString() });
      return { reversal, replacement };
    });
  }

  async createTransfer(input: CreateTransferInput, key: string): Promise<Persisted<Transaction>> {
    return this.idempotent("createTransfer", key, input, tx => this.persistTransfer(tx, input, key));
  }

  async createCreditPurchase(input: CreateCreditPurchaseInput, key: string): Promise<Persisted<{ transaction: Transaction; plan: InstallmentPlan; items: StatementItem[] }>> {
    return this.idempotent("createCreditPurchase", key, input, async tx => {
      const { card, settings, total, allocations, dates } = await this.prepareCreditPurchase(tx, input);
      const transaction = this.transactionFrom(input, "expense", null, key, "credit"); await tx.transactions.save(transaction);
      await tx.entries.add({ transactionId: transaction.id, accountId: card.id, amountMinor: -total });
      await tx.allocations.addMany(allocations.map(a => ({ transactionId: transaction.id, categoryId: a.categoryId, amountMinor: a.amountMinor })));
      const plan = { id: id(), purchaseTransactionId: transaction.id, totalAmountMinor: total, installmentCount: input.installmentCount }; await tx.installmentPlans.save(plan);
      const split = splitInstallments(total, input.installmentCount), statements = await Promise.all(split.map((_, n) => this.ensureStatement(tx, card.id, dates.closingOn, dates.cycleStartOn, settings.closingDay, settings.dueDay, n)));
      const items = await tx.statements.addItems(split.map((amountMinor, index) => ({ statementId: statements[index]!.id, sourceTransactionId: transaction.id, installmentPlanId: plan.id, installmentNumber: index + 1, itemType: "purchase", amountMinor, description: `${input.description} (${index + 1}/${input.installmentCount})` })));
      return { transaction, plan, items };
    });
  }

  async createStatementAdjustment(input: CreateStatementAdjustmentInput, key: string): Promise<Persisted<Transaction>> {
    return this.idempotent("createStatementAdjustment", key, input, async tx => {
      const { statement: existing, card, category, amount, planned } = await this.prepareStatementAdjustment(tx, input);
      const statement = existing ?? await this.ensureStatement(tx, card.id, planned!.dates.closingOn, planned!.dates.cycleStartOn, planned!.settings.closingDay, planned!.settings.dueDay, 0);
      const transaction = this.transactionFrom(input, "expense", null, key, "credit");
      await tx.transactions.save(transaction);
      await tx.entries.add({ transactionId: transaction.id, accountId: card.id, amountMinor: -amount });
      await tx.allocations.addMany([{ transactionId: transaction.id, categoryId: category.id, amountMinor: -amount }]);
      await tx.statements.addItems([{ statementId: statement.id, sourceTransactionId: transaction.id, installmentPlanId: null, installmentNumber: null, itemType: "adjustment", amountMinor: amount, description: input.description }]);
      return transaction;
    });
  }

  async createCashback(input: CreateCashbackInput, key: string): Promise<Persisted<Transaction>> {
    return this.idempotent("createCashback", key, input, async tx => {
      const { account, statement } = await this.prepareCashback(tx, input);
      const amount = asMinor(input.amountMinor);
      const transaction = this.transactionFrom(input, "income", null, key, input.cardStatementId ? "credit" : null); await tx.transactions.save(transaction);
      await tx.entries.add({ transactionId: transaction.id, accountId: account.id, amountMinor: amount });
      await tx.allocations.addMany([{ transactionId: transaction.id, categoryId: input.categoryId, amountMinor: amount }]);
      if (statement) await tx.statements.addItems([{ statementId: statement.id, sourceTransactionId: transaction.id, installmentPlanId: null, installmentNumber: null, itemType: "cashback", amountMinor: -amount, description: input.description }]);
      return transaction;
    });
  }

  async createRefund(input: CreateRefundInput, key: string): Promise<Persisted<Transaction>> {
    return this.idempotent("createRefund", key, input, async tx => {
      const { original, account, amount, allocations: refundAllocations, target } = await this.prepareRefund(tx, input);
      const transaction = this.transactionFrom(input, "refund", original.id, key, original.paymentMethod);
      await tx.transactions.save(transaction); await tx.entries.add({ transactionId: transaction.id, accountId: input.accountId, amountMinor: amount });
      await tx.allocations.addMany(refundAllocations.map(a => ({ transactionId: transaction.id, categoryId: a.categoryId, amountMinor: a.amountMinor })));
      if (account.type === "credit_card") {
        const settings = await tx.cards.getSettings(account.id); if (!settings) return fail("NOT_FOUND", "Configuração do cartão não encontrada");
        const statement = target!.statement ?? await this.ensureStatement(tx, account.id, target!.plan!.closingOn, target!.plan!.cycleStartOn, settings.closingDay, settings.dueDay, 0);
        await tx.statements.addItems([{ statementId: statement.id, sourceTransactionId: transaction.id, installmentPlanId: null, installmentNumber: null, itemType: "refund", amountMinor: -amount, description: input.description }]);
      }
      return transaction;
    });
  }

  async createStatement(input: CreateStatementInput): Promise<Statement> {
    return this.repository.transaction(async tx => {
      const card = await this.requireAccount(tx, input.cardAccountId); if (card.type !== "credit_card") fail("INVALID_ACCOUNT_TYPE", "Fatura exige cartão");
      if (input.cycleStartOn >= input.closingOn || input.dueOn < input.closingOn) fail("VALIDATION_ERROR", "Datas do ciclo inválidas");
      const existing = await tx.statements.findByClosingDate(card.id, input.closingOn); if (existing) return existing;
      await this.assertNoStatementOverlap(tx, card.id, input.cycleStartOn, input.closingOn);
      const statement: Statement = { ...input, id: id(), status: "open" }; await tx.statements.save(statement); return statement;
    });
  }

  async closeStatement(statementId: UUID, key: string): Promise<Persisted<Statement>> {
    return this.idempotent("closeStatement", key, { statementId }, async tx => {
      const statement = await tx.statements.get(statementId); if (!statement) return fail("NOT_FOUND", "Fatura não encontrada");
      if (statement.status !== "open") return fail("CONFLICT", "Somente fatura aberta pode ser fechada");
      const updated = { ...statement, status: "closed" as const }; await tx.statements.save(updated); return updated;
    });
  }

  async closeAutomaticStatements(throughDate: string): Promise<Statement[]> {
    return this.repository.transaction(async tx => {
      const closed: Statement[] = [];
      for (const account of await tx.accounts.list()) {
        if (account.type !== "credit_card" || (await tx.cards.getSettings(account.id))?.billingMode !== "automatic") continue;
        for (const statement of await tx.statements.list(account.id)) if (statement.status === "open" && statement.closingOn <= throughDate) {
          const updated = { ...statement, status: "closed" as const }; await tx.statements.save(updated); closed.push(updated);
        }
      }
      return closed;
    });
  }

  async closeDueAutomaticStatements(nowIso: string): Promise<{ closedCount: number; checkedAt: string }> {
    const instant = new Date(nowIso);
    if (!Number.isFinite(instant.getTime()) || !/^\d{4}-\d\d-\d\dT/.test(nowIso)) fail("VALIDATION_ERROR", "Informe um instante ISO válido");
    return this.repository.transaction(async tx => {
      let closedCount = 0;
      for (const account of await tx.accounts.list()) {
        if (account.type !== "credit_card") continue;
        const settings = await tx.cards.getSettings(account.id);
        if (!settings || settings.billingMode !== "automatic") continue;
        let today: string;
        try {
          const parts = new Intl.DateTimeFormat("en-CA", { timeZone: settings.billingTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
          const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
          today = `${date.year}-${date.month}-${date.day}`;
        } catch { continue; }
        for (const statement of await tx.statements.list(account.id)) {
          if (statement.status !== "open" || statement.closingOn > today) continue;
          await tx.statements.save({ ...statement, status: "closed" }); closedCount++;
        }
      }
      return { closedCount, checkedAt: instant.toISOString() };
    });
  }

  async payStatement(input: PayStatementInput, key: string): Promise<Persisted<{ transaction: Transaction; payment: StatementPayment }>> {
    return this.idempotent("payStatement", key, input, async tx => {
      const { statement, card, bank, amount, due } = await this.prepareStatementPayment(tx, input);
      const transaction = this.transactionFrom(input, "transfer", null, key, "bank_transfer"); await tx.transactions.save(transaction);
      await tx.entries.add({ transactionId: transaction.id, accountId: bank.id, amountMinor: -amount }); await tx.entries.add({ transactionId: transaction.id, accountId: card.id, amountMinor: amount });
      const payment = { id: id(), statementId: statement.id, transferTransactionId: transaction.id, amountMinor: amount }; await tx.payments.save(payment);
      const remaining = due - amount;
      await tx.statements.save({ ...statement, status: remaining === 0n ? "paid" : "partially_paid" });
      return { transaction, payment };
    });
  }

  async accountBalance(id: UUID, through?: string): Promise<Minor> { return this.repository.transaction(async tx => { const account = await this.requireAccount(tx, id); return this.balanceAt(tx, account, through); }); }

  async listInstitutions(): Promise<Institution[]> { return this.repository.transaction(tx => tx.institutions.list()); }

  async listAccounts(through?: string): Promise<Array<Account & { balanceMinor: Minor; availableCreditMinor?: Minor | null }>> {
    return this.repository.transaction(async tx => Promise.all((await tx.accounts.list()).map(async account => {
      const result = { ...account, balanceMinor: await this.balanceAt(tx, account, through) };
      if (account.type !== "credit_card") return result;
      const settings = await tx.cards.getSettings(account.id);
      return { ...result, availableCreditMinor: settings?.creditLimitMinor === null || !settings ? null : settings.creditLimitMinor + result.balanceMinor };
    })));
  }

  async cardSettings(accountId: UUID): Promise<{ accountId: UUID; creditLimitMinor: Minor | null; closingDay: number; dueDay: number; billingTimezone: string; billingMode: "manual" | "automatic" }> {
    return this.repository.transaction(async tx => {
      const account = await this.requireAccount(tx, accountId); if (account.type !== "credit_card") return fail("INVALID_ACCOUNT_TYPE", "Configuração exige conta de cartão");
      const settings = await tx.cards.getSettings(accountId); if (!settings) return fail("NOT_FOUND", "Configuração do cartão não encontrada");
      return settings;
    });
  }

  async listCategories(): Promise<Category[]> { return this.repository.transaction(tx => tx.categories.list()); }

  async transactionHistory(from: string, to: string): Promise<Array<Omit<Transaction, "idempotencyKey"> & {
    entries: Array<Entry & { accountName: string; accountType: Account["type"]; currency: string }>;
    allocations: Array<{ id?: UUID; categoryId: UUID | null; amountMinor: Minor; categoryName: string | null; categoryType: Category["type"] | null }>;
    revisions: Array<Pick<TransactionRevision, "id" | "revisionNumber" | "reason" | "actor" | "source" | "createdAt">>;
    reversalOfTransactionId: UUID | null; reversedByTransactionIds: UUID[]; canReverse: boolean;
  }>> {
    return this.repository.transaction(async tx => {
      const result = [];
      const allTransactions = await tx.transactions.list("0001-01-01", "9999-12-31");
      for (const transaction of allTransactions.filter(item => item.occurredOn >= from && item.occurredOn <= to)) {
        const revisions = await tx.revisions.listByTransaction(transaction.id);
        const effectiveMetadata = revisions.reduce((value, revision) => ({ ...value, ...revision.metadata }), transaction);
        const entries = [];
        for (const entry of await tx.entries.listByTransaction(transaction.id)) {
          const account = await this.requireAccount(tx, entry.accountId);
          entries.push({ ...entry, accountName: account.name, accountType: account.type, currency: account.currency });
        }
        const allocations: Array<{ id?: UUID; categoryId: UUID | null; amountMinor: Minor; categoryName: string | null; categoryType: Category["type"] | null }> = [];
        const allocationRevision = [...revisions].reverse().find(revision => revision.allocations !== null);
        for (const allocation of allocationRevision?.allocations ?? await tx.allocations.listByTransaction(transaction.id)) {
          const category = allocation.categoryId ? await tx.categories.get(allocation.categoryId) : null;
          const allocationId = (allocation as { id?: unknown }).id;
          allocations.push({ ...(typeof allocationId === "string" ? { id: allocationId } : {}), categoryId: allocation.categoryId, amountMinor: allocation.amountMinor, categoryName: category?.name ?? null, categoryType: category?.type ?? null });
        }
        const { idempotencyKey: _idempotencyKey, ...publicTransaction } = effectiveMetadata;
        const reversedByTransactionIds = allTransactions.filter(item => item.kind === "adjustment" && item.relatedTransactionId === transaction.id).map(item => item.id);
        const hasRefund = allTransactions.some(item => item.kind === "refund" && item.relatedTransactionId === transaction.id);
        const hasStatementPayment = transaction.kind === "transfer" && (await tx.payments.findByTransfer(transaction.id)).length > 0;
        const canReverse = transaction.paymentMethod !== "credit" && !entries.some(entry => entry.accountType === "credit_card") && ["income", "expense", "transfer"].includes(transaction.kind) && reversedByTransactionIds.length === 0 && !hasRefund && !hasStatementPayment;
        result.push({ ...publicTransaction, revisions: revisions.map(({ id, revisionNumber, reason, actor, source, createdAt }) => ({ id, revisionNumber, reason, actor, source, createdAt })), reversalOfTransactionId: transaction.kind === "adjustment" ? transaction.relatedTransactionId : null, reversedByTransactionIds, canReverse, entries, allocations });
      }
      return result;
    });
  }

  async statementDetail(statementId: UUID) {
    return this.repository.transaction(async tx => {
      const statement = await tx.statements.get(statementId); if (!statement) return fail("NOT_FOUND", "Fatura não encontrada");
      const card = await this.requireAccount(tx, statement.cardAccountId);
      const [items, payments] = await Promise.all([tx.statements.items(statementId), tx.payments.list(statementId)]);
      const billedMinor = items.reduce((sum, item) => sum + item.amountMinor, 0n);
      const paidMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
      const remainingMinor = billedMinor - paidMinor;
      const settings = await tx.cards.getSettings(card.id);
      const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: settings?.billingTimezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const status = statement.status === "open" ? "open" : remainingMinor <= 0n ? "paid" : localToday > statement.dueOn ? "overdue" : paidMinor > 0n ? "partially_paid" : "closed";
      return { ...statement, status: status as Statement["status"], cardAccountName: card.name, currency: card.currency, items, payments, billedMinor, paidMinor, remainingMinor, creditBalanceMinor: remainingMinor < 0n ? -remainingMinor : 0n };
    });
  }

  async availableCredit(cardAccountId: UUID): Promise<Minor | null> {
    return this.repository.transaction(async tx => {
      const card = await this.requireAccount(tx, cardAccountId); if (card.type !== "credit_card") fail("INVALID_ACCOUNT_TYPE", "Limite disponível exige cartão");
      const settings = await tx.cards.getSettings(card.id); if (!settings) return fail("NOT_FOUND", "Configuração do cartão não encontrada");
      return settings.creditLimitMinor === null ? null : settings.creditLimitMinor + await this.balanceAt(tx, card);
    });
  }

  async balancesByCurrency(through?: string): Promise<Record<string, string>> {
    return this.repository.transaction(async tx => {
      const totals = new Map<string, Minor>();
      for (const account of await tx.accounts.list()) if (!through || through >= account.openingDate) totals.set(account.currency, (totals.get(account.currency) ?? 0n) + await this.balanceAt(tx, account, through));
      return Object.fromEntries([...totals].map(([currency, amount]) => [currency, amount.toString()]));
    });
  }

  async statementForecast(from: string, to: string, includePending = false): Promise<Record<string, Array<{ statementId: UUID; dueOn: string; billedMinor: string; paidMinor: string; remainingMinor: string }>>> {
    return this.repository.transaction(async tx => {
      const forecast: Record<string, Array<{ statementId: UUID; dueOn: string; billedMinor: string; paidMinor: string; remainingMinor: string }>> = {};
      for (const account of await tx.accounts.list()) {
        if (account.type !== "credit_card") continue;
        for (const statement of await tx.statements.list(account.id)) {
          const [items, payments] = await Promise.all([tx.statements.items(statement.id), tx.payments.list(statement.id)]);
          const billed = items.reduce((sum, item) => sum + item.amountMinor, 0n);
          const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
          if ((statement.dueOn < from || statement.dueOn > to) && !(includePending && billed > paid)) continue;
          (forecast[account.currency] ??= []).push({ statementId: statement.id, dueOn: statement.dueOn, billedMinor: billed.toString(), paidMinor: paid.toString(), remainingMinor: (billed - paid).toString() });
        }
      }
      for (const statements of Object.values(forecast)) statements.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
      return forecast;
    });
  }

  async monthlyReport(from: string, to: string): Promise<Record<string, { incomeMinor: string; expenseMinor: string; netMinor: string }>> {
    return this.repository.transaction(async tx => this.reportTotals(this.economicProjection(await tx.reporting.load()), from, to));
  }

  async categoryReport(from: string, to: string): Promise<CategoryReport[]> {
    return this.repository.transaction(async tx => {
      const data = await tx.reporting.load();
      const categories = new Map(data.categories.map(category => [category.id, category.name]));
      const grouped = new Map<string, { currency: "BRL"; categoryId: UUID | null; categoryName: string | null; income: bigint; expense: bigint }>();
      for (const row of this.economicProjection(data)) {
        if (row.date < from || row.date > to) continue;
        const key = `${row.currency}:${row.categoryId ?? "uncategorized"}`;
        const group = grouped.get(key) ?? { currency: row.currency, categoryId: row.categoryId, categoryName: row.categoryId ? categories.get(row.categoryId) ?? null : null, income: 0n, expense: 0n };
        group.income += row.income; group.expense += row.expense; grouped.set(key, group);
      }
      return [...grouped.values()].map(({ income, expense, ...row }) => ({ ...row, incomeMinor: income.toString(), expenseMinor: expense.toString(), netMinor: (income - expense).toString() }));
    });
  }

  async listReversalsFor(transactionId: UUID): Promise<UUID[]> {
    return this.repository.transaction(async tx => (await tx.transactions.list("0001-01-01", "9999-12-31")).filter(item => item.kind === "adjustment" && item.relatedTransactionId === transactionId).map(item => item.id));
  }

  async monthlySummary(from: string, to: string) {
    return this.repository.transaction(async tx => {
      const data = await tx.reporting.load();
      return this.summaryFromData(data, this.economicProjection(data), from, to);
    });
  }

  async monthlySeries(from: string, to: string) {
    return this.repository.transaction(async tx => {
      const data = await tx.reporting.load(), projection = this.economicProjection(data);
      const result = [];
      let month = `${from.slice(0, 7)}-01`;
      while (month <= to) {
        const next = new Date(`${month}T00:00:00Z`);
        next.setUTCMonth(next.getUTCMonth() + 1);
        const last = new Date(next); last.setUTCDate(0);
        const end = last.toISOString().slice(0, 10);
        result.push(this.summaryFromData(data, projection, month < from ? from : month, end > to ? to : end));
        if (end >= to) break;
        month = next.toISOString().slice(0, 10);
      }
      return result;
    });
  }

  private economicProjection(data: ReportingData) {
    const reversed = new Set(data.transactions.filter(row => row.kind === "adjustment").map(row => row.relatedTransactionId));
    const accounts = new Map(data.accounts.map(row => [row.id, row]));
    const entries = new Map<string, Entry[]>(), allocations = new Map<string, Array<{ categoryId: UUID | null; amountMinor: bigint }>>();
    for (const entry of data.entries) { const rows = entries.get(entry.transactionId) ?? []; rows.push(entry); entries.set(entry.transactionId, rows); }
    for (const allocation of data.allocations) { const rows = allocations.get(allocation.transactionId) ?? []; rows.push(allocation); allocations.set(allocation.transactionId, rows); }
    for (const revision of [...data.revisions].sort((a, b) => a.revisionNumber - b.revisionNumber)) if (revision.allocations !== null) allocations.set(revision.transactionId, revision.allocations);
    const result: Array<{ date: string; currency: "BRL"; categoryId: UUID | null; income: bigint; expense: bigint }> = [];
    for (const transaction of data.transactions) {
      if (!["income", "expense", "refund"].includes(transaction.kind) || reversed.has(transaction.id)) continue;
      const currencies = new Set((entries.get(transaction.id) ?? []).map(entry => accounts.get(entry.accountId)?.currency).filter((value): value is string => Boolean(value)));
      if (currencies.size > 1) fail("CURRENCY_MISMATCH", "Operação possui moedas incompatíveis");
      const currency = [...currencies][0]; if (!currency) continue;
      if (currency !== "BRL") fail("CURRENCY_MISMATCH", "Somente BRL é suportado");
      for (const allocation of allocations.get(transaction.id) ?? []) result.push({ date: transaction.occurredOn, currency: "BRL", categoryId: allocation.categoryId, income: transaction.kind === "income" ? allocation.amountMinor : 0n, expense: transaction.kind === "income" ? 0n : -allocation.amountMinor });
    }
    return result;
  }

  private reportTotals(projection: ReturnType<FinanceService["economicProjection"]>, from: string, to: string) {
    const grouped = new Map<string, { income: bigint; expense: bigint }>();
    for (const row of projection) if (row.date >= from && row.date <= to) {
      const group = grouped.get(row.currency) ?? { income: 0n, expense: 0n };
      group.income += row.income; group.expense += row.expense; grouped.set(row.currency, group);
    }
    return Object.fromEntries([...grouped].map(([currency, row]) => [currency, { incomeMinor: row.income.toString(), expenseMinor: row.expense.toString(), netMinor: (row.income - row.expense).toString() }]));
  }

  private summaryFromData(data: ReportingData, projection: ReturnType<FinanceService["economicProjection"]>, from: string, to: string) {
    const totals = this.reportTotals(projection, from, to);
    const balances = new Map<string, bigint>();
    const accounts = new Map(data.accounts.map(account => [account.id, account]));
    const dates = new Map(data.transactions.map(transaction => [transaction.id, transaction.occurredOn]));
    for (const account of data.accounts) if (account.openingDate <= to) balances.set(account.currency, (balances.get(account.currency) ?? 0n) + account.openingBalanceMinor);
    for (const entry of data.entries) {
      const account = accounts.get(entry.accountId), date = dates.get(entry.transactionId);
      if (account && date && date >= account.openingDate && date <= to) balances.set(account.currency, (balances.get(account.currency) ?? 0n) + entry.amountMinor);
    }
    return { from, to, balancesByCurrency: Object.fromEntries([...balances].map(([currency, amount]) => [currency, amount.toString()])), incomeMinorByCurrency: Object.fromEntries(Object.entries(totals).map(([currency, row]) => [currency, row.incomeMinor])), expenseMinorByCurrency: Object.fromEntries(Object.entries(totals).map(([currency, row]) => [currency, row.expenseMinor])) };
  }

  async previewTransaction(input: PreviewTransactionInput): Promise<PreviewTransactionOutput> {
    return this.repository.transaction(async tx => {
      const amount = (value: string) => asMinor(value);
      this.validateInputDates(input);
      switch (input.operation) {
        case "income": {
          const { account, allocations } = await this.prepareIncome(tx, input);
          return { operation: input.operation, kind: "income", entries: [{ accountId: account.id, amountMinor: input.amountMinor }], allocations: allocations.map(item => ({ categoryId: item.categoryId, amountMinor: item.amountMinor.toString() })) };
        }
        case "expense": {
          const { account, allocations } = await this.prepareExpense(tx, input);
          return { operation: input.operation, kind: "expense", entries: [{ accountId: account.id, amountMinor: (-amount(input.amountMinor)).toString() }], allocations: allocations.map(item => ({ categoryId: item.categoryId, amountMinor: item.amountMinor.toString() })) };
        }
        case "transfer": {
          const { from, to } = await this.prepareTransfer(tx, input);
          return { operation: input.operation, kind: "transfer", entries: [{ accountId: from.id, amountMinor: (-amount(input.amountMinor)).toString() }, { accountId: to.id, amountMinor: input.amountMinor }], allocations: [] };
        }
        case "credit_purchase": {
          const { card, total, allocations, installments } = await this.prepareCreditPurchase(tx, input);
          return { operation: input.operation, kind: "expense", entries: [{ accountId: card.id, amountMinor: (-total).toString() }], allocations: allocations.map(item => ({ categoryId: item.categoryId, amountMinor: item.amountMinor.toString() })), installments };
        }
        case "cashback": {
          const { account } = await this.prepareCashback(tx, input);
          return { operation: input.operation, kind: "income", entries: [{ accountId: account.id, amountMinor: input.amountMinor }], allocations: [{ categoryId: input.categoryId, amountMinor: input.amountMinor }], ...(input.cardStatementId ? { statementId: input.cardStatementId } : {}) };
        }
        case "refund": {
          const { account, allocations, target } = await this.prepareRefund(tx, input);
          const statementId = target?.statement?.id;
          const statementPlan = target?.plan ?? undefined;
          return { operation: input.operation, kind: "refund", entries: [{ accountId: account.id, amountMinor: input.amountMinor }], allocations: allocations.map(item => ({ categoryId: item.categoryId, amountMinor: item.amountMinor.toString() })), ...(statementId ? { statementId } : {}), ...(statementPlan ? { statementPlan } : {}) };
        }
        case "statement_adjustment": {
          const { statement, card, category, amount, planned } = await this.prepareStatementAdjustment(tx, input);
          return { operation: input.operation, kind: "expense", entries: [{ accountId: card.id, amountMinor: (-amount).toString() }], allocations: [{ categoryId: category.id, amountMinor: (-amount).toString() }], ...(statement ? { statementId: statement.id } : { statementPlan: { ...planned!.dates, dueOn: planned!.installments[0]!.dueOn } }) };
        }
        case "statement_payment": {
          const { statement, card, bank, amount: payment, due: remaining } = await this.prepareStatementPayment(tx, input);
          return { operation: input.operation, kind: "transfer", entries: [{ accountId: bank.id, amountMinor: (-payment).toString() }, { accountId: card.id, amountMinor: payment.toString() }], allocations: [], statementId: statement.id, remainingStatementMinor: (remaining - payment).toString() };
        }
      }
    }) as Promise<PreviewTransactionOutput>;
  }

  private async persistIncome(tx: TransactionContext, input: CreateIncomeInput, key: string): Promise<Transaction> {
    const { account, allocations } = await this.prepareIncome(tx, input);
    const transaction = this.transactionFrom(input, "income", null, key, input.paymentMethod ?? null);
    await tx.transactions.save(transaction); await tx.entries.add({ transactionId: transaction.id, accountId: account.id, amountMinor: asMinor(input.amountMinor) });
    await tx.allocations.addMany(allocations.map(a => ({ transactionId: transaction.id, categoryId: a.categoryId, amountMinor: a.amountMinor })));
    return transaction;
  }

  private async persistExpense(tx: TransactionContext, input: CreateExpenseInput, key: string): Promise<Transaction> {
    const { account, allocations } = await this.prepareExpense(tx, input);
    const transaction = this.transactionFrom(input, "expense", null, key, input.paymentMethod);
    await tx.transactions.save(transaction); await tx.entries.add({ transactionId: transaction.id, accountId: account.id, amountMinor: -asMinor(input.amountMinor) });
    await tx.allocations.addMany(allocations.map(a => ({ transactionId: transaction.id, categoryId: a.categoryId, amountMinor: a.amountMinor })));
    return transaction;
  }

  private async persistTransfer(tx: TransactionContext, input: CreateTransferInput, key: string): Promise<Transaction> {
    const { from, to } = await this.prepareTransfer(tx, input);
    const transaction = this.transactionFrom(input, "transfer", null, key, "bank_transfer"), amount = asMinor(input.amountMinor);
    await tx.transactions.save(transaction); await tx.entries.add({ transactionId: transaction.id, accountId: from.id, amountMinor: -amount }); await tx.entries.add({ transactionId: transaction.id, accountId: to.id, amountMinor: amount });
    return transaction;
  }

  private async prepareStatementPayment(tx: TransactionContext, input: PayStatementInput) {
    this.validateInputDates(input);
    const statement = await tx.statements.get(input.statementId); if (!statement) return fail("NOT_FOUND", "Fatura não encontrada");
    if (statement.status === "open") return fail("CONFLICT", "Feche a fatura antes de registrar pagamento");
    const card = await this.requireAccount(tx, statement.cardAccountId), bank = await this.requireAccount(tx, input.fromAccountId);
    if (bank.type === "credit_card" || bank.id === card.id) fail("INVALID_ACCOUNT_TYPE", "Pagamento deve sair de uma conta de caixa/banco");
    if (bank.currency !== card.currency) fail("CURRENCY_MISMATCH", "Pagamento deve usar a moeda da fatura");
    this.assertAfterOpening(bank, input.occurredOn); this.assertAfterOpening(card, input.occurredOn);
    const [items, payments] = await Promise.all([tx.statements.items(statement.id), tx.payments.list(statement.id)]);
    const amount = asMinor(input.amountMinor), due = items.reduce((sum, item) => sum + item.amountMinor, 0n) - payments.reduce((sum, payment) => sum + payment.amountMinor, 0n);
    if (amount > due) fail("INSUFFICIENT_STATEMENT_BALANCE", "Pagamento supera o saldo da fatura", { dueMinor: due.toString() });
    return { statement, card, bank, amount, due };
  }

  private async prepareIncome(tx: TransactionContext, input: CreateIncomeInput) {
    this.validateInputDates(input);
    const account = await this.requireAccount(tx, input.accountId); this.ensureAllowedAccount(account, false); this.assertAfterOpening(account, input.occurredOn);
    const allocations = [{ categoryId: input.categoryId, amountMinor: asMinor(input.amountMinor) }]; await this.validateAllocations(tx, allocations, "income");
    return { account, allocations };
  }

  private async prepareExpense(tx: TransactionContext, input: CreateExpenseInput) {
    this.validateInputDates(input);
    const account = await this.requireAccount(tx, input.accountId); this.ensureAllowedAccount(account, false); this.assertAfterOpening(account, input.occurredOn);
    const allocations = input.allocations.map(a => ({ categoryId: a.categoryId, amountMinor: -asMinor(a.amountMinor) }));
    this.assertAllocationSum(allocations, -asMinor(input.amountMinor)); await this.validateAllocations(tx, allocations, "expense");
    return { account, allocations };
  }

  private async prepareTransfer(tx: TransactionContext, input: CreateTransferInput) {
    this.validateInputDates(input);
    const from = await this.requireAccount(tx, input.fromAccountId), to = await this.requireAccount(tx, input.toAccountId);
    if (from.id === to.id || from.currency !== to.currency) fail("CURRENCY_MISMATCH", "Transferência exige contas distintas na mesma moeda");
    this.assertAfterOpening(from, input.occurredOn); this.assertAfterOpening(to, input.occurredOn);
    return { from, to };
  }

  private async prepareStatementAdjustment(tx: TransactionContext, input: CreateStatementAdjustmentInput) {
    this.validateInputDates(input);
    const amount = asMinor(input.amountMinor);
    if (amount <= 0n || amount > 9223372036854775807n || input.confirmsUnrecordedDebt !== true) return fail("VALIDATION_ERROR", "Confirme uma cobrança positiva ainda não registrada na dívida do cartão");
    const statement = input.statementId ? await tx.statements.get(input.statementId) : null;
    if (input.statementId && !statement) return fail("NOT_FOUND", "Fatura não encontrada");
    if (statement && statement.status !== "open") return fail("CONFLICT", "Ajuste exige uma fatura aberta");
    const card = await this.requireAccount(tx, input.cardAccountId);
    if (statement && statement.cardAccountId !== card.id) return fail("VALIDATION_ERROR", "Fatura não pertence ao cartão selecionado");
    if (card.type !== "credit_card") return fail("INVALID_ACCOUNT_TYPE", "Ajuste exige conta de cartão");
    this.assertAfterOpening(card, input.occurredOn);
    const categories = (await tx.categories.list()).filter(category => category.type === "expense" && category.parentId === null && category.name.trim().toLocaleLowerCase("pt-BR") === "ajuste de fatura");
    if (categories.length !== 1 || categories[0]!.isArchived) return fail("CONFLICT", "A categoria Ajuste de fatura deve estar ativa e ser única. Verifique as migrations e o catálogo");
    const planned = statement ? null : await this.prepareCreditPurchase(tx, { ...input, totalAmountMinor: input.amountMinor, installmentCount: 1, allocations: [{ categoryId: categories[0]!.id, amountMinor: input.amountMinor }] });
    return { statement, card, category: categories[0]!, amount, planned };
  }

  private async prepareCashback(tx: TransactionContext, input: CreateCashbackInput) {
    this.validateInputDates(input);
    const account = await this.requireAccount(tx, input.accountId); this.assertAfterOpening(account, input.occurredOn);
    if (account.type === "credit_card" && !input.cardStatementId) return fail("VALIDATION_ERROR", "Cashback no cartão exige fatura de crédito");
    if (input.cardStatementId && account.type !== "credit_card") return fail("INVALID_ACCOUNT_TYPE", "Crédito de fatura exige cartão");
    const allocations = [{ categoryId: input.categoryId, amountMinor: asMinor(input.amountMinor) }]; await this.validateAllocations(tx, allocations, "income");
    let statement: Statement | null = null;
    if (input.cardStatementId) {
      statement = await tx.statements.get(input.cardStatementId);
      if (!statement || statement.cardAccountId !== account.id) return fail("NOT_FOUND", "Fatura não pertence ao cartão");
      if (statement.status !== "open") return fail("CONFLICT", "Cashback precisa ser vinculado a uma fatura aberta");
    }
    return { account, statement };
  }

  private async prepareCreditPurchase(tx: TransactionContext, input: CreateCreditPurchaseInput) {
    this.validateInputDates(input);
    const card = await this.requireAccount(tx, input.cardAccountId); if (card.type !== "credit_card") return fail("INVALID_ACCOUNT_TYPE", "A compra exige conta de cartão");
    this.assertAfterOpening(card, input.occurredOn);
    const settings = await tx.cards.getSettings(card.id); if (!settings) return fail("NOT_FOUND", "Configuração do cartão não encontrada");
    const total = asMinor(input.totalAmountMinor), allocations = input.allocations.map(item => ({ categoryId: item.categoryId, amountMinor: -asMinor(item.amountMinor) }));
    this.assertAllocationSum(allocations, -total); await this.validateAllocations(tx, allocations, "expense");
    const dates = this.purchaseStatements(input.occurredOn, input.postedOn ?? input.occurredOn, settings.closingDay);
    const installments = await Promise.all(splitInstallments(total, input.installmentCount).map(async (value, index) => {
      const closingOn = addMonths(dates.closingOn, index, settings.closingDay);
      const existing = await tx.statements.findByClosingDate(card.id, closingOn);
      return { number: index + 1, amountMinor: value.toString(), closingOn, dueOn: existing?.dueOn ?? dueDate(closingOn, settings.closingDay, settings.dueDay) };
    }));
    for (const installment of installments) {
      const existing = await tx.statements.findByClosingDate(card.id, installment.closingOn);
      if (existing && existing.status !== "open") return fail("CONFLICT", "Não é possível alterar uma fatura fechada");
      if (existing) continue;
      const cycleStart = addMonths(installment.closingOn, -1, settings.closingDay);
      await this.assertNoStatementOverlap(tx, card.id, cycleStart, installment.closingOn);
    }
    return { card, settings, total, allocations, dates, installments };
  }

  private async prepareRefund(tx: TransactionContext, input: CreateRefundInput) {
    this.validateInputDates(input);
    const original = await tx.transactions.get(input.originalTransactionId); if (!original || original.kind !== "expense") return fail("INVALID_REFUND", "Estorno exige despesa original");
    if ((await tx.transactions.list("0001-01-01", "9999-12-31")).some(item => item.kind === "adjustment" && item.relatedTransactionId === original.id)) return fail("INVALID_REFUND", "Despesa revertida não pode receber novo estorno");
    const originalEntries = await tx.entries.listByAccount(input.accountId); const originalEntry = originalEntries.find(e => e.transactionId === original.id);
    if (!originalEntry || originalEntry.amountMinor >= 0n) return fail("INVALID_REFUND", "Conta não corresponde à despesa original");
    const account = await this.requireAccount(tx, input.accountId); this.assertAfterOpening(account, input.occurredOn);
    const priorRefunds = new Set((await tx.transactions.list("0001-01-01", "9999-12-31")).filter(t => t.kind === "refund" && t.relatedTransactionId === original.id).map(row => row.id));
    const refunded = originalEntries.filter(entry => priorRefunds.has(entry.transactionId)).reduce((sum, entry) => sum + entry.amountMinor, 0n);
    const amount = asMinor(input.amountMinor); if (amount + refunded > -originalEntry.amountMinor) fail("INVALID_REFUND", "Estorno excede o valor restante da compra");
    const originalAllocations = await tx.allocations.listByTransaction(original.id);
    const refundAllocations = await this.refundAllocations(tx, original.id, originalAllocations, amount);
    const target = account.type === "credit_card" ? await this.refundStatementTarget(tx, account, input.occurredOn, input.postedOn ?? input.occurredOn) : null;
    return { original, account, amount, allocations: refundAllocations, target };
  }

  private async balanceAt(tx: TransactionContext, account: Account, through?: string): Promise<Minor> {
    if (through && through < account.openingDate) return 0n;
    return account.openingBalanceMinor + await tx.accounts.balance(account.id, through);
  }

  private async requireAccount(tx: TransactionContext, accountId: UUID): Promise<Account> { const account = await tx.accounts.get(accountId); if (!account || account.isArchived) return fail("NOT_FOUND", "Conta não encontrada ou arquivada"); return account; }
  private assertAfterOpening(account: Account, date: string) { if (date < account.openingDate) fail("VALIDATION_ERROR", "Operação anterior à data de abertura da conta", { openingDate: account.openingDate }); }
  private ensureAllowedAccount(account: Account, allowCard: boolean) { if (!allowCard && account.type === "credit_card") fail("INVALID_ACCOUNT_TYPE", "Use o fluxo de compra/crédito para este cartão"); }
  private async validateAllocations(tx: TransactionContext, values: Array<{ categoryId: UUID | null; amountMinor: Minor }>, type: "income" | "expense") {
    for (const allocation of values) if (allocation.categoryId) { const category = await tx.categories.get(allocation.categoryId); if (!category || category.isArchived) return fail("INVALID_CATEGORY", "Categoria não encontrada ou arquivada"); if (category.type !== type) return fail("INVALID_CATEGORY", "Tipo da categoria incompatível"); }
  }
  private assertAllocationSum(allocations: Array<{ amountMinor: Minor }>, total: Minor) { if (allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0n) !== total) fail("VALIDATION_ERROR", "Alocações devem somar o total da operação"); }
  private validateInputDates(input: { occurredOn: string; postedOn?: string | null }) { if (input.postedOn && input.postedOn < input.occurredOn) fail("VALIDATION_ERROR", "Data de postagem anterior à data econômica"); }
  private transactionFrom(input: { occurredOn: string; postedOn?: string | null; description: string; counterpartyName?: string | null; notes?: string | null; source?: string; reviewStatus?: string }, kind: string, relatedTransactionId: UUID | null, idempotencyKey: string, paymentMethod: string | null): Transaction {
    this.validateInputDates(input);
    return { id: id(), kind, occurredOn: input.occurredOn, postedOn: input.postedOn ?? null, description: input.description, counterpartyName: input.counterpartyName ?? null, notes: input.notes ?? null, reviewStatus: input.reviewStatus === "needs_review" ? "needs_review" : "confirmed", paymentMethod, relatedTransactionId, idempotencyKey, source: input.source ?? "manual" };
  }
  private purchaseStatements(occurredOn: string, postedOn: string, closingDay: number) {
    const [year, month, day] = (postedOn || occurredOn).split("-").map(Number);
    let closingOn = addMonths(`${year}-${String(month).padStart(2, "0")}-01`, 0, closingDay);
    if (day >= Math.min(closingDay, new Date(Date.UTC(year, month, 0)).getUTCDate())) closingOn = addMonths(closingOn, 1, closingDay);
    const cycleStartOn = addMonths(closingOn, -1, closingDay);
    return { closingOn, cycleStartOn };
  }
  private async ensureStatement(tx: TransactionContext, cardAccountId: UUID, closingOn: string, cycleStartOn: string, closingDay: number, dueDay: number, offset: number): Promise<Statement> {
    const close = addMonths(closingOn, offset, closingDay), existing = await tx.statements.findByClosingDate(cardAccountId, close);
    if (existing) { if (existing.status !== "open") return fail("CONFLICT", "Não é possível alterar uma fatura fechada"); return existing; }
    const start = addMonths(cycleStartOn, offset, closingDay);
    await this.assertNoStatementOverlap(tx, cardAccountId, start, close);
    const statement: Statement = { id: id(), cardAccountId, cycleStartOn: start, closingOn: close, dueOn: dueDate(close, closingDay, dueDay), status: "open" };
    await tx.statements.save(statement); return statement;
  }

  private async refundStatementTarget(tx: TransactionContext, account: Account, occurredOn: string, postedOn: string): Promise<RefundStatementTarget> {
    const settings = await tx.cards.getSettings(account.id);
    if (!settings) return fail("NOT_FOUND", "Configuração do cartão não encontrada");
    const statementDate = postedOn || occurredOn;
    const openStatement = (await tx.statements.list(account.id))
      .filter(statement => statement.status === "open" && statement.closingOn > statementDate)
      .sort((a, b) => a.closingOn.localeCompare(b.closingOn))[0];
    if (openStatement) return { statement: openStatement, plan: null };
    const cycle = this.purchaseStatements(statementDate, statementDate, settings.closingDay);
    const existing = await tx.statements.findByClosingDate(account.id, cycle.closingOn);
    if (existing) {
      if (existing.status !== "open") return fail("CONFLICT", "Não é possível creditar fatura fechada");
      return { statement: existing, plan: null };
    }
    await this.assertNoStatementOverlap(tx, account.id, cycle.cycleStartOn, cycle.closingOn);
    return { statement: null, plan: { ...cycle, dueOn: dueDate(cycle.closingOn, settings.closingDay, settings.dueDay) } };
  }

  private async assertNoStatementOverlap(tx: TransactionContext, cardAccountId: UUID, cycleStartOn: string, closingOn: string) {
    for (const statement of await tx.statements.list(cardAccountId)) {
      if (cycleStartOn < statement.closingOn && closingOn > statement.cycleStartOn) fail("CONFLICT", "Ciclo da fatura se sobrepõe a um ciclo existente", { statementId: statement.id });
    }
  }

  private async refundAllocations(tx: TransactionContext, originalId: UUID, original: Array<{ categoryId: UUID | null; amountMinor: Minor }>, amount: bigint) {
    const revisions = await tx.revisions.listByTransaction(originalId);
    original = [...revisions].reverse().find(revision => revision.allocations !== null)?.allocations ?? original;
    if (!original.length) return [{ categoryId: null, amountMinor: amount }];
    const prior = (await tx.transactions.list("0001-01-01", "9999-12-31")).filter(t => t.kind === "refund" && t.relatedTransactionId === originalId);
    const originalByCategory = new Map<UUID | null, bigint>();
    for (const allocation of original) originalByCategory.set(allocation.categoryId, (originalByCategory.get(allocation.categoryId) ?? 0n) - allocation.amountMinor);
    const refundedByCategory = new Map<UUID | null, bigint>();
    for (const transaction of prior) for (const allocation of await tx.allocations.listByTransaction(transaction.id)) refundedByCategory.set(allocation.categoryId, (refundedByCategory.get(allocation.categoryId) ?? 0n) + allocation.amountMinor);
    const capacities = [...originalByCategory].map(([categoryId, originalMinor]) => ({ categoryId, remaining: originalMinor - (refundedByCategory.get(categoryId) ?? 0n) })).filter(item => item.remaining > 0n);
    const total = capacities.reduce((sum, item) => sum + item.remaining, 0n);
    if (amount > total) return fail("INVALID_REFUND", "Estorno excede o valor restante das categorias");
    const result = capacities.map(item => ({ categoryId: item.categoryId, amountMinor: amount * item.remaining / total }));
    let remainder = amount - result.reduce((sum, item) => sum + item.amountMinor, 0n);
    for (let i = 0; remainder > 0n; i = (i + 1) % result.length) {
      const item = result[i]!, capacity = capacities[i]!.remaining;
      if (item.amountMinor < capacity) { item.amountMinor++; remainder--; }
    }
    return result.filter(item => item.amountMinor > 0n);
  }
}

export function groupByCurrency<T extends { currency: string }>(rows: T[]): Map<string, T[]> { return splitByCurrency(rows); }

import { createHash } from "node:crypto";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { DomainError, type ExpenseForecast, type FinanceRepository, type TransactionContext, type TransactionRevision } from "@finance/domain";
import type { Database } from "./client.js";
import {
  accounts,
  accountEntries,
  cardStatementItems,
  cardStatements,
  categories,
  categoryAllocations,
  creditCardSettings,
  expenseForecasts,
  idempotencyClaims,
  installmentPlans,
  institutions,
  statementPayments,
  transactions,
  transactionRevisions,
} from "./schema/index.js";

const encode = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  typeof item === "bigint" ? { $bigint: item.toString() } : item,
);
const stable = (value: unknown): unknown => {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
};
const payloadHash = (payload: unknown): string => createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
const mapForecast = (row: typeof expenseForecasts.$inferSelect): ExpenseForecast => ({
  ...row,
  amountMinor: row.amountMinor.toString(),
  createdAt: row.createdAt.toISOString(),
});
const decode = <T>(value: unknown): T => JSON.parse(JSON.stringify(value), (_key, item: unknown) => {
  if (item && typeof item === "object" && "$bigint" in item && typeof item.$bigint === "string") return BigInt(item.$bigint);
  return item;
}) as T;
const isRetryable = (error: unknown): boolean => {
  let current = error;
  while (current && typeof current === "object") {
    const value = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (value.code === "40001" || value.code === "40P01") return true;
    if (value.code === "23505" && (value.constraint === "card_statements_card_closing_unique" || value.constraint === "transaction_revisions_transaction_number_unique")) return true;
    current = value.cause;
  }
  return false;
};

export function createFinanceRepository(db: Database, maxRetries = 3): FinanceRepository {
  return {
    async transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await db.transaction(async (executor) => work(createContext(executor)), { isolationLevel: "serializable" });
        } catch (error) {
          if (!isRetryable(error) || attempt >= maxRetries) throw error;
        }
      }
    },
  };
}

function createContext(db: Database): TransactionContext {
  let activePayloadHash: string | undefined;
  return {
    institutions: {
      async get(id) {
        const [row] = await db.select({ id: institutions.id, name: institutions.name, isArchived: institutions.isArchived }).from(institutions).where(eq(institutions.id, id)).limit(1);
        return row ?? null;
      },
      async save(value) {
        await db.insert(institutions).values(value).onConflictDoUpdate({ target: institutions.id, set: { name: value.name, isArchived: value.isArchived, updatedAt: new Date() } });
      },
      async list() { return db.select({ id: institutions.id, name: institutions.name, isArchived: institutions.isArchived }).from(institutions); },
    },
    accounts: {
      async get(id) {
        const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
        return row ?? null;
      },
      async save(value) {
        // Account names are supplied by the domain contract; preserve them on updates.
        const [existing] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, value.id)).limit(1);
        const name = "name" in value && typeof value.name === "string" ? value.name : existing?.name;
        if (!name) throw new Error("FinanceRepository requires Account.name to create an account");
        await db.insert(accounts).values({ ...value, name }).onConflictDoUpdate({ target: accounts.id, set: { ...value, name, updatedAt: new Date() } });
      },
      async balance(id, through) {
        const conditions = [eq(accountEntries.accountId, id)];
        if (through) conditions.push(lte(transactions.occurredOn, through));
        const [row] = await db.select({ total: sql<bigint>`coalesce(sum(${accountEntries.amountMinor}), 0)`.mapWith((value) => BigInt(value)) })
          .from(accountEntries).innerJoin(transactions, eq(transactions.id, accountEntries.transactionId)).where(and(...conditions));
        return row?.total ?? 0n;
      },
      async list() { return db.select().from(accounts); },
    },
    categories: {
      async get(id) {
        const [row] = await db.select({ id: categories.id, name: categories.name, type: categories.type, parentId: categories.parentId, isArchived: categories.isArchived }).from(categories).where(eq(categories.id, id)).limit(1);
        return row as Awaited<ReturnType<TransactionContext["categories"]["get"]>>;
      },
      async save(value) {
        await db.insert(categories).values(value).onConflictDoUpdate({ target: categories.id, set: { name: value.name, type: value.type, parentId: value.parentId, isArchived: value.isArchived, updatedAt: new Date() } });
      },
      async list() { return db.select().from(categories); },
    },
    transactions: {
      async save(value) {
        await db.insert(transactions).values({ ...value, idempotencyPayloadHash: value.idempotencyKey ? activePayloadHash : null });
      },
      async findByIdempotency(key) {
        const [row] = await db.select().from(transactions).where(eq(transactions.idempotencyKey, key)).limit(1);
        if (!row) return null;
        const [claim] = await db.select({ payloadHash: idempotencyClaims.payloadHash }).from(idempotencyClaims).where(eq(idempotencyClaims.idempotencyKey, key)).limit(1);
        return { transaction: row, payload: { payloadHash: claim?.payloadHash ?? row.idempotencyPayloadHash } };
      },
      async get(id) {
        const [row] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
        return row ?? null;
      },
      async list(from, to) { return db.select().from(transactions).where(and(gte(transactions.occurredOn, from), lte(transactions.occurredOn, to))); },
    },
    entries: {
      async add(value) {
        const [row] = await db.insert(accountEntries).values(value).returning();
        return row!;
      },
      async listByAccount(id, through) {
        const conditions = [eq(accountEntries.accountId, id)];
        if (through) conditions.push(lte(transactions.occurredOn, through));
        return db.select({ id: accountEntries.id, transactionId: accountEntries.transactionId, accountId: accountEntries.accountId, amountMinor: accountEntries.amountMinor })
          .from(accountEntries).innerJoin(transactions, eq(transactions.id, accountEntries.transactionId)).where(and(...conditions));
      },
      async listByTransaction(id) { return db.select().from(accountEntries).where(eq(accountEntries.transactionId, id)); },
    },
    allocations: {
      async addMany(values) { return values.length ? db.insert(categoryAllocations).values(values).returning() : []; },
      async listByTransaction(id) { return db.select().from(categoryAllocations).where(eq(categoryAllocations.transactionId, id)); },
    },
    forecasts: {
      async save(value) {
        await db.insert(expenseForecasts).values({ ...value, amountMinor: BigInt(value.amountMinor), createdAt: new Date(value.createdAt) })
          .onConflictDoUpdate({ target: expenseForecasts.id, set: { status: value.status, realizedTransactionId: value.realizedTransactionId } });
      },
      async get(id, lock = false) {
        const [row] = lock
          ? await db.select().from(expenseForecasts).where(eq(expenseForecasts.id, id)).limit(1).for("update")
          : await db.select().from(expenseForecasts).where(eq(expenseForecasts.id, id)).limit(1);
        return row ? mapForecast(row) : null;
      },
      async list(from, to, currency) {
        const rows = await db.select().from(expenseForecasts)
          .where(and(gte(expenseForecasts.expectedOn, from), lte(expenseForecasts.expectedOn, to), ...(currency ? [eq(expenseForecasts.currency, currency)] : [])))
          .orderBy(asc(expenseForecasts.expectedOn));
        return rows.map(mapForecast);
      },
    },
    revisions: {
      async add(value) {
        await db.insert(transactionRevisions).values({ ...value, allocations: value.allocations?.map(item => ({ ...item, amountMinor: item.amountMinor.toString() })) ?? null, createdAt: new Date(value.createdAt) });
      },
      async listByTransaction(id) {
        const rows = await db.select().from(transactionRevisions).where(eq(transactionRevisions.transactionId, id)).orderBy(asc(transactionRevisions.revisionNumber));
        return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), metadata: row.metadata as TransactionRevision["metadata"], allocations: row.allocations?.map(item => ({ ...item, amountMinor: BigInt(item.amountMinor) })) ?? null }));
      },
    },
    cards: {
      async getSettings(accountId) {
        const [row] = await db.select().from(creditCardSettings).where(eq(creditCardSettings.accountId, accountId)).limit(1);
        if (!row) return null;
        const { closingMode, ...settings } = row;
        return { ...settings, billingMode: closingMode };
      },
      async saveSettings(value) {
        const { billingMode, ...settings } = value;
        await db.insert(creditCardSettings).values({ ...settings, closingMode: billingMode }).onConflictDoUpdate({ target: creditCardSettings.accountId, set: { ...settings, closingMode: billingMode, updatedAt: new Date() } });
      },
    },
    statements: {
      async get(id) {
        const [row] = await db.select().from(cardStatements).where(eq(cardStatements.id, id)).limit(1);
        return row ?? null;
      },
      async findByClosingDate(cardAccountId, closingOn) {
        const [row] = await db.select().from(cardStatements).where(and(eq(cardStatements.cardAccountId, cardAccountId), eq(cardStatements.closingOn, closingOn))).limit(1);
        return row ?? null;
      },
      async list(cardAccountId, from, to) {
        const conditions = [eq(cardStatements.cardAccountId, cardAccountId)];
        if (from) conditions.push(gte(cardStatements.closingOn, from));
        if (to) conditions.push(lte(cardStatements.closingOn, to));
        return db.select().from(cardStatements).where(and(...conditions));
      },
      async save(value) {
        await db.insert(cardStatements).values(value).onConflictDoUpdate({
          target: cardStatements.id,
          set: { status: value.status, updatedAt: new Date() },
        });
      },
      async addItems(values) { return values.length ? db.insert(cardStatementItems).values(values).returning() : []; },
      async items(id) { return db.select().from(cardStatementItems).where(eq(cardStatementItems.statementId, id)); },
    },
    installmentPlans: {
      async save(value) { await db.insert(installmentPlans).values(value); },
      async getByPurchase(id) {
        const [row] = await db.select().from(installmentPlans).where(eq(installmentPlans.purchaseTransactionId, id)).limit(1);
        return row ?? null;
      },
    },
    payments: {
      async save(value) { await db.insert(statementPayments).values(value); },
      async list(statementId) { return db.select().from(statementPayments).where(eq(statementPayments.statementId, statementId)); },
      async findByTransfer(id) { return db.select().from(statementPayments).where(eq(statementPayments.transferTransactionId, id)); },
    },
    idempotency: {
      async claim(key, payload) {
        const hash = payloadHash(payload);
        await db.insert(idempotencyClaims).values({ idempotencyKey: key, payloadHash: hash }).onConflictDoNothing();
        const [claim] = await db.select().from(idempotencyClaims).where(eq(idempotencyClaims.idempotencyKey, key)).for("update");
        if (!claim || claim.payloadHash !== hash) throw new DomainError("IDEMPOTENCY_CONFLICT", "Chave de idempotência reutilizada com dados diferentes");
        activePayloadHash = hash;
        return claim.result === null ? { replayed: false, result: null } : { replayed: true, result: decode(claim.result) };
      },
      async complete(key, result) {
        await db.update(idempotencyClaims).set({ result: JSON.parse(encode(result)) }).where(eq(idempotencyClaims.idempotencyKey, key));
      },
    },
  };
}

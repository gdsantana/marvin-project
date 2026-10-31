import {
  bigint,
  boolean,
  check,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Account, Category, ExpenseForecast, Statement, Transaction, TransactionRevision } from "@finance/domain";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "bigint" });

export const institutions = pgTable("institutions", {
  id: id(),
  name: text("name").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [check("institutions_name_nonempty", sql`length(trim(${table.name})) > 0`)]);

export const accounts = pgTable("accounts", {
  id: id(),
  institutionId: uuid("institution_id").references(() => institutions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  type: text("type").$type<Account["type"]>().notNull(),
  currency: text("currency").notNull(),
  openingBalanceMinor: money("opening_balance_minor").notNull().default(0n),
  openingDate: date("opening_date", { mode: "string" }).notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("accounts_name_nonempty", sql`length(trim(${table.name})) > 0`),
  check("accounts_type_valid", sql`${table.type} in ('checking', 'savings', 'cash', 'credit_card')`),
  check("accounts_currency_iso", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check("accounts_currency_brl", sql`${table.currency} = 'BRL'`),
  unique("accounts_id_type_unique").on(table.id, table.type),
]);

export const creditCardSettings = pgTable("credit_card_settings", {
  accountId: uuid("account_id").primaryKey().references(() => accounts.id, { onDelete: "restrict" }),
  creditLimitMinor: money("credit_limit_minor"),
  closingDay: smallint("closing_day").notNull(),
  dueDay: smallint("due_day").notNull(),
  billingTimezone: text("billing_timezone").notNull(),
  closingMode: text("closing_mode").$type<"manual" | "automatic">().notNull().default("manual"),
  updatedAt: updatedAt(),
}, (table) => [
  check("credit_card_settings_limit_nonnegative", sql`${table.creditLimitMinor} is null or ${table.creditLimitMinor} >= 0`),
  check("credit_card_settings_closing_day_valid", sql`${table.closingDay} between 1 and 31`),
  check("credit_card_settings_due_day_valid", sql`${table.dueDay} between 1 and 31`),
  check("credit_card_settings_mode_valid", sql`${table.closingMode} in ('manual', 'automatic')`),
]);

export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").$type<Category["type"]>().notNull(),
  parentId: uuid("parent_id").references((): any => categories.id, { onDelete: "restrict" }),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("categories_name_nonempty", sql`length(trim(${table.name})) > 0`),
  check("categories_type_valid", sql`${table.type} in ('income', 'expense')`),
  index("categories_parent_id_idx").on(table.parentId),
]);

export const agentRequests = pgTable("agent_requests", {
  id: id(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadHash: text("payload_hash").notNull(),
  sourceChannel: text("source_channel").notNull(),
  rawText: text("raw_text"),
  proposedPayload: jsonb("proposed_payload").notNull(),
  status: text("status").notNull().default("proposed"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("agent_requests_key_nonempty", sql`length(trim(${table.idempotencyKey})) > 0`),
  check("agent_requests_payload_hash_nonempty", sql`length(trim(${table.payloadHash})) > 0`),
  check("agent_requests_status_valid", sql`${table.status} in ('proposed', 'committed', 'rejected', 'failed')`),
  uniqueIndex("agent_requests_source_key_unique").on(table.sourceChannel, table.idempotencyKey),
]);

export const idempotencyClaims = pgTable("idempotency_claims", {
  idempotencyKey: text("key").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  result: jsonb("result"),
  createdAt: createdAt(),
}, (table) => [
  check("idempotency_claims_key_nonempty", sql`length(trim(${table.idempotencyKey})) > 0`),
  check("idempotency_claims_payload_hash_nonempty", sql`length(trim(${table.payloadHash})) > 0`),
]);

export const transactions = pgTable("transactions", {
  id: id(),
  kind: text("kind").$type<Transaction["kind"]>().notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  postedOn: date("posted_on", { mode: "string" }),
  description: text("description").notNull(),
  counterpartyName: text("counterparty_name"),
  paymentMethod: text("payment_method").$type<string | null>(),
  notes: text("notes"),
  source: text("source").notNull(),
  reviewStatus: text("review_status").$type<Transaction["reviewStatus"]>().notNull().default("confirmed"),
  originRequestId: uuid("origin_request_id").references(() => agentRequests.id, { onDelete: "restrict" }),
  relatedTransactionId: uuid("related_transaction_id").references((): any => transactions.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key"),
  idempotencyPayloadHash: text("idempotency_payload_hash"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("transactions_kind_valid", sql`${table.kind} in ('expense', 'income', 'transfer', 'refund', 'adjustment')`),
  check("transactions_source_valid", sql`${table.source} in ('manual', 'hermes', 'import')`),
  check("transactions_review_status_valid", sql`${table.reviewStatus} in ('confirmed', 'needs_review')`),
  check("transactions_payment_method_valid", sql`${table.paymentMethod} is null or ${table.paymentMethod} in ('pix', 'debit', 'credit', 'bank_transfer', 'cash', 'other')`),
  check("transactions_description_nonempty", sql`length(trim(${table.description})) > 0`),
  check("transactions_idempotency_pair", sql`(${table.idempotencyKey} is null) = (${table.idempotencyPayloadHash} is null)`),
  index("transactions_occurred_on_idx").on(table.occurredOn),
  uniqueIndex("transactions_source_key_unique").on(table.source, table.idempotencyKey).where(sql`${table.idempotencyKey} is not null`),
  uniqueIndex("transactions_one_reversal_per_original_unique").on(table.relatedTransactionId).where(sql`${table.kind} = 'adjustment' and ${table.relatedTransactionId} is not null`),
]);

export const accountEntries = pgTable("account_entries", {
  id: id(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  amountMinor: money("amount_minor").notNull(),
}, (table) => [
  check("account_entries_amount_nonzero", sql`${table.amountMinor} <> 0`),
  index("account_entries_account_transaction_idx").on(table.accountId, table.transactionId),
  index("account_entries_transaction_id_idx").on(table.transactionId),
]);

export const categoryAllocations = pgTable("category_allocations", {
  id: id(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
  amountMinor: money("amount_minor").notNull(),
}, (table) => [
  index("category_allocations_category_id_idx").on(table.categoryId),
  index("category_allocations_transaction_id_idx").on(table.transactionId),
]);

export const expenseForecasts = pgTable("expense_forecasts", {
  id: uuid("id").primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  expectedOn: date("expected_on", { mode: "string" }).notNull(),
  amountMinor: money("amount_minor").notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  currency: text("currency").notNull(),
  status: text("status").$type<ExpenseForecast["status"]>().notNull().default("projected"),
  realizedTransactionId: uuid("realized_transaction_id").unique().references(() => transactions.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("expense_forecasts_amount_positive", sql`${table.amountMinor} > 0`),
  check("expense_forecasts_currency_iso", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check("expense_forecasts_currency_brl", sql`${table.currency} = 'BRL'`),
  check("expense_forecasts_status_valid", sql`${table.status} in ('projected', 'realized', 'cancelled')`),
  check("expense_forecasts_realized_link", sql`(${table.status} = 'realized') = (${table.realizedTransactionId} is not null)`),
  check("expense_forecasts_description_nonempty", sql`length(trim(${table.description})) > 0`),
  index("expense_forecasts_expected_on_idx").on(table.expectedOn),
  index("expense_forecasts_status_date_currency_idx").on(table.status, table.expectedOn, table.currency),
]);

export const transactionRevisions = pgTable("transaction_revisions", {
  id: uuid("id").primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  revisionNumber: integer("revision_number").notNull(),
  reason: text("reason").notNull(),
  actor: text("actor").notNull(),
  source: text("source").notNull(),
  metadata: jsonb("metadata").$type<TransactionRevision["metadata"]>().notNull(),
  allocations: jsonb("allocations").$type<Array<{ categoryId: string | null; amountMinor: string }> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("transaction_revisions_reason_nonempty", sql`length(trim(${table.reason})) > 0`),
  check("transaction_revisions_number_positive", sql`${table.revisionNumber} > 0`),
  check("transaction_revisions_actor_nonempty", sql`length(trim(${table.actor})) > 0`),
  check("transaction_revisions_source_valid", sql`${table.source} in ('manual', 'hermes', 'import')`),
  uniqueIndex("transaction_revisions_transaction_number_unique").on(table.transactionId, table.revisionNumber),
]);

export const installmentPlans = pgTable("installment_plans", {
  id: id(),
  purchaseTransactionId: uuid("purchase_transaction_id").notNull().unique().references(() => transactions.id, { onDelete: "restrict" }),
  totalAmountMinor: money("total_amount_minor").notNull(),
  installmentCount: smallint("installment_count").notNull(),
  createdAt: createdAt(),
}, (table) => [
  check("installment_plans_total_positive", sql`${table.totalAmountMinor} > 0`),
  check("installment_plans_count_valid", sql`${table.installmentCount} between 1 and 120`),
]);

export const cardStatements = pgTable("card_statements", {
  id: id(),
  cardAccountId: uuid("card_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  cycleStartOn: date("cycle_start_on", { mode: "string" }).notNull(),
  closingOn: date("closing_on", { mode: "string" }).notNull(),
  dueOn: date("due_on", { mode: "string" }).notNull(),
  status: text("status").$type<Statement["status"]>().notNull().default("open"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check("card_statements_cycle_valid", sql`${table.cycleStartOn} < ${table.closingOn}`),
  check("card_statements_due_on_valid", sql`${table.dueOn} >= ${table.closingOn}`),
  check("card_statements_status_valid", sql`${table.status} in ('open', 'closed', 'paid', 'partially_paid', 'overdue')`),
  uniqueIndex("card_statements_card_closing_unique").on(table.cardAccountId, table.closingOn),
  index("card_statements_cycle_idx").on(table.cardAccountId, table.cycleStartOn, table.closingOn),
]);

export const cardStatementItems = pgTable("card_statement_items", {
  id: id(),
  statementId: uuid("statement_id").notNull().references(() => cardStatements.id, { onDelete: "restrict" }),
  sourceTransactionId: uuid("source_transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  installmentPlanId: uuid("installment_plan_id").references(() => installmentPlans.id, { onDelete: "restrict" }),
  installmentNumber: smallint("installment_number"),
  itemType: text("item_type").notNull(),
  amountMinor: money("amount_minor").notNull(),
  description: text("description").notNull(),
}, (table) => [
  check("card_statement_items_type_valid", sql`${table.itemType} in ('purchase', 'interest', 'fee', 'refund', 'cashback', 'adjustment')`),
  check("card_statement_items_description_nonempty", sql`length(trim(${table.description})) > 0`),
  check("card_statement_items_installment_pair", sql`(${table.installmentPlanId} is null) = (${table.installmentNumber} is null)`),
  check("card_statement_items_installment_positive", sql`${table.installmentNumber} is null or ${table.installmentNumber} > 0`),
  index("card_statement_items_statement_id_idx").on(table.statementId),
  uniqueIndex("card_statement_items_plan_number_unique").on(table.installmentPlanId, table.installmentNumber).where(sql`${table.installmentPlanId} is not null and ${table.installmentNumber} is not null`),
]);

export const statementPayments = pgTable("statement_payments", {
  id: id(),
  statementId: uuid("statement_id").notNull().references(() => cardStatements.id, { onDelete: "restrict" }),
  transferTransactionId: uuid("transfer_transaction_id").notNull().references(() => transactions.id, { onDelete: "restrict" }),
  amountMinor: money("amount_minor").notNull(),
}, (table) => [
  check("statement_payments_amount_positive", sql`${table.amountMinor} > 0`),
  index("statement_payments_statement_id_idx").on(table.statementId),
  index("statement_payments_transfer_transaction_id_idx").on(table.transferTransactionId),
]);


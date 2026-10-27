import { z } from "zod";

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use código ISO 4217 em maiúsculas");
const MAX_BIGINT = 9223372036854775807n;
const MIN_BIGINT = -9223372036854775808n;
function isIanaTimeZone(value: string): boolean { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }
const minorAmountPattern = /^-?\d+$/;
const positiveMinorAmountPattern = /^[1-9]\d*$/;
export const minorAmountSchema = z.string().regex(minorAmountPattern, "Dinheiro deve ser inteiro em unidades mínimas").refine(value => !minorAmountPattern.test(value) || (BigInt(value) >= MIN_BIGINT && BigInt(value) <= MAX_BIGINT), "Valor excede o intervalo BIGINT do PostgreSQL");
export const derivedMinorAmountSchema = z.string().regex(/^-?\d+$/, "Dinheiro derivado deve ser inteiro em unidades mínimas");
export const positiveMinorAmountSchema = z.string().regex(positiveMinorAmountPattern).refine(value => !positiveMinorAmountPattern.test(value) || BigInt(value) <= MAX_BIGINT, "Valor excede o intervalo BIGINT do PostgreSQL");
export const dateSchema = z.iso.date();
export const idSchema = z.uuid();
export const idempotencyKeySchema = z.string().trim().min(1).max(200);

export const accountTypeSchema = z.enum(["checking", "savings", "cash", "credit_card"]);
export const categoryTypeSchema = z.enum(["income", "expense"]);
export const paymentMethodSchema = z.enum(["pix", "debit", "credit", "bank_transfer", "cash", "other"]);
export const transactionKindSchema = z.enum(["expense", "income", "transfer", "refund", "adjustment"]);
export const transactionSourceSchema = z.enum(["manual", "hermes", "import"]);
export const reviewStatusSchema = z.enum(["confirmed", "needs_review"]);
export const billingModeSchema = z.enum(["manual", "automatic"]);
export const statementStatusSchema = z.enum(["open", "closed", "paid", "partially_paid", "overdue"]);

export const institutionSchema = z.object({ id: idSchema, name: z.string().trim().min(1), isArchived: z.boolean().default(false) });
export const createInstitutionSchema = z.object({ name: z.string().trim().min(1).max(200) });
export const accountSchema = z.object({
  id: idSchema, institutionId: idSchema.nullable(), name: z.string().trim().min(1), type: accountTypeSchema,
  currency: currencySchema, openingBalanceMinor: minorAmountSchema, openingDate: dateSchema, isArchived: z.boolean().default(false),
});
export const creditCardSettingsInputSchema = z.object({
  creditLimitMinor: minorAmountSchema.nullable(), closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31), billingTimezone: z.string().min(1).refine(isIanaTimeZone, "Use um fuso horário IANA válido"), billingMode: billingModeSchema.default("manual"),
});
export const createAccountSchema = accountSchema.omit({ id: true, isArchived: true }).extend({ cardSettings: creditCardSettingsInputSchema.optional() }).superRefine((account, ctx) => {
  if (account.type === "credit_card" && !account.cardSettings) ctx.addIssue({ code: "custom", path: ["cardSettings"], message: "Configuração obrigatória para cartão" });
  if (account.type !== "credit_card" && account.cardSettings) ctx.addIssue({ code: "custom", path: ["cardSettings"], message: "Configuração de cartão não se aplica a esta conta" });
});
export const creditCardSettingsSchema = creditCardSettingsInputSchema.extend({ accountId: idSchema });
export const categorySchema = z.object({ id: idSchema, name: z.string().trim().min(1), type: categoryTypeSchema, parentId: idSchema.nullable(), isArchived: z.boolean().default(false) });
export const createCategorySchema = categorySchema.omit({ id: true, isArchived: true });
export const allocationInputSchema = z.object({ categoryId: idSchema.nullable(), amountMinor: positiveMinorAmountSchema });
export const transactionMetadataSchema = z.object({
  occurredOn: dateSchema, postedOn: dateSchema.nullable().optional(), description: z.string().trim().min(1).max(500),
  counterpartyName: z.string().trim().max(200).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
  source: transactionSourceSchema.default("manual"), reviewStatus: reviewStatusSchema.default("confirmed"),
});
export const createIncomeSchema = transactionMetadataSchema.extend({ accountId: idSchema, amountMinor: positiveMinorAmountSchema, categoryId: idSchema.nullable(), paymentMethod: paymentMethodSchema.optional() });
export const createExpenseSchema = transactionMetadataSchema.extend({
  accountId: idSchema, amountMinor: positiveMinorAmountSchema, paymentMethod: paymentMethodSchema,
  allocations: z.array(allocationInputSchema).min(1),
});
export const createTransferSchema = transactionMetadataSchema.extend({ fromAccountId: idSchema, toAccountId: idSchema, amountMinor: positiveMinorAmountSchema });
export const createCreditPurchaseSchema = transactionMetadataSchema.extend({
  cardAccountId: idSchema, totalAmountMinor: positiveMinorAmountSchema, installmentCount: z.number().int().min(1).max(120),
  allocations: z.array(allocationInputSchema).min(1), statementMode: billingModeSchema.optional(),
});
export const createCashbackSchema = transactionMetadataSchema.extend({
  accountId: idSchema, amountMinor: positiveMinorAmountSchema, categoryId: idSchema.nullable(), cardStatementId: idSchema.optional(),
});
export const createRefundSchema = transactionMetadataSchema.extend({
  originalTransactionId: idSchema, amountMinor: positiveMinorAmountSchema, accountId: idSchema,
});
export const createExpenseForecastSchema = z.object({
  accountId: idSchema, expectedOn: dateSchema, amountMinor: positiveMinorAmountSchema, categoryId: idSchema.nullable(),
  description: z.string().trim().min(1).max(500),
});
export const realizeExpenseForecastSchema = z.object({
  occurredOn: dateSchema, postedOn: dateSchema.nullable().optional(), paymentMethod: paymentMethodSchema,
  source: transactionSourceSchema.default("manual"), reviewStatus: reviewStatusSchema.default("confirmed"),
});
export const expenseForecastStatusSchema = z.enum(["projected", "realized", "cancelled"]);
export const expenseForecastSchema = createExpenseForecastSchema.extend({
  id: idSchema, currency: currencySchema, status: expenseForecastStatusSchema,
  realizedTransactionId: idSchema.nullable(), createdAt: z.iso.datetime(),
});
export const correctTransactionSchema = z.object({
  transactionId: idSchema, reason: z.string().trim().min(1).max(1000),
  metadata: transactionMetadataSchema.partial().omit({ occurredOn: true, postedOn: true, source: true }),
  allocations: z.array(allocationInputSchema).min(1).optional(),
});
export const reversalReplacementSchema = z.discriminatedUnion("kind", [
  createIncomeSchema.extend({ kind: z.literal("income") }),
  createExpenseSchema.extend({ kind: z.literal("expense") }),
  createTransferSchema.extend({ kind: z.literal("transfer") }),
]);
export const reverseTransactionSchema = z.object({
  transactionId: idSchema, occurredOn: dateSchema, reason: z.string().trim().min(1).max(1000),
  replacement: reversalReplacementSchema.optional(),
});
export const transactionAuditContextSchema = z.object({ actor: z.string().trim().min(1).max(200), source: transactionSourceSchema });
export const createStatementSchema = z.object({
  cardAccountId: idSchema, cycleStartOn: dateSchema, closingOn: dateSchema, dueOn: dateSchema,
});
export const payStatementSchema = transactionMetadataSchema.extend({ statementId: idSchema, fromAccountId: idSchema, amountMinor: positiveMinorAmountSchema });
export const reportQuerySchema = z.object({ from: dateSchema, to: dateSchema, currency: currencySchema.optional() }).refine(value => value.from <= value.to, { path: ["to"], message: "A data final deve ser igual ou posterior à inicial" });
export const idempotentRequestSchema = z.object({ idempotencyKey: idempotencyKeySchema });

export const accountWithBalanceSchema = accountSchema.extend({ balanceMinor: derivedMinorAmountSchema, availableCreditMinor: derivedMinorAmountSchema.nullable().optional() });
export const institutionResponseSchema = institutionSchema;
export const accountResponseSchema = accountWithBalanceSchema;
export const categoryResponseSchema = categorySchema;
export const entryResponseSchema = z.object({
  id: idSchema, accountId: idSchema, accountName: z.string(), accountType: accountTypeSchema, currency: currencySchema, amountMinor: minorAmountSchema,
});
export const allocationResponseSchema = z.object({
  id: idSchema.optional(), categoryId: idSchema.nullable(), categoryName: z.string().nullable(), categoryType: categoryTypeSchema.nullable(), amountMinor: minorAmountSchema,
});
export const transactionResponseSchema = z.object({
  id: idSchema, kind: transactionKindSchema, occurredOn: dateSchema, postedOn: dateSchema.nullable(), description: z.string(),
  counterpartyName: z.string().nullable(), paymentMethod: paymentMethodSchema.nullable(), notes: z.string().nullable(),
  source: transactionSourceSchema, reviewStatus: reviewStatusSchema, relatedTransactionId: idSchema.nullable(),
  entries: z.array(entryResponseSchema), allocations: z.array(allocationResponseSchema),
  revisions: z.array(z.object({ id: idSchema, revisionNumber: z.number().int().positive(), reason: z.string(), actor: z.string(), source: transactionSourceSchema, createdAt: z.iso.datetime() })).default([]),
  reversalOfTransactionId: idSchema.nullable().default(null), reversedByTransactionIds: z.array(idSchema).default([]),
});
export const statementItemResponseSchema = z.object({
  id: idSchema, statementId: idSchema, sourceTransactionId: idSchema, installmentPlanId: idSchema.nullable(),
  installmentNumber: z.number().int().positive().nullable(), itemType: z.enum(["purchase", "interest", "fee", "refund", "cashback", "adjustment"]),
  amountMinor: minorAmountSchema, description: z.string(),
});
export const statementPaymentResponseSchema = z.object({ id: idSchema, statementId: idSchema, transferTransactionId: idSchema, amountMinor: positiveMinorAmountSchema });
export const cardStatementSchema = z.object({ id: idSchema, cardAccountId: idSchema, cycleStartOn: dateSchema, closingOn: dateSchema, dueOn: dateSchema, status: statementStatusSchema });
export const statementDetailSchema = z.object({
  id: idSchema, cardAccountId: idSchema, cardAccountName: z.string(), currency: currencySchema,
  cycleStartOn: dateSchema, closingOn: dateSchema, dueOn: dateSchema, status: statementStatusSchema,
  items: z.array(statementItemResponseSchema), payments: z.array(statementPaymentResponseSchema),
  billedMinor: derivedMinorAmountSchema, paidMinor: derivedMinorAmountSchema, remainingMinor: derivedMinorAmountSchema,
});
export const monthlyReportSchema = z.record(currencySchema, z.object({ incomeMinor: derivedMinorAmountSchema, expenseMinor: derivedMinorAmountSchema, netMinor: derivedMinorAmountSchema }));
export const monthlySummarySchema = z.object({
  from: dateSchema, to: dateSchema, balancesByCurrency: z.record(currencySchema, derivedMinorAmountSchema),
  incomeMinorByCurrency: z.record(currencySchema, derivedMinorAmountSchema), expenseMinorByCurrency: z.record(currencySchema, derivedMinorAmountSchema),
});
export const statementForecastEntrySchema = z.object({ statementId: idSchema, dueOn: dateSchema, billedMinor: derivedMinorAmountSchema, paidMinor: derivedMinorAmountSchema, remainingMinor: derivedMinorAmountSchema });
export const statementForecastSchema = z.record(currencySchema, z.array(statementForecastEntrySchema));
export const createdIdResponseSchema = z.object({ id: idSchema });
export const persistedResultSchema = <T extends z.ZodType>(value: T) => z.object({ value, replayed: z.boolean() });
export const successResponseSchema = <T extends z.ZodType>(data: T) => z.object({ ok: z.literal(true), data });
export const errorResponseSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }) });
export const responseSchema = <T extends z.ZodType>(data: T) => z.discriminatedUnion("ok", [successResponseSchema(data), errorResponseSchema]);
export const createdIdResponseSchemaEnvelope = responseSchema(createdIdResponseSchema);
export const institutionsResponseSchema = responseSchema(z.array(institutionSchema));
export const accountsResponseSchema = responseSchema(z.array(accountWithBalanceSchema));
export const categoriesResponseSchema = responseSchema(z.array(categorySchema));
export const transactionsResponseSchema = responseSchema(z.array(transactionResponseSchema));
export const monthlyReportResponseSchema = responseSchema(monthlyReportSchema);
export const monthlySummaryResponseSchema = responseSchema(monthlySummarySchema);
export const statementForecastResponseSchema = responseSchema(statementForecastSchema);
export const statementsResponseSchema = responseSchema(z.array(statementDetailSchema));
export const statementResponseSchema = responseSchema(statementDetailSchema);
export const transactionCreatedResponseSchema = responseSchema(persistedResultSchema(transactionResponseSchema));
export const creditPurchaseCreatedResponseSchema = responseSchema(persistedResultSchema(z.object({ transaction: transactionResponseSchema, plan: z.object({ id: idSchema, purchaseTransactionId: idSchema, totalAmountMinor: minorAmountSchema, installmentCount: z.number().int() }), items: z.array(statementItemResponseSchema) })));
export const statementPaymentCreatedResponseSchema = responseSchema(persistedResultSchema(z.object({ transaction: transactionResponseSchema, payment: statementPaymentResponseSchema })));
export const statementCloseResponseSchema = responseSchema(persistedResultSchema(cardStatementSchema));
export const expenseForecastResponseSchema = responseSchema(z.array(expenseForecastSchema));
export const expenseForecastCreatedResponseSchema = responseSchema(persistedResultSchema(expenseForecastSchema));
export const transactionCorrectionResponseSchema = responseSchema(persistedResultSchema(transactionResponseSchema));
export const transactionReversedResponseSchema = responseSchema(persistedResultSchema(z.object({ reversal: transactionResponseSchema, replacement: transactionResponseSchema.nullable() })));
export const automaticStatementCloseResultSchema = z.object({ closedCount: z.number().int().nonnegative(), checkedAt: z.iso.datetime() });

export const previewIncomeSchema = createIncomeSchema.extend({ operation: z.literal("income") });
export const previewExpenseSchema = createExpenseSchema.extend({ operation: z.literal("expense") });
export const previewTransferSchema = createTransferSchema.extend({ operation: z.literal("transfer") });
export const previewCreditPurchaseSchema = createCreditPurchaseSchema.extend({ operation: z.literal("credit_purchase") });
export const previewCashbackSchema = createCashbackSchema.extend({ operation: z.literal("cashback") });
export const previewRefundSchema = createRefundSchema.extend({ operation: z.literal("refund") });
export const previewStatementPaymentSchema = payStatementSchema.extend({ operation: z.literal("statement_payment") });
export const previewTransactionSchema = z.discriminatedUnion("operation", [previewIncomeSchema, previewExpenseSchema, previewTransferSchema, previewCreditPurchaseSchema, previewCashbackSchema, previewRefundSchema, previewStatementPaymentSchema]);
export const previewTransactionResponseSchema = z.object({
  operation: z.string(), kind: transactionKindSchema,
  entries: z.array(z.object({ accountId: idSchema, amountMinor: minorAmountSchema })),
  allocations: z.array(z.object({ categoryId: idSchema.nullable(), amountMinor: minorAmountSchema })),
  installments: z.array(z.object({ number: z.number().int().positive(), amountMinor: minorAmountSchema, closingOn: dateSchema, dueOn: dateSchema })).optional(),
  statementId: idSchema.optional(), statementPlan: z.object({ cycleStartOn: dateSchema, closingOn: dateSchema, dueOn: dateSchema }).optional(), remainingStatementMinor: derivedMinorAmountSchema.optional(),
});
export const previewTransactionResponseEnvelopeSchema = responseSchema(previewTransactionResponseSchema);

export const domainErrorCodeSchema = z.enum([
  "VALIDATION_ERROR", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT", "INSUFFICIENT_STATEMENT_BALANCE",
  "CURRENCY_MISMATCH", "INVALID_ACCOUNT_TYPE", "INVALID_CATEGORY", "INVALID_REFUND", "INVARIANT_VIOLATION",
]);
export const domainErrorSchema = z.object({ code: domainErrorCodeSchema, message: z.string(), details: z.record(z.string(), z.unknown()).optional() });
export const apiResultSchema = <T extends z.ZodType>(data: T) => z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data }), z.object({ ok: z.literal(false), error: domainErrorSchema }),
]);

export type Currency = z.infer<typeof currencySchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type DomainErrorCode = z.infer<typeof domainErrorCodeSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type CreateCreditPurchaseInput = z.infer<typeof createCreditPurchaseSchema>;
export type CreateCashbackInput = z.infer<typeof createCashbackSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type CreateExpenseForecastInput = z.infer<typeof createExpenseForecastSchema>;
export type RealizeExpenseForecastInput = z.infer<typeof realizeExpenseForecastSchema>;
export type CorrectTransactionInput = z.infer<typeof correctTransactionSchema>;
export type ReverseTransactionInput = z.infer<typeof reverseTransactionSchema>;
export type TransactionAuditContext = z.infer<typeof transactionAuditContextSchema>;
export type CreateStatementInput = z.infer<typeof createStatementSchema>;
export type PayStatementInput = z.infer<typeof payStatementSchema>;
export type PreviewTransactionInput = z.infer<typeof previewTransactionSchema>;
export type PreviewTransactionOutput = z.infer<typeof previewTransactionResponseSchema>;
export type AccountWithBalance = z.infer<typeof accountWithBalanceSchema>;
export type TransactionResponse = z.infer<typeof transactionResponseSchema>;
export type StatementDetail = z.infer<typeof statementDetailSchema>;
export type InstitutionResponse = z.infer<typeof institutionSchema>;
export type AccountResponse = z.infer<typeof accountWithBalanceSchema>;
export type CategoryResponse = z.infer<typeof categorySchema>;
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
export type MonthlySummary = z.infer<typeof monthlySummarySchema>;
export type StatementForecast = z.infer<typeof statementForecastSchema>;

import { z } from "zod";
import {
  accountsResponseSchema, categoriesResponseSchema, creditCardSettingsSchema, createAccountSchema, createCashbackSchema, domainErrorCodeSchema,
  createCategorySchema, createCreditPurchaseSchema, createExpenseForecastSchema, createExpenseSchema, createIncomeSchema,
  createInstitutionSchema, createRefundSchema, createTransferSchema, createdIdResponseSchemaEnvelope,
  creditPurchaseCreatedResponseSchema, institutionsResponseSchema, monthlySummaryResponseSchema, monthlySeriesResponseSchema, categoryReportResponseSchema,
  correctTransactionSchema, expenseForecastCreatedResponseSchema, expenseForecastResponseSchema, expenseForecastSchema,
  payStatementSchema, previewTransactionResponseEnvelopeSchema, previewTransactionSchema, realizeExpenseForecastSchema, responseSchema,
  reportQuerySchema, reverseTransactionSchema, persistedResultSchema, statementCloseResponseSchema, statementPaymentCreatedResponseSchema,
  statementsResponseSchema, transactionCorrectionResponseSchema, transactionCreatedResponseSchema, transactionReversedResponseSchema, transactionResponseSchema, transactionsResponseSchema,
} from "@finance/contracts";
import { authorize, apiError, domainErrorResponse, readJsonBody } from "@/server/http";
import { financeApplication } from "@/server/finance";

const uuidSchema = z.uuid();
const closeStatementSchema = z.object({ statementId: uuidSchema });
const cancelExpenseForecastSchema = z.object({});
const expenseForecastMutationResponseSchema = responseSchema(persistedResultSchema(expenseForecastSchema));
const expenseForecastRealizedResponseSchema = responseSchema(persistedResultSchema(z.object({
  forecast: expenseForecastSchema, transaction: transactionResponseSchema,
})));
const serialize = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item));
const json = (data: unknown, status = 200, responseSchema?: z.ZodType) => {
  const envelope = { ok: true, data: serialize(data) };
  return Response.json(responseSchema ? responseSchema.parse(envelope) : envelope, { status });
};

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  let access: Awaited<ReturnType<typeof authorize>>;
  try { access = await authorize(request); }
  catch { return apiError("UNAUTHENTICATED", "Entre para continuar.", 401); }
  if (!access.ok) return access.response;
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const { service } = financeApplication();
    const url = new URL(request.url);
    if (route === "institutions") return json(await service.listInstitutions(), 200, institutionsResponseSchema);
    if (route === "accounts") {
      return json(await service.listAccounts(), 200, accountsResponseSchema);
    }
    if (route === "cards/settings") {
      const accountId = uuidSchema.safeParse(url.searchParams.get("accountId"));
      if (!accountId.success) return apiError("VALIDATION_ERROR", "Informe accountId válido.", 400);
      return json(await service.cardSettings(accountId.data), 200, responseSchema(creditCardSettingsSchema));
    }
    if (route === "categories") return json(await service.listCategories(), 200, categoriesResponseSchema);
    if (route === "transactions") {
      const dates = parsePeriod(url);
      if (!dates.success) return dates.response;
      return json(await service.transactionHistory(dates.from, dates.to), 200, transactionsResponseSchema);
    }
    if (route === "expense-forecasts") {
      const parsed = reportQuerySchema.safeExtend({ includePending: z.enum(["true", "false"]).default("false") }).safeParse({
        includePending: url.searchParams.get("includePending") ?? undefined,
        from: url.searchParams.get("from"), to: url.searchParams.get("to"),
        ...(url.searchParams.has("currency") ? { currency: url.searchParams.get("currency") } : {}),
      });
      if (!parsed.success) return validationError(parsed.error);
      return json(await service.listExpenseForecasts(parsed.data.from, parsed.data.to, parsed.data.currency, parsed.data.includePending === "true"), 200, expenseForecastResponseSchema);
    }
    if (route === "statements") {
      const dates = parsePeriod(url);
      if (!dates.success) return dates.response;
      const includePending = z.enum(["true", "false"]).safeParse(url.searchParams.get("includePending") ?? "false");
      if (!includePending.success) return validationError(includePending.error);
      const forecast = await service.statementForecast(dates.from, dates.to, includePending.data === "true");
      const statementIds = Object.values(forecast).flat().map(item => item.statementId);
      const statements = await Promise.all(statementIds.map(id => service.statementDetail(id)));
      return json(statements, 200, statementsResponseSchema);
    }
    if (route === "reports/categories") {
      const dates = parsePeriod(url);
      if (!dates.success) return dates.response;
      return json(await service.categoryReport(dates.from, dates.to), 200, categoryReportResponseSchema);
    }
    if (route === "reports/monthly-series") {
      const dates = parsePeriod(url);
      if (!dates.success) return dates.response;
      return json(await service.monthlySeries(dates.from, dates.to), 200, monthlySeriesResponseSchema);
    }
    if (route === "reports/summary") {
      const dates = parsePeriod(url);
      if (!dates.success) return dates.response;
      return json(await service.monthlySummary(dates.from, dates.to), 200, monthlySummaryResponseSchema);
    }
    return apiError("NOT_FOUND", "Rota da API não encontrada.", 404);
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  let access: Awaited<ReturnType<typeof authorize>>;
  try { access = await authorize(request, true); }
  catch { return apiError("UNAUTHENTICATED", "Entre para continuar.", 401); }
  if (!access.ok) return access.response;
  const body = await readJsonBody(request, 65536);
  if (!body.ok) return apiError(body.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", body.status === 413 ? "Requisição muito grande." : "Corpo JSON inválido.", body.status);
  const raw = body.data;
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const { service } = financeApplication();
    if (route === "transactions/preview") {
      const parsed = previewTransactionSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return json(await service.previewTransaction(parsed.data), 200, previewTransactionResponseEnvelopeSchema);
    }

    const key = request.headers.get("idempotency-key")?.trim();
    if (!key || key.length > 200) return apiError("IDEMPOTENCY_KEY_REQUIRED", "Envie uma chave Idempotency-Key (até 200 caracteres).", 400);

    if (route === "institutions") {
      const parsed = createInstitutionSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return json({ id: await service.createInstitution(parsed.data, key) }, 201, createdIdResponseSchemaEnvelope);
    }
    if (route === "accounts") {
      const parsed = createAccountSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const { cardSettings, ...account } = parsed.data;
      const id = await service.createAccount({
        ...account,
        openingBalanceMinor: BigInt(account.openingBalanceMinor),
        ...(cardSettings ? { cardSettings: { ...cardSettings, creditLimitMinor: cardSettings.creditLimitMinor === null ? null : BigInt(cardSettings.creditLimitMinor) } } : {}),
      }, key);
      return json({ id }, 201, createdIdResponseSchemaEnvelope);
    }
    if (route === "categories") {
      const parsed = createCategorySchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return json({ id: await service.createCategory(parsed.data, key) }, 201, createdIdResponseSchemaEnvelope);
    }
    if (route === "cards/configuration") {
      const parsed = creditCardSettingsSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      await service.configureCard({ ...parsed.data, creditLimitMinor: parsed.data.creditLimitMinor === null ? null : BigInt(parsed.data.creditLimitMinor) }, key);
      return json(parsed.data, 200, responseSchema(creditCardSettingsSchema));
    }
    if (route === "transactions/income") {
      const parsed = createIncomeSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return await transactionResult(service.createIncome(parsed.data, key), service.transactionHistory.bind(service), parsed.data.occurredOn, 201);
    }
    if (route === "transactions/expense") {
      const parsed = createExpenseSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return await transactionResult(service.createExpense(parsed.data, key), service.transactionHistory.bind(service), parsed.data.occurredOn, 201);
    }
    if (route === "transactions/transfer") {
      const parsed = createTransferSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return await transactionResult(service.createTransfer(parsed.data, key), service.transactionHistory.bind(service), parsed.data.occurredOn, 201);
    }
    if (route === "transactions/credit-purchase") {
      const parsed = createCreditPurchaseSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const result = await service.createCreditPurchase(parsed.data, key);
      const transaction = (await service.transactionHistory(parsed.data.occurredOn, parsed.data.occurredOn)).find(row => row.id === result.value.transaction.id);
      if (!transaction) return apiError("INVARIANT_VIOLATION", "Não foi possível recuperar a compra registrada.", 500);
      return json({ value: { ...result.value, transaction }, replayed: result.replayed }, 201, creditPurchaseCreatedResponseSchema);
    }
    if (route === "transactions/cashback") {
      const parsed = createCashbackSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return await transactionResult(service.createCashback(parsed.data, key), service.transactionHistory.bind(service), parsed.data.occurredOn, 201);
    }
    if (route === "transactions/refund") {
      const parsed = createRefundSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return await transactionResult(service.createRefund(parsed.data, key), service.transactionHistory.bind(service), parsed.data.occurredOn, 201);
    }
    if (route === "statements/payment") {
      const parsed = payStatementSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const result = await service.payStatement(parsed.data, key);
      const transaction = (await service.transactionHistory(parsed.data.occurredOn, parsed.data.occurredOn)).find(row => row.id === result.value.transaction.id);
      if (!transaction) return apiError("INVARIANT_VIOLATION", "Não foi possível recuperar o pagamento registrado.", 500);
      return json({ value: { transaction, payment: result.value.payment }, replayed: result.replayed }, 201, statementPaymentCreatedResponseSchema);
    }
    if (route === "statements/close") {
      const parsed = closeStatementSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const result = await service.closeStatement(parsed.data.statementId, key);
      return json(result, 200, statementCloseResponseSchema);
    }
    if (route === "expense-forecasts") {
      const parsed = createExpenseForecastSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      return json(await service.createExpenseForecast(parsed.data, key), 201, expenseForecastCreatedResponseSchema);
    }
    const forecastAction = /^expense-forecasts\/([^/]+)\/(realize|cancel)$/.exec(route);
    if (forecastAction) {
      const id = uuidSchema.safeParse(forecastAction[1]);
      if (!id.success) return apiError("VALIDATION_ERROR", "Informe um identificador de previsão válido.", 400);
      if (forecastAction[2] === "cancel") {
        if (!cancelExpenseForecastSchema.safeParse(raw).success) return apiError("VALIDATION_ERROR", "Corpo de cancelamento inválido.", 400);
        return json(await service.cancelExpenseForecast(id.data, key), 200, expenseForecastMutationResponseSchema);
      }
      const parsed = realizeExpenseForecastSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const result = await service.realizeExpenseForecast(id.data, parsed.data, key);
      const transaction = (await service.transactionHistory(result.value.transaction.occurredOn, result.value.transaction.occurredOn)).find(item => item.id === result.value.transaction.id);
      if (!transaction) return apiError("INVARIANT_VIOLATION", "Não foi possível recuperar a despesa realizada.", 500);
      return json({ value: { forecast: result.value.forecast, transaction }, replayed: result.replayed }, 201, expenseForecastRealizedResponseSchema);
    }
    if (route === "transactions/correct") {
      const parsed = correctTransactionSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const audit = { actor: access.client === "mcp" ? "hermes" : "local-user", source: access.client === "mcp" ? "hermes" as const : "manual" as const };
      const result = await service.correctTransaction(parsed.data, key, audit);
      const transaction = (await service.transactionHistory("0001-01-01", "9999-12-31")).find(item => item.id === parsed.data.transactionId);
      if (!transaction) return apiError("INVARIANT_VIOLATION", "Não foi possível recuperar o lançamento corrigido.", 500);
      return json({ value: transaction, replayed: result.replayed }, 200, transactionCorrectionResponseSchema);
    }
    if (route === "transactions/reverse") {
      const parsed = reverseTransactionSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      const audit = { actor: access.client === "mcp" ? "hermes" : "local-user", source: access.client === "mcp" ? "hermes" as const : "manual" as const };
      const result = await service.reverseTransaction(parsed.data, key, audit);
      const dates = [parsed.data.occurredOn, parsed.data.replacement?.occurredOn].filter((date): date is string => Boolean(date)).sort();
      const history = await service.transactionHistory(dates[0]!, dates.at(-1)!);
      const reversal = history.find(item => item.id === result.value.reversal.id);
      const replacement = result.value.replacement ? history.find(item => item.id === result.value.replacement!.id) ?? null : null;
      if (!reversal || (result.value.replacement && !replacement)) return apiError("INVARIANT_VIOLATION", "Não foi possível recuperar a reversão ou sua substituição.", 500);
      return json({ value: { reversal, replacement }, replayed: result.replayed }, 201, transactionReversedResponseSchema);
    }
    return apiError("NOT_FOUND", "Rota da API não encontrada.", 404);
  } catch (error) { return handleError(error); }
}

async function transactionResult(operation: Promise<{ value: { id: string }; replayed: boolean }>, history: (from: string, to: string) => Promise<Array<{ id: string } & Record<string, unknown>>>, date: string, status: number) {
  const result = await operation;
  const transaction = (await history(date, date)).find(row => row.id === result.value.id);
  if (!transaction) return apiError("INVARIANT_VIOLATION", "Não foi possível recuperar a movimentação registrada.", 500);
  return json({ value: transaction, replayed: result.replayed }, status, transactionCreatedResponseSchema);
}

function parsePeriod(url: URL): { success: true; from: string; to: string } | { success: false; response: Response } {
  const parsed = reportQuerySchema.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  return parsed.success ? { success: true, from: parsed.data.from, to: parsed.data.to } : { success: false, response: apiError("VALIDATION_ERROR", "Informe um período válido com from e to.", 400) };
}

function validationError(error: z.ZodError) {
  return Response.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Confira os campos informados.", details: error.flatten() } }, { status: 400 });
}

function handleError(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
    const code = domainErrorCodeSchema.safeParse(candidate.code);
    if (code.success && typeof candidate.message === "string") {
      const status = code.data === "NOT_FOUND" ? 404 : code.data === "CONFLICT" || code.data === "IDEMPOTENCY_CONFLICT" ? 409 : 422;
      const details = candidate.details && typeof candidate.details === "object" && !Array.isArray(candidate.details) ? candidate.details : undefined;
      return Response.json({ ok: false, error: { code: code.data, message: candidate.message, ...(details ? { details } : {}) } }, { status });
    }
  }
  return domainErrorResponse(error);
}

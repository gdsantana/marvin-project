import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  accountWithBalanceSchema, categorySchema, cardStatementSchema, createCashbackSchema, createCreditPurchaseSchema,
  createStatementAdjustmentSchema, creditCardSettingsSchema,
  createExpenseSchema, createIncomeSchema, createRefundSchema, createTransferSchema, idSchema,
  createAccountSchema, createCategorySchema, createInstitutionSchema, createdIdResponseSchema, institutionSchema,
  createExpenseForecastSchema, correctTransactionSchema, expenseForecastCreatedResponseSchema, expenseForecastSchema,
  idempotencyKeySchema, payStatementSchema, persistedResultSchema, realizeExpenseForecastSchema, reverseTransactionSchema,
  transactionCorrectionResponseSchema, transactionReversedResponseSchema,
  previewTransactionResponseSchema, previewTransactionSchema, reportQuerySchema, statementDetailSchema,
  statementItemResponseSchema, statementPaymentResponseSchema, transactionResponseSchema,
  creditPurchaseCreatedResponseSchema, monthlySummarySchema as apiMonthlySummarySchema, monthlySeriesSchema,
} from "@finance/contracts";
import { z } from "zod";
import { bearerTokenIsValid } from "./auth.js";
import { WebApiClient, WebApiError } from "./api-client.js";

const periodSchema = z.object({ from: reportQuerySchema.shape.from, to: reportQuerySchema.shape.to });
const pendingPeriodSchema = periodSchema.extend({ includePending: z.boolean().default(false) });
const forecastQuerySchema = reportQuerySchema.safeExtend({ includePending: z.boolean().default(false) });
const forecastPeriodSchema = forecastQuerySchema.shape;
const withIdempotencyKey = (schema: z.ZodObject<z.ZodRawShape>): z.ZodObject<z.ZodRawShape> => {
  const { source: _source, ...shape } = schema.shape;
  return z.object({ ...shape, idempotencyKey: idempotencyKeySchema });
};
const accountOutputSchema = z.array(accountWithBalanceSchema);
const transactionOutputSchema = z.array(transactionResponseSchema);
const statementsOutputSchema = z.array(statementDetailSchema);
const persistedTransactionSchema = persistedResultSchema(transactionResponseSchema);
const purchaseDataSchema = persistedResultSchema(z.object({
  transaction: transactionResponseSchema,
  plan: creditPurchaseCreatedResponseSchema.options[0].shape.data.shape.value.shape.plan,
  items: z.array(statementItemResponseSchema),
}));
const paymentDataSchema = persistedResultSchema(z.object({ transaction: transactionResponseSchema, payment: statementPaymentResponseSchema }));
const closeStatementDataSchema = persistedResultSchema(cardStatementSchema);
const expenseForecastDataSchema = persistedResultSchema(expenseForecastSchema);
const expenseForecastRealizedDataSchema = persistedResultSchema(z.object({
  forecast: expenseForecastSchema, transaction: transactionResponseSchema,
}));
const validatedPeriod = (input: { from: string; to: string }) => reportQuerySchema.parse(input);

function apiToolResult<T>(work: () => Promise<T>) {
  return work().then(data => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] })).catch(error => ({
    isError: true,
    content: [{ type: "text" as const, text: error instanceof WebApiError ? `${error.code ?? "API_ERROR"}: ${error.message}` : "A API financeira está indisponível. Tente novamente." }],
  }));
}

export function createFinanceMcpServer(api: WebApiClient) {
  const server = new McpServer({ name: "marvin-finance", version: "0.1.0" });
  server.registerTool("get_accounts", {
    description: "Lista contas e saldos atuais para selecionar uma conta existente.", inputSchema: {},
  }, () => apiToolResult(() => api.request("v1/accounts", accountOutputSchema)));
  server.registerTool("get_card_settings", {
    description: "Consulta limite, fechamento, vencimento, fuso e modo de faturamento de um cartão.",
    inputSchema: z.object({ accountId: idSchema }).shape,
  }, input => apiToolResult(() => {
    const { accountId } = z.object({ accountId: idSchema }).parse(input);
    return api.request(`v1/cards/settings?accountId=${encodeURIComponent(accountId)}`, creditCardSettingsSchema);
  }));
  server.registerTool("configure_card", {
    description: "Altera limite e configuração de ciclo de um cartão pela API autenticada.",
    inputSchema: withIdempotencyKey(creditCardSettingsSchema).shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, ...settings } = withIdempotencyKey(creditCardSettingsSchema).parse(input);
    return api.request("v1/cards/configuration", creditCardSettingsSchema, {
      method: "POST", body: creditCardSettingsSchema.parse(settings), idempotencyKey: idempotencyKey as string,
    });
  }));
  server.registerTool("get_institutions", {
    description: "Lista instituições financeiras disponíveis para selecionar uma instituição.", inputSchema: {},
  }, () => apiToolResult(() => api.request("v1/institutions", z.array(institutionSchema))));
  server.registerTool("get_categories", {
    description: "Lista categorias para classificar uma receita ou despesa.", inputSchema: {},
  }, () => apiToolResult(() => api.request("v1/categories", z.array(categorySchema))));
  server.registerTool("get_transactions", {
    description: "Consulta lançamentos entre as datas informadas.", inputSchema: periodSchema.shape,
  }, input => apiToolResult(() => {
    const { from, to } = validatedPeriod(input);
    return api.request(`v1/transactions?from=${from}&to=${to}`, transactionOutputSchema);
  }));
  server.registerTool("get_monthly_summary", {
    description: "Consulta resumo financeiro por moeda no período informado.", inputSchema: periodSchema.shape,
  }, input => apiToolResult(() => {
    const { from, to } = validatedPeriod(input);
    return api.request(`v1/reports/summary?from=${from}&to=${to}`, apiMonthlySummarySchema);
  }));
  server.registerTool("get_monthly_series", {
    description: "Consulta uma série mensal de receitas e despesas em reais.", inputSchema: periodSchema.shape,
  }, input => apiToolResult(() => {
    const { from, to } = validatedPeriod(input);
    return api.request(`v1/reports/monthly-series?from=${from}&to=${to}`, monthlySeriesSchema);
  }));
  server.registerTool("get_statements", {
    description: "Consulta faturas no período e, opcionalmente, pendências antigas.", inputSchema: pendingPeriodSchema.shape,
  }, input => apiToolResult(() => {
    const { from, to } = validatedPeriod(input);
    const { includePending } = pendingPeriodSchema.parse(input);
    return api.request(`v1/statements?from=${from}&to=${to}&includePending=${includePending}`, statementsOutputSchema);
  }));
  server.registerTool("get_expense_forecasts", {
    description: "Lista previsões avulsas de despesa por período e moeda, separadas de saldos e faturas.",
    inputSchema: forecastPeriodSchema,
  }, input => apiToolResult(() => {
    const { from, to, currency, includePending } = forecastQuerySchema.parse(input);
    const query = new URLSearchParams({ from, to });
    if (currency) query.set("currency", currency);
    query.set("includePending", String(includePending));
    return api.request(`v1/expense-forecasts?${query}`, z.array(expenseForecastSchema));
  }));
  server.registerTool("preview_transaction", {
    description: "Valida e simula uma operação pela API financeira sem persistir movimentações.",
    inputSchema: z.object({ transaction: previewTransactionSchema }).shape,
  }, input => apiToolResult(async () => {
    const transaction = previewTransactionSchema.parse({ ...input.transaction, source: "hermes" });
    return api.request("v1/transactions/preview", previewTransactionResponseSchema, {
      method: "POST", body: transaction, allowWithoutIdempotency: true,
    });
  }));

  const writes = [
    ["create_income", "Registra uma receita validada pela API financeira.", "transactions/income", createIncomeSchema, persistedTransactionSchema],
    ["create_expense", "Registra uma despesa validada pela API financeira.", "transactions/expense", createExpenseSchema, persistedTransactionSchema],
    ["create_transfer", "Registra uma transferência entre contas validada pela API financeira.", "transactions/transfer", createTransferSchema, persistedTransactionSchema],
    ["create_credit_purchase", "Registra compra no cartão com total e quantidade de parcelas.", "transactions/credit-purchase", createCreditPurchaseSchema, purchaseDataSchema],
    ["create_cashback", "Registra cashback validado pela API financeira.", "transactions/cashback", createCashbackSchema, persistedTransactionSchema],
    ["create_refund", "Registra estorno vinculado à transação original.", "transactions/refund", createRefundSchema, persistedTransactionSchema],
  ] as const;

  for (const [name, description, path, schema, outputSchema] of writes) {
    const inputSchema = withIdempotencyKey(schema);
    server.registerTool(name, { description, inputSchema: inputSchema.shape }, input => apiToolResult(async () => {
      const { idempotencyKey, ...payload } = inputSchema.parse(input);
      const validated = schema.parse({ ...payload, source: "hermes" });
      return api.request<unknown>(`v1/${path}`, outputSchema as z.ZodType<unknown>, { method: "POST", body: validated, idempotencyKey: idempotencyKey as string });
    }));
  }

  const setupWrites = [
    ["create_institution", "Cria uma instituição financeira.", "institutions", createInstitutionSchema],
    ["create_account", "Cria uma conta financeira, incluindo configuração obrigatória do cartão quando aplicável.", "accounts", createAccountSchema],
    ["create_category", "Cria uma categoria de receita ou despesa.", "categories", createCategorySchema],
  ] as const;
  for (const [name, description, path, schema] of setupWrites) {
    const inputSchema = withIdempotencyKey(schema);
    server.registerTool(name, { description, inputSchema: inputSchema.shape }, input => apiToolResult(async () => {
      const { idempotencyKey, ...payload } = inputSchema.parse(input);
      return api.request(`v1/${path}`, createdIdResponseSchema, {
        method: "POST", body: schema.parse(payload), idempotencyKey: idempotencyKey as string,
      });
    }));
  }

  server.registerTool("adjust_statement", {
    description: "Acrescenta uma cobrança anterior ao uso a uma fatura aberta. Conta como despesa do mês em Ajuste de fatura e aumenta a dívida. Confirme que o valor não está no saldo inicial ou em outros lançamentos. Não gera parcelas futuras.",
    inputSchema: withIdempotencyKey(createStatementAdjustmentSchema).shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, ...payload } = withIdempotencyKey(createStatementAdjustmentSchema).parse(input);
    return api.request("v1/statements/adjustment", persistedResultSchema(transactionResponseSchema), {
      method: "POST", body: createStatementAdjustmentSchema.parse({ ...payload, source: "hermes" }), idempotencyKey: idempotencyKey as string,
    });
  }));
  server.registerTool("pay_statement", {
    description: "Paga total ou parcialmente uma fatura pela API financeira.",
    inputSchema: withIdempotencyKey(payStatementSchema).shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, ...payload } = withIdempotencyKey(payStatementSchema).parse(input);
    return api.request("v1/statements/payment", paymentDataSchema, {
      method: "POST", body: payStatementSchema.parse({ ...payload, source: "hermes" }), idempotencyKey: idempotencyKey as string,
    });
  }));
  server.registerTool("close_statement", {
    description: "Fecha uma fatura aberta pela API financeira.",
    inputSchema: z.object({ statementId: idSchema, idempotencyKey: idempotencyKeySchema }).shape,
  }, input => apiToolResult(() => api.request("v1/statements/close", closeStatementDataSchema, {
    method: "POST", body: { statementId: input.statementId }, idempotencyKey: input.idempotencyKey as string,
  })));

  const createForecastInput = withIdempotencyKey(createExpenseForecastSchema);
  server.registerTool("create_expense_forecast", {
    description: "Registra uma previsão avulsa de despesa sem movimentar o saldo.", inputSchema: createForecastInput.shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, ...payload } = createForecastInput.parse(input);
    return api.request("v1/expense-forecasts", expenseForecastCreatedResponseSchema.options[0].shape.data, {
      method: "POST", body: createExpenseForecastSchema.parse(payload), idempotencyKey: idempotencyKey as string,
    });
  }));

  const realizeForecastInput = withIdempotencyKey(realizeExpenseForecastSchema).extend({ forecastId: idSchema });
  server.registerTool("realize_expense_forecast", {
    description: "Concilia uma previsão projetada como despesa pela API financeira.", inputSchema: realizeForecastInput.shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, forecastId, ...payload } = realizeForecastInput.parse(input);
    const body = realizeExpenseForecastSchema.parse({ ...payload, source: "hermes" });
    return api.request(`v1/expense-forecasts/${forecastId}/realize`, expenseForecastRealizedDataSchema, {
      method: "POST", body, idempotencyKey: idempotencyKey as string,
    });
  }));

  const cancelForecastInput = z.object({ forecastId: idSchema, idempotencyKey: idempotencyKeySchema });
  server.registerTool("cancel_expense_forecast", {
    description: "Cancela uma previsão ainda projetada sem alterar saldos ou movimentações.", inputSchema: cancelForecastInput.shape,
  }, input => apiToolResult(async () => {
    const { forecastId, idempotencyKey } = cancelForecastInput.parse(input);
    return api.request(`v1/expense-forecasts/${forecastId}/cancel`, expenseForecastDataSchema, {
      method: "POST", body: {}, idempotencyKey,
    });
  }));

  const correctionInput = withIdempotencyKey(correctTransactionSchema);
  server.registerTool("correct_transaction", {
    description: "Registra uma revisão rastreável de metadados ou categorias de um lançamento suportado.", inputSchema: correctionInput.shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, ...payload } = correctionInput.parse(input);
    const body = correctTransactionSchema.parse(payload);
    return api.request("v1/transactions/correct", transactionCorrectionResponseSchema.options[0].shape.data, {
      method: "POST", body, idempotencyKey: idempotencyKey as string,
    });
  }));

  const reverseInput = withIdempotencyKey(reverseTransactionSchema);
  server.registerTool("reverse_transaction", {
    description: "Solicita reversão compensatória explícita, com motivo e substituição opcional; operações de cartão/fatura incompatíveis são recusadas.", inputSchema: reverseInput.shape,
  }, input => apiToolResult(async () => {
    const { idempotencyKey, ...payload } = reverseInput.parse(input);
    const body = reverseTransactionSchema.parse(payload);
    return api.request("v1/transactions/reverse", transactionReversedResponseSchema.options[0].shape.data, {
      method: "POST", body, idempotencyKey: idempotencyKey as string,
    });
  }));

  return server;
}

export function createMcpApp(token: string, api: WebApiClient): Express {
  if (Buffer.byteLength(token) < 32) throw new Error("MCP_HERMES_BEARER_TOKEN deve conter ao menos 32 bytes");
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_request, response) => response.json({ ok: true, data: { status: "ok" } }));
  app.all("/mcp", async (request, response, next) => {
    if (!bearerTokenIsValid(request.header("authorization"), token)) {
      response.setHeader("WWW-Authenticate", "Bearer");
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    let cleanup: (() => void) | undefined;
    try {
      const server = createFinanceMcpServer(api);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, maxRequestBodySize: 64 * 1024 });
      let cleaned = false;
      cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        void transport.close().then(() => server.close()).catch(() => undefined);
      };
      response.once("close", cleanup);
      transport.onclose = cleanup;
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      cleanup?.();
      next(error);
    }
  });
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (response.headersSent) return;
    const details = error as { status?: number; type?: string };
    if (details.type === "entity.too.large") return response.status(413).json({ error: "Payload too large" });
    if (details.type === "entity.parse.failed") return response.status(400).json({ error: "Invalid JSON" });
    response.status(500).json({ error: "Internal server error" });
  });
  return app;
}

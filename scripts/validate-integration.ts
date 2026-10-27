import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, scrypt as scryptCallback } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  accountsResponseSchema, categoriesResponseSchema, createdIdResponseSchemaEnvelope, creditCardSettingsSchema,
  creditPurchaseCreatedResponseSchema, expenseForecastCreatedResponseSchema,
  expenseForecastSchema, institutionsResponseSchema, monthlySummaryResponseSchema, persistedResultSchema,
  previewTransactionResponseEnvelopeSchema, responseSchema, statementCloseResponseSchema, statementsResponseSchema,
  statementPaymentCreatedResponseSchema, transactionCorrectionResponseSchema, transactionCreatedResponseSchema,
  transactionReversedResponseSchema, transactionResponseSchema, transactionsResponseSchema,
} from "../packages/contracts/src/index.ts";

const scrypt = promisify(scryptCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--production") ? "production" : "dev";
const pgBin = process.env.PG_BIN ?? "/tmp/marvin-pg-runtime/usr/bin";
const pgLib = process.env.PG_LIB ?? "/tmp/marvin-pg-runtime/usr/lib";
const children: ChildProcess[] = [];
const failures: string[] = [];
const serverDiagnostics: string[] = [];
let mcpClient: {
  close(): Promise<void>;
  connect(transport: any): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<any>;
} | undefined;
let activeCleanup: (() => Promise<void>) | undefined;
let pgData = "";

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = root) {
  const child = spawn(command, args, { cwd, env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", chunk => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (const line of lines) serverDiagnostics.push(safeMessage(line.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]").replace(/(?:https?:\/\/)[^\s]+/g, "[url]")));
    if (serverDiagnostics.length > 12) serverDiagnostics.splice(0, serverDiagnostics.length - 12);
  });
  children.push(child);
  return child;
}

async function command(commandName: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(commandName, args, { cwd: root, env, stdio: "ignore" });
    children.push(child);
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${commandName} exited ${code}`)));
  });
}

async function capture(commandName: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(commandName, args, { cwd: root, env, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout?.on("data", chunk => { stdout += String(chunk); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${commandName} exited ${code}`)));
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function waitHttp(url: string, predicate: (response: Response) => boolean, child?: ChildProcess) {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error(`${new URL(url).pathname}: servidor saiu (${child.exitCode ?? child.signalCode})${serverDiagnostics.length ? `; ${serverDiagnostics.join(" | ")}` : ""}`);
    try {
      const response = await fetch(url);
      if (response.status >= 500) {
        const body = await response.text();
        const match = body.match(/"message":"((?:\\.|[^"\\])*)"/);
        let message = "";
        try { if (match) message = JSON.parse(`"${match[1]}"`); } catch { /* use status only */ }
        throw new Error(`${new URL(url).pathname}: HTTP ${response.status}${message ? ` ${safeMessage(message).replace(/\s+/g, " ").slice(0, 240)}` : ""}${serverDiagnostics.length ? `; log: ${serverDiagnostics.join(" | ")}` : ""}`);
      }
      if (predicate(response)) return response;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${new URL(url).pathname}: HTTP`)) throw error;
    }
    await delay(300);
  }
  throw new Error(`Timeout aguardando ${new URL(url).pathname}${serverDiagnostics.length ? `; diagnóstico: ${serverDiagnostics.join(" | ")}` : ""}`);
}

async function bounded<T>(work: Promise<T>, label: string, timeoutMs = 20_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([work, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label}: timeout após ${timeoutMs} ms`)), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function stop(child: ChildProcess) {
  const exited = child.exitCode !== null || child.signalCode !== null;
  try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); } catch { /* process group already exited */ }
  if (!exited) await Promise.race([new Promise<void>(resolve => child.once("exit", () => resolve())), delay(5000)]);
  try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL"); else if (child.exitCode === null) child.kill("SIGKILL"); } catch { /* process group already exited */ }
}

function safeMessage(value: unknown) {
  return String(value ?? "").replace(/bearer\s+[^\s,;]+/ig, "Bearer [redacted]").replace(/scrypt\$[^\s]+/ig, "[redacted]").slice(0, 180);
}

async function json(response: Response, label: string): Promise<any> {
  const raw = await response.text();
  try { return JSON.parse(raw); }
  catch { throw new Error(`${label}: HTTP ${response.status}, corpo não JSON (${raw.length} bytes)${serverDiagnostics.length ? `; diagnóstico: ${serverDiagnostics.join(" | ")}` : ""}`); }
}

async function responseSummary(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    return `HTTP ${response.status} ${safeMessage(parsed?.error?.code)} ${safeMessage(parsed?.error?.message)}`.trim();
  } catch {
    const data = body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    try {
      const parsed = JSON.parse(data ?? "null");
      const message = String(parsed?.err?.message ?? "").split(/\r?\n/)[0];
      return `HTTP ${response.status} ${safeMessage(parsed?.err?.name)} ${safeMessage(message)}`.trim();
    } catch { return `HTTP ${response.status} non-JSON (${body.length} bytes)`; }
  }
}

function cookiesFrom(response: Response) {
  const values = response.headers.getSetCookie().map(value => value.split(";", 1)[0]!);
  return values;
}

async function main() {
  const pgPort = await freePort();
  const webPort = await freePort();
  const mcpPort = await freePort();
  const scratch = await mkdtemp(path.join(os.tmpdir(), "marvin-integration-"));
  pgData = path.join(scratch, "pgdata");
  const password = randomBytes(32).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await scrypt(password, salt, 64) as Buffer).toString("hex");
  const serviceToken = randomBytes(32).toString("base64url");
  const hermesToken = randomBytes(32).toString("base64url");
  const sessionSecret = randomBytes(32).toString("base64url");
  const origin = `http://127.0.0.1:${webPort}`;
  const dbUrl = `postgresql://postgres@127.0.0.1:${pgPort}/postgres`;
  const commonEnv = { ...process.env, DATABASE_URL: dbUrl, APP_ORIGIN: origin, SESSION_SECRET: sessionSecret,
    WEB_PASSWORD_HASH: `scrypt$${salt}$${passwordHash}`, MCP_API_TOKEN: serviceToken,
    MCP_HERMES_BEARER_TOKEN: hermesToken, MCP_API_URL: `${origin}/api/`, NEXT_TELEMETRY_DISABLED: "1",
    PATH: `${pgBin}:${process.env.PATH ?? ""}`, LD_LIBRARY_PATH: `${pgLib}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}` };
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => cleanupPromise ??= (async () => {
    await mcpClient?.close().catch(() => undefined);
    for (const child of [...children].reverse()) await stop(child);
    if (pgData) {
      try { await command(path.join(pgBin, "pg_ctl"), ["-D", pgData, "-m", "immediate", "stop"], commonEnv); } catch { /* server may not have started */ }
    }
    await rm(scratch, { recursive: true, force: true });
  })();
  activeCleanup = cleanup;
  try {
    const postgresVersion = await capture(path.join(pgBin, "postgres"), ["--version"], commonEnv);
    if (!postgresVersion.includes("18.6")) throw new Error("O harness exige o runtime PostgreSQL 18.6 em PG_BIN.");
    await command(path.join(pgBin, "initdb"), ["-D", pgData, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"], commonEnv);
    await command(path.join(pgBin, "pg_ctl"), ["-D", pgData, "-o", `-h 127.0.0.1 -k ${scratch} -p ${pgPort} -F`, "-w", "start"], commonEnv);
    await command("pnpm", ["--filter", "@finance/db", "db:migrate"], commonEnv);

    const nextCli = path.join(root, "apps/web/node_modules/next/dist/bin/next");
    const web = mode === "dev"
      ? start(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(webPort)], commonEnv, path.join(root, "apps/web"))
      : start(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(webPort)], commonEnv, path.join(root, "apps/web"));
    const mcp = mode === "dev"
      ? start(process.execPath, [path.join(root, "apps/mcp/node_modules/tsx/dist/cli.mjs"), "src/index.ts"], { ...commonEnv, MCP_PORT: String(mcpPort) }, path.join(root, "apps/mcp"))
      : start(process.execPath, [path.join(root, "apps/mcp/dist/index.js")], { ...commonEnv, MCP_PORT: String(mcpPort) });
    const base = `http://127.0.0.1:${webPort}`;
    await waitHttp(`${base}/api/health`, r => r.ok, web);
    await waitHttp(`http://127.0.0.1:${mcpPort}/healthz`, r => r.ok, mcp);

    const unauth = await fetch(`${base}/api/v1/accounts`);
    const unauthBody = await json(unauth, "unauthenticated GET accounts");
    check(unauth.status === 401 && unauthBody?.error?.code === "UNAUTHENTICATED", `GET sem credencial: HTTP ${unauth.status} ${safeMessage(unauthBody?.error?.code)} ${safeMessage(unauthBody?.error?.message)}; esperado 401 UNAUTHENTICATED`);
    const csrfReject = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.invalid" }, body: JSON.stringify({ password }) });
    assert.equal(csrfReject.status, 403, "login must reject foreign Origin");
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const jar = cookiesFrom(login);
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: jar.join("; ") } });
    const csrfToken = (await json(session, "auth/session")).data.csrfToken as string;
    assert.ok(csrfToken);
    const webHeaders = { cookie: jar.join("; "), origin, "x-csrf-token": csrfToken, "content-type": "application/json" };
    const csrfWriteReject = await fetch(`${base}/api/v1/institutions`, { method: "POST", headers: { cookie: jar.join("; "), origin, "content-type": "application/json", "idempotency-key": randomUUID() }, body: JSON.stringify({ name: "Must be rejected" }) });
    const csrfWriteBody = await json(csrfWriteReject, "write without CSRF");
    check(csrfWriteReject.status === 403 && csrfWriteBody?.error?.code === "CSRF_REJECTED", `escrita sem token CSRF: HTTP ${csrfWriteReject.status} ${safeMessage(csrfWriteBody?.error?.code)}; esperado 403 CSRF_REJECTED`);
    const bearerHeaders = { authorization: `Bearer ${serviceToken}` };
    const bearerCheck = await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders });
    const bearerBody = await json(bearerCheck, "service bearer GET accounts");
    check(bearerCheck.status === 200 && accountsResponseSchema.safeParse(bearerBody).success, `bearer de serviço: HTTP ${bearerCheck.status} ${safeMessage(bearerBody?.error?.code)} ${safeMessage(bearerBody?.error?.message)}; esperado GET válido`);
    const invalidBearer = await fetch(`${base}/api/v1/accounts`, { headers: { authorization: "Bearer invalid-token" } });
    check(invalidBearer.status === 401, `bearer inválido da API deve retornar 401, recebeu ${invalidBearer.status}`);

    const malformedJson = await fetch(`${base}/api/v1/transactions/income`, { method: "POST", headers: { ...webHeaders, "idempotency-key": randomUUID() }, body: "{" });
    check(malformedJson.status === 400, `JSON malformado deve retornar 400, recebeu ${malformedJson.status}`);
    const malformedAmount = await fetch(`${base}/api/v1/transactions/income`, { method: "POST", headers: { ...webHeaders, "idempotency-key": randomUUID() }, body: JSON.stringify({ occurredOn: "2026-10-25", description: "Malformed amount", accountId: randomUUID(), amountMinor: "abc1.2", categoryId: null }) });
    check(malformedAmount.status === 400, `amountMinor abc1.2 deve retornar 400, recebeu ${malformedAmount.status}`);

    const requireMcp = createRequire(path.join(root, "apps/mcp/package.json"));
    const { Client } = await import(requireMcp.resolve("@modelcontextprotocol/sdk/client/index.js"));
    const { StreamableHTTPClientTransport } = await import(requireMcp.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js"));
    mcpClient = new Client({ name: "marvin-integration", version: "1.0.0" });
    await bounded(mcpClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`), { requestInit: { headers: { authorization: `Bearer ${hermesToken}` } } })), "MCP initialize");
    const toolNames = (await bounded(mcpClient.listTools(), "MCP tools/list")).tools.map((tool: { name: string }) => tool.name);
    const requiredTools = ["get_accounts", "get_transactions", "get_monthly_summary", "create_income", "create_expense_forecast", "get_expense_forecasts", "realize_expense_forecast", "cancel_expense_forecast", "correct_transaction", "reverse_transaction", "preview_transaction", "close_statement", "pay_statement"];
    check(requiredTools.every(name => toolNames.includes(name)), `MCP tools/list ausentes: ${requiredTools.filter(name => !toolNames.includes(name)).join(", ") || "nenhum"}`);
    const mcpResultJson = (result: any, label: string) => {
      const message = result.content?.find((part: any) => part.type === "text")?.text;
      if (result.isError || typeof message !== "string") throw new Error(`${label}: MCP isError=${Boolean(result.isError)} ${safeMessage(message)}${serverDiagnostics.length ? `; diagnóstico: ${serverDiagnostics.join(" | ")}` : ""}`);
      try { return JSON.parse(message); } catch { throw new Error(`${label}: resposta MCP não JSON`); }
    };
    const directAccounts = await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders });
    if (!directAccounts.ok) throw new Error(`GET /api/v1/accounts (bearer): ${await responseSummary(directAccounts)}`);
    const mcpAccountsBefore = mcpResultJson(await bounded(mcpClient.callTool({ name: "get_accounts", arguments: {} }), "MCP get_accounts"), "get_accounts");
    check(Array.isArray(mcpAccountsBefore) && mcpAccountsBefore.length === 0, "MCP get_accounts deve ler a base inicialmente vazia");

    const post = async <T>(route: string, payload: unknown, schema: { parse(value: unknown): T }, key = randomUUID()): Promise<Extract<T, { ok: true }>> => {
      const response = await fetch(`${base}/api/v1/${route}`, { method: "POST", headers: { ...webHeaders, "idempotency-key": key }, body: JSON.stringify(payload) });
      const data = await json(response, route);
      if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${safeMessage(data?.error?.code)} ${safeMessage(data?.error?.message)}`);
      return schema.parse(data) as Extract<T, { ok: true }>;
    };
    const date = "2026-10-25";
    const created = (value: unknown) => createdIdResponseSchemaEnvelope.parse(value).data.id;
    const institutionId = created(await post("institutions", { name: "Integrated bank" }, createdIdResponseSchemaEnvelope));
    const incomeCat = created(await post("categories", { name: "Salary", type: "income", parentId: null }, createdIdResponseSchemaEnvelope));
    const expenseCat = created(await post("categories", { name: "Household", type: "expense", parentId: null }, createdIdResponseSchemaEnvelope));
    const revisedExpenseCat = created(await post("categories", { name: "Corrected category", type: "expense", parentId: null }, createdIdResponseSchemaEnvelope));
    const checkingId = created(await post("accounts", { name: "Checking", type: "checking", currency: "BRL", openingBalanceMinor: "0", openingDate: date, institutionId }, createdIdResponseSchemaEnvelope));
    const otherCheckingId = created(await post("accounts", { name: "Savings", type: "checking", currency: "BRL", openingBalanceMinor: "0", openingDate: date, institutionId }, createdIdResponseSchemaEnvelope));
    const eurId = created(await post("accounts", { name: "Euro", type: "checking", currency: "EUR", openingBalanceMinor: "0", openingDate: date, institutionId }, createdIdResponseSchemaEnvelope));
    const cardId = created(await post("accounts", { name: "Credit", type: "credit_card", currency: "BRL", openingBalanceMinor: "0", openingDate: "2026-01-01", institutionId, cardSettings: { creditLimitMinor: "500000", closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, createdIdResponseSchemaEnvelope));
    const baseMeta = { occurredOn: date, description: "Integration", source: "manual" };
    const salaryKey = randomUUID();
    const salary = { occurredOn: date, description: "Salary", accountId: checkingId, amountMinor: "500000", categoryId: incomeCat };
    const firstIncome = persistedResultSchema(transactionResponseSchema).parse(mcpResultJson(await bounded(mcpClient.callTool({ name: "create_income", arguments: { ...salary, idempotencyKey: salaryKey } }), "MCP create_income"), "MCP create_income"));
    const replay = persistedResultSchema(transactionResponseSchema).parse(mcpResultJson(await bounded(mcpClient.callTool({ name: "create_income", arguments: { ...salary, idempotencyKey: salaryKey } }), "MCP create_income replay"), "MCP create_income replay"));
    check(firstIncome.replayed === false && replay.replayed === true && replay.value.id === firstIncome.value.id, "replay MCP deve devolver a mesma receita sem duplicar operação");
    const directConflictResponse = await fetch(`${base}/api/v1/transactions/income`, { method: "POST", headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": salaryKey }, body: JSON.stringify({ ...salary, amountMinor: "500001" }) });
    const directConflictRaw = await directConflictResponse.text();
    let directConflict: any;
    try { directConflict = JSON.parse(directConflictRaw); } catch { /* report status and sanitized server diagnostic below */ }
    check(directConflictResponse.status === 409 && directConflict?.error?.code === "IDEMPOTENCY_CONFLICT", `idempotency conflict API retornou HTTP ${directConflictResponse.status} ${safeMessage(directConflict?.error?.code)} ${safeMessage(directConflict?.error?.message)}${serverDiagnostics.length ? `; diagnóstico: ${serverDiagnostics.join(" | ")}` : `; body bytes=${directConflictRaw.length}`}; esperado 409 IDEMPOTENCY_CONFLICT`);
    const conflictResult = await bounded(mcpClient.callTool({ name: "create_income", arguments: { ...salary, amountMinor: "500001", idempotencyKey: salaryKey } }), "MCP create_income conflict");
    const conflictText = safeMessage(conflictResult.content?.find((part: any) => part.type === "text")?.text);
    check(conflictResult.isError === true && /IDEMPOTENCY_CONFLICT/.test(conflictText), `reuso divergente via MCP: isError=${Boolean(conflictResult.isError)} code/message=${conflictText || "ausente"}; esperado IDEMPOTENCY_CONFLICT`);
    for (const [description, paymentMethod] of [["Pix", "pix"], ["Debit", "debit"]] as const) await post("transactions/expense", { ...baseMeta, description, accountId: checkingId, amountMinor: "10000", paymentMethod, allocations: [{ categoryId: expenseCat, amountMinor: "10000" }] }, transactionCreatedResponseSchema);
    await post("transactions/transfer", { ...baseMeta, fromAccountId: checkingId, toAccountId: otherCheckingId, amountMinor: "20000" }, transactionCreatedResponseSchema);
    await post("transactions/income", { ...baseMeta, description: "EUR salary", accountId: eurId, amountMinor: "70000", categoryId: incomeCat }, transactionCreatedResponseSchema);

    const purchasePayload = { ...baseMeta, description: "Three installments", cardAccountId: cardId, totalAmountMinor: "100000", installmentCount: 3, allocations: [{ categoryId: expenseCat, amountMinor: "70000" }, { categoryId: revisedExpenseCat, amountMinor: "30000" }] };
    const beforePreviewTransactions = await fetch(`${base}/api/v1/transactions?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => json(r, "transactions before preview"));
    const beforePreviewStatements = await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => json(r, "statements before preview"));
    const previewValue = mcpResultJson(await bounded(mcpClient.callTool({ name: "preview_transaction", arguments: { transaction: { ...purchasePayload, operation: "credit_purchase", source: "hermes" } } }), "MCP preview_transaction"), "MCP preview_transaction");
    const preview = previewTransactionResponseEnvelopeSchema.parse({ ok: true, data: previewValue });
    check(preview.data.installments?.reduce((n, item) => n + BigInt(item.amountMinor), 0n) === 100000n, "preview da compra deve parcelar em soma exata de 100000");
    const afterPreviewTransactions = await fetch(`${base}/api/v1/transactions?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => json(r, "transactions after preview"));
    const afterPreviewStatements = await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => json(r, "statements after preview"));
    check(JSON.stringify(beforePreviewTransactions) === JSON.stringify(afterPreviewTransactions) && JSON.stringify(beforePreviewStatements) === JSON.stringify(afterPreviewStatements), "preview MCP não pode alterar transações ou faturas");
    const beforePreview = await fetch(`${base}/api/v1/accounts`, { headers: webHeaders }).then(async r => accountsResponseSchema.parse(await json(r, "accounts before preview")).data);
    check(beforePreview.find(x => x.id === cardId)?.balanceMinor === "0", "preview não pode escrever saldo de cartão");
    const purchase = (await post("transactions/credit-purchase", purchasePayload, creditPurchaseCreatedResponseSchema)).data;
    assert.equal(purchase.value.items.reduce((n, item) => n + BigInt(item.amountMinor), 0n), 100000n);
    check(purchase.value.items.map((item: any) => item.amountMinor).join(",") === "33333,33333,33334", "parcelamento 100000/3 deve distribuir centavos como 33333,33333,33334");
    check(purchase.value.transaction.allocations.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) === -100000n && new Set(purchase.value.transaction.allocations.map(item => item.categoryId)).size === 2, "compra deve alocar o total negativo integral entre duas categorias");
    assert.equal(purchase.value.transaction.entries.filter(e => e.accountId === cardId).reduce((n, e) => n + BigInt(e.amountMinor), 0n), -100000n);
    const installmentStatements = await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data);
    const schedule = purchase.value.items.map((item: any) => installmentStatements.find(statement => statement.id === item.statementId)).map((statement: any) => `${statement.closingOn}/${statement.dueOn}`);
    check(schedule.join(",") === "2026-11-20/2026-11-28,2026-12-20/2026-12-28,2027-01-20/2027-01-28", `datas das parcelas divergentes: ${schedule.join(",")}`);
    const firstStatementId = purchase.value.items[0]!.statementId;
    await post("statements/close", { statementId: firstStatementId }, statementCloseResponseSchema);
    const partial = { ...baseMeta, description: "Partial payment", statementId: firstStatementId, fromAccountId: checkingId, amountMinor: "10000" };
    const partialPayment = await post("statements/payment", partial, statementPaymentCreatedResponseSchema);
    const afterPartialStatement = (await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data)).find(statement => statement.id === firstStatementId);
    check(afterPartialStatement?.status === "partially_paid" && afterPartialStatement.paidMinor === "10000", "pagamento parcial deve atualizar valor pago sem criar despesa");
    const concurrent = await Promise.all(["15000", "15000"].map((amountMinor, i) => fetch(`${base}/api/v1/statements/payment`, { method: "POST", headers: { ...webHeaders, "idempotency-key": `parallel-${i}-${randomUUID()}` }, body: JSON.stringify({ ...baseMeta, description: "Concurrent payment", statementId: firstStatementId, fromAccountId: checkingId, amountMinor }) }))).then(async responses => Promise.all(responses.map(async r => ({ status: r.status, body: await json(r, "concurrent statement payment") }))));
    check(concurrent.filter(r => r.status === 201).length === 1 && concurrent.filter(r => r.status === 409 || r.status === 422).length === 1, `pagamentos concorrentes: statuses ${concurrent.map(r => r.status).join(",")}; esperado um sucesso e um conflito`);
    await post("statements/payment", { ...baseMeta, description: "Complete the 33333 installment", statementId: firstStatementId, fromAccountId: checkingId, amountMinor: "8333" }, statementPaymentCreatedResponseSchema);
    const fullyPaidStatement = (await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data)).find(statement => statement.id === firstStatementId);
    check(fullyPaidStatement?.status === "paid" && fullyPaidStatement.paidMinor === "33333" && fullyPaidStatement.remainingMinor === "0", "pagamentos cumulativos devem liquidar exatamente 33333 sem nova despesa");
    const paidCycleBeforeAccounts = await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(r => r.json()).then(v => accountsResponseSchema.parse(v).data);
    const paidCycleBeforeStatements = await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data);
    const paidCycleAttempt = await fetch(`${base}/api/v1/transactions/credit-purchase`, { method: "POST", headers: { ...webHeaders, "idempotency-key": randomUUID() }, body: JSON.stringify({ ...baseMeta, description: "Must not append to paid cycle", cardAccountId: cardId, totalAmountMinor: "1000", installmentCount: 1, allocations: [{ categoryId: expenseCat, amountMinor: "1000" }] }) });
    const paidCycleAttemptBody = await json(paidCycleAttempt, "credit purchase into paid cycle");
    check(paidCycleAttempt.status === 409 && paidCycleAttemptBody?.error?.code === "CONFLICT", `compra nova em ciclo já pago deve retornar 409 CONFLICT, recebeu HTTP ${paidCycleAttempt.status} ${safeMessage(paidCycleAttemptBody?.error?.code)}`);
    const paidCycleAfterAccounts = await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(r => r.json()).then(v => accountsResponseSchema.parse(v).data);
    const paidCycleAfterStatements = await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data);
    check(paidCycleAfterAccounts.find(account => account.id === cardId)?.balanceMinor === paidCycleBeforeAccounts.find(account => account.id === cardId)?.balanceMinor && JSON.stringify(paidCycleAfterStatements.find(statement => statement.id === firstStatementId)) === JSON.stringify(paidCycleBeforeStatements.find(statement => statement.id === firstStatementId)), "compra recusada no ciclo pago não pode alterar saldo do cartão nem conteúdo/status da fatura paga");

    const checkingCashback = await post("transactions/cashback", { ...baseMeta, description: "Cashback checking", accountId: checkingId, amountMinor: "2000", categoryId: null }, transactionCreatedResponseSchema);
    check(checkingCashback.data.value.kind === "income" && checkingCashback.data.value.entries.some((entry: any) => entry.accountId === checkingId && entry.amountMinor === "2000"), "cashback corrente deve criar crédito na conta corrente");
    const secondStatement = purchase.value.items[1]!.statementId;
    const cardCashback = await post("transactions/cashback", { ...baseMeta, description: "Cashback card", accountId: cardId, cardStatementId: secondStatement, amountMinor: "500", categoryId: null }, transactionCreatedResponseSchema);
    const cashbackStatements = await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => json(r, "cashback statements"));
    check(cardCashback.data.value.kind === "income" && cashbackStatements.data.some((statement: any) => statement.items.some((item: any) => item.sourceTransactionId === cardCashback.data.value.id && item.itemType === "cashback" && item.amountMinor === "-500")), "cashback no cartão deve criar item negativo na fatura indicada");
    const refund = await post("transactions/refund", { ...baseMeta, description: "Refund", originalTransactionId: purchase.value.transaction.id, accountId: cardId, amountMinor: "1000" }, transactionCreatedResponseSchema);
    assert.equal(refund.data.value.allocations[0]?.categoryId, expenseCat);

    const report = await fetch(`${base}/api/v1/reports/summary?from=${date}&to=2026-12-31`, { headers: bearerHeaders }).then(async r => monthlySummaryResponseSchema.parse(await json(r, "summary report")).data);
    check(Boolean(report.incomeMinorByCurrency.BRL && report.incomeMinorByCurrency.EUR), "relatório deve manter receitas BRL e EUR separadas");
    check(report.incomeMinorByCurrency.EUR === "70000" && (report.expenseMinorByCurrency.EUR === undefined || report.expenseMinorByCurrency.EUR === "0"), "relatório EUR deve conter receita EUR e nenhuma despesa agregada de BRL");
    check(report.incomeMinorByCurrency.BRL === "502500" && report.expenseMinorByCurrency.BRL === "119000", `relatório BRL divergente: income=${report.incomeMinorByCurrency.BRL ?? "ausente"}, expense=${report.expenseMinorByCurrency.BRL ?? "ausente"}; esperado 502500/119000`);
    const balances = await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(async r => accountsResponseSchema.parse(await json(r, "accounts balance")).data);
    const balanceSum = balances.filter(a => a.currency === "BRL").reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n);
    check(balanceSum === 383500n, `saldo assinado BRL=${balanceSum}; esperado 383500 (437000+20000-73500), transferências e pagamentos sem despesa nova`);
    const institutions = await fetch(`${base}/api/v1/institutions`, { headers: bearerHeaders }).then(r => r.json()).then(v => institutionsResponseSchema.parse(v).data);
    const categories = await fetch(`${base}/api/v1/categories`, { headers: bearerHeaders }).then(r => r.json()).then(v => categoriesResponseSchema.parse(v).data);
    assert.ok(institutions.some(v => v.id === institutionId) && categories.some(v => v.id === expenseCat));

    const historyCardId = created(await post("accounts", { name: "Card history", type: "credit_card", currency: "BRL", openingBalanceMinor: "0", openingDate: date, institutionId, cardSettings: { creditLimitMinor: "100000", closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, createdIdResponseSchemaEnvelope));
    const historyPurchase = (await post("transactions/credit-purchase", { ...baseMeta, description: "Closed historical statement", cardAccountId: historyCardId, totalAmountMinor: "1000", installmentCount: 1, allocations: [{ categoryId: expenseCat, amountMinor: "1000" }] }, creditPurchaseCreatedResponseSchema)).data.value;
    const historyStatementId = historyPurchase.items[0]!.statementId;
    await post("statements/close", { statementId: historyStatementId }, statementCloseResponseSchema);
    const oldStatementBeforeConfig = (await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data)).find(statement => statement.id === historyStatementId)!;
    await post("cards/configuration", { accountId: historyCardId, creditLimitMinor: "100000", closingDay: 15, dueDay: 25, billingTimezone: "America/Sao_Paulo", billingMode: "manual" }, responseSchema(creditCardSettingsSchema));
    const oldStatementAfterConfig = (await fetch(`${base}/api/v1/statements?from=${date}&to=2027-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data)).find(statement => statement.id === historyStatementId)!;
    check(oldStatementBeforeConfig.status === "closed" && oldStatementAfterConfig.status === "closed" && oldStatementAfterConfig.closingOn === oldStatementBeforeConfig.closingOn && oldStatementAfterConfig.dueOn === oldStatementBeforeConfig.dueOn && JSON.stringify(oldStatementAfterConfig.items) === JSON.stringify(oldStatementBeforeConfig.items), "reconfigurar cartão não pode reescrever fatura encerrada");

    const mcpCloseRaw = mcpResultJson(await bounded(mcpClient.callTool({ name: "close_statement", arguments: { statementId: secondStatement, idempotencyKey: randomUUID() } }), "MCP close statement"), "MCP close statement");
    const mcpClosed = statementCloseResponseSchema.parse({ ok: true, data: mcpCloseRaw });
    check(mcpClosed.data.value.status === "closed", "fechamento manual MCP deve atualizar a fatura pela API");
    const mcpPaymentRaw = mcpResultJson(await bounded(mcpClient.callTool({ name: "pay_statement", arguments: { occurredOn: date, description: "MCP partial payment", statementId: secondStatement, fromAccountId: checkingId, amountMinor: "5000", idempotencyKey: randomUUID() } }), "MCP partial payment"), "MCP partial payment");
    const mcpPayment = statementPaymentCreatedResponseSchema.parse({ ok: true, data: mcpPaymentRaw });
    check(mcpPayment.data.value.payment.amountMinor === "5000", "pagamento parcial MCP deve registrar o valor informado");

    const dateScenarioCardId = created(await post("accounts", { name: "Open cycle card for posting-date scenarios", type: "credit_card", currency: "BRL", openingBalanceMinor: "0", openingDate: "2026-01-01", institutionId, cardSettings: { creditLimitMinor: "100000", closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, createdIdResponseSchemaEnvelope));
    const beforeOneTimePurchase = (await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(r => r.json()).then(v => accountsResponseSchema.parse(v).data));
    const postedPurchase = (await post("transactions/credit-purchase", { ...baseMeta, occurredOn: "2026-10-20", postedOn: "2026-10-21", description: "Closing date and posting date", cardAccountId: dateScenarioCardId, totalAmountMinor: "10000", installmentCount: 1, allocations: [{ categoryId: expenseCat, amountMinor: "10000" }] }, creditPurchaseCreatedResponseSchema)).data.value;
    const afterOneTimePurchase = (await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(r => r.json()).then(v => accountsResponseSchema.parse(v).data));
    check(beforeOneTimePurchase.find(account => account.id === checkingId)?.balanceMinor === afterOneTimePurchase.find(account => account.id === checkingId)?.balanceMinor && BigInt(afterOneTimePurchase.find(account => account.id === dateScenarioCardId)!.balanceMinor) - BigInt(beforeOneTimePurchase.find(account => account.id === dateScenarioCardId)!.balanceMinor) === -10000n, "compra crédito 1x deve reduzir o passivo do cartão sem movimentar a conta corrente");
    const postedStatement = (await fetch(`${base}/api/v1/statements?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data)).find(statement => statement.items.some(item => item.sourceTransactionId === postedPurchase.transaction.id));
    check(postedStatement?.closingOn === "2026-11-20" && postedStatement.items.some(item => item.sourceTransactionId === postedPurchase.transaction.id && item.amountMinor === "10000"), "compra no dia do fechamento com postedOn no ciclo seguinte deve entrar na fatura de novembro");

    const revisedPurchase = (await post("transactions/credit-purchase", { ...baseMeta, occurredOn: "2026-10-19", description: "Refund after reclassification", cardAccountId: dateScenarioCardId, totalAmountMinor: "5000", installmentCount: 1, allocations: [{ categoryId: expenseCat, amountMinor: "5000" }] }, creditPurchaseCreatedResponseSchema)).data.value;
    const correctionResponse = await fetch(`${base}/api/v1/transactions/correct`, { method: "POST", headers: { ...webHeaders, "idempotency-key": randomUUID() }, body: JSON.stringify({ transactionId: revisedPurchase.transaction.id, reason: "Correct category", actor: "untrusted-body-actor", source: "hermes", metadata: { description: "Corrected category purchase" }, allocations: [{ categoryId: revisedExpenseCat, amountMinor: "5000" }] }) });
    const corrected = transactionCorrectionResponseSchema.parse(await json(correctionResponse, "transaction correction"));
    check(correctionResponse.status === 200 && corrected.ok && corrected.data.value.revisions[0]?.actor === "local-user" && corrected.data.value.revisions[0]?.source === "manual", "auditoria de revisão deve usar identidade/origem do servidor e ignorar actor/source enviados no body");
    const statementsBeforeRefundPreview = await fetch(`${base}/api/v1/statements?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.text());
    const historiesBeforeRefundPreview = await fetch(`${base}/api/v1/transactions?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.text());
    const refundPreview = mcpResultJson(await bounded(mcpClient.callTool({ name: "preview_transaction", arguments: { transaction: { ...baseMeta, occurredOn: "2026-10-19", postedOn: "2026-10-21", operation: "refund", originalTransactionId: revisedPurchase.transaction.id, amountMinor: "1000", accountId: dateScenarioCardId } } }), "MCP preview posted refund"), "MCP preview posted refund");
    check(refundPreview.allocations?.[0]?.categoryId === revisedExpenseCat && (refundPreview.statementId === postedStatement?.id || refundPreview.statementPlan?.closingOn === "2026-11-20"), "preview de estorno deve usar categoria revisada e fatura/ciclo pela data de postagem");
    check(statementsBeforeRefundPreview === await fetch(`${base}/api/v1/statements?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.text()) && historiesBeforeRefundPreview === await fetch(`${base}/api/v1/transactions?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.text()), "preview de estorno deve deixar transações e faturas sem alteração");
    const postedRefund = await post("transactions/refund", { ...baseMeta, occurredOn: "2026-10-19", postedOn: "2026-10-21", description: "Posted refund", originalTransactionId: revisedPurchase.transaction.id, accountId: dateScenarioCardId, amountMinor: "1000" }, transactionCreatedResponseSchema);
    check(postedRefund.data.value.allocations[0]?.categoryId === revisedExpenseCat, "estorno deve reduzir a categoria revisada efetiva");
    const postedRefundStatement = (await fetch(`${base}/api/v1/statements?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => statementsResponseSchema.parse(v).data)).find(statement => statement.items.some(item => item.sourceTransactionId === postedRefund.data.value.id));
    check(postedRefundStatement?.closingOn === "2026-11-20" && postedRefundStatement.items.some(item => item.sourceTransactionId === postedRefund.data.value.id && item.amountMinor === "-1000"), "estorno postado após fechamento deve criar crédito na fatura do ciclo seguinte");
    check(statementsBeforeRefundPreview !== await fetch(`${base}/api/v1/statements?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.text()) && historiesBeforeRefundPreview !== await fetch(`${base}/api/v1/transactions?from=2026-10-01&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.text()), "estorno commit deve criar histórico/fatura após preview sem escrita");

    const forecastInput = { accountId: checkingId, expectedOn: "2026-10-30", amountMinor: "2500", categoryId: expenseCat, description: "One-off forecast" };
    const forecastKey = randomUUID();
    const balanceBeforeForecast = (await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(r => r.json()).then(v => accountsResponseSchema.parse(v).data)).find(account => account.id === checkingId)?.balanceMinor;
    const transactionCountBeforeForecast = (await fetch(`${base}/api/v1/transactions?from=${date}&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => transactionsResponseSchema.parse(v).data)).length;
    const forecastCreated = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_expense_forecast", arguments: { ...forecastInput, idempotencyKey: forecastKey } }), "MCP create forecast"), "MCP create forecast");
    const forecast = expenseForecastCreatedResponseSchema.parse({ ok: true, data: forecastCreated });
    const forecastId = forecast.data.value.id;
    const forecastReplay = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_expense_forecast", arguments: { ...forecastInput, idempotencyKey: forecastKey } }), "MCP forecast replay"), "MCP forecast replay");
    check(forecastCreated.replayed === false && forecastReplay.replayed === true && forecastReplay.value.id === forecastId, "criar previsão via MCP deve ser idempotente e única");
    const forecastConflict = await bounded(mcpClient.callTool({ name: "create_expense_forecast", arguments: { ...forecastInput, amountMinor: "2501", idempotencyKey: forecastKey } }), "MCP forecast idempotency conflict");
    check(forecastConflict.isError === true && /IDEMPOTENCY_CONFLICT/.test(safeMessage(forecastConflict.content?.find((part: any) => part.type === "text")?.text)), "MCP deve rejeitar chave de previsão reutilizada com payload divergente");
    const forecastList = await bounded(mcpClient.callTool({ name: "get_expense_forecasts", arguments: { from: "2026-10-01", to: "2026-10-31", currency: "BRL" } }), "MCP list forecasts");
    const listedForecasts = (mcpResultJson(forecastList, "MCP list forecasts") as unknown[]).map(item => expenseForecastSchema.parse(item));
    check(listedForecasts.some((item: any) => item.id === forecastId && item.status === "projected"), "MCP deve listar a previsão projetada por moeda");
    const balanceAfterForecast = (await fetch(`${base}/api/v1/accounts`, { headers: bearerHeaders }).then(r => r.json()).then(v => accountsResponseSchema.parse(v).data)).find(account => account.id === checkingId)?.balanceMinor;
    const transactionCountAfterForecast = (await fetch(`${base}/api/v1/transactions?from=${date}&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => transactionsResponseSchema.parse(v).data)).length;
    check(balanceBeforeForecast === balanceAfterForecast && transactionCountBeforeForecast === transactionCountAfterForecast, "previsão projetada não deve criar movimentação nem alterar saldo");
    const realizationInput = { forecastId, occurredOn: "2026-10-26", postedOn: "2026-10-27", paymentMethod: "debit" as const };
    const realizationCalls = await Promise.all(["realize-race-a", "realize-race-b"].map(idempotencyKey => bounded(mcpClient!.callTool({ name: "realize_expense_forecast", arguments: { ...realizationInput, idempotencyKey } }), `MCP realize forecast ${idempotencyKey}`)));
    const realizationSuccess = realizationCalls.filter(result => !result.isError);
    const realizationErrors = realizationCalls.filter(result => result.isError);
    check(realizationSuccess.length === 1 && realizationErrors.length === 1 && /CONFLICT/.test(safeMessage(realizationErrors[0]?.content?.find((part: any) => part.type === "text")?.text)), "realização concorrente de previsão deve gravar uma única despesa e rejeitar a duplicata");
    const realizedForecastRaw = realizationSuccess.length ? mcpResultJson(realizationSuccess[0], "MCP realized forecast") : null;
    if (realizedForecastRaw) {
      const realizedForecast = { ...realizedForecastRaw, value: { ...realizedForecastRaw.value, forecast: expenseForecastSchema.parse(realizedForecastRaw.value.forecast), transaction: transactionResponseSchema.parse(realizedForecastRaw.value.transaction) } };
      check(realizedForecast.value.forecast.status === "realized" && realizedForecast.value.transaction.postedOn === "2026-10-27" && realizedForecast.value.transaction.source === "hermes", "realização MCP deve preservar postedOn e origem server-side Hermes");
      const replayKey = realizationCalls[0]!.isError ? "realize-race-b" : "realize-race-a";
      const realizationReplay = mcpResultJson(await bounded(mcpClient.callTool({ name: "realize_expense_forecast", arguments: { ...realizationInput, idempotencyKey: replayKey } }), "MCP realize forecast replay"), "MCP realize forecast replay");
      check(realizationReplay.replayed === true, "replay da realização deve retornar resultado persistido");
      const duplicateRealization = await bounded(mcpClient.callTool({ name: "realize_expense_forecast", arguments: { ...realizationInput, idempotencyKey: randomUUID() } }), "MCP duplicate realization");
      check(duplicateRealization.isError === true && /CONFLICT/.test(safeMessage(duplicateRealization.content?.find((part: any) => part.type === "text")?.text)), "segunda chave não pode realizar previsão já conciliada");
    }
    const cancelInput = { ...forecastInput, expectedOn: "2026-11-01", description: "Cancelled forecast" };
    const cancelCreated = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_expense_forecast", arguments: { ...cancelInput, idempotencyKey: randomUUID() } }), "MCP create forecast to cancel"), "MCP create forecast to cancel");
    const cancelKey = randomUUID();
    const cancelResult = mcpResultJson(await bounded(mcpClient.callTool({ name: "cancel_expense_forecast", arguments: { forecastId: cancelCreated.value.id, idempotencyKey: cancelKey } }), "MCP cancel forecast"), "MCP cancel forecast");
    const cancelledForecast = persistedResultSchema(expenseForecastSchema).parse(cancelResult);
    const cancelReplay = persistedResultSchema(expenseForecastSchema).parse(mcpResultJson(await bounded(mcpClient.callTool({ name: "cancel_expense_forecast", arguments: { forecastId: cancelCreated.value.id, idempotencyKey: cancelKey } }), "MCP cancel forecast replay"), "MCP cancel forecast replay"));
    const duplicateCancel = await bounded(mcpClient.callTool({ name: "cancel_expense_forecast", arguments: { forecastId: cancelCreated.value.id, idempotencyKey: randomUUID() } }), "MCP duplicate forecast cancellation");
    check(cancelledForecast.value.status === "cancelled" && cancelledForecast.replayed === false && cancelReplay.value.id === cancelledForecast.value.id && cancelReplay.replayed === true && duplicateCancel.isError === true && /CONFLICT/.test(safeMessage(duplicateCancel.content?.find((part: any) => part.type === "text")?.text)), "cancelamento MCP deve ser persistido, idempotente e bloquear segunda chave");

    const mcpExpense = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_expense", arguments: { ...baseMeta, description: "MCP corrected expense", accountId: checkingId, amountMinor: "7000", paymentMethod: "pix", allocations: [{ categoryId: expenseCat, amountMinor: "7000" }], idempotencyKey: randomUUID() } }), "MCP create expense for correction"), "MCP create expense for correction");
    const mcpCorrection = mcpResultJson(await bounded(mcpClient.callTool({ name: "correct_transaction", arguments: { transactionId: mcpExpense.value.id, reason: "MCP category correction", metadata: { description: "Corrected MCP expense" }, allocations: [{ categoryId: revisedExpenseCat, amountMinor: "7000" }], actor: "forged", source: "manual", idempotencyKey: randomUUID() } }), "MCP correct transaction"), "MCP correct transaction");
    check(mcpCorrection.value.description === "Corrected MCP expense" && mcpCorrection.value.allocations[0]?.categoryId === revisedExpenseCat && mcpCorrection.value.revisions[0]?.actor === "hermes" && mcpCorrection.value.revisions[0]?.source === "hermes", "MCP correção deve expor revisão efetiva e autoria/origem server-side");

    const summaryBeforeReplacement = await fetch(`${base}/api/v1/reports/summary?from=${date}&to=2026-12-31`, { headers: bearerHeaders }).then(r => json(r, "summary before replacement")).then(v => monthlySummaryResponseSchema.parse(v).data);
    const originalIncome = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_income", arguments: { ...baseMeta, description: "Income to replace", accountId: checkingId, amountMinor: "10000", categoryId: incomeCat, idempotencyKey: randomUUID() } }), "MCP create income for replacement"), "MCP create income for replacement");
    const replacementInput = { kind: "income", ...baseMeta, description: "Replacement income", accountId: checkingId, amountMinor: "8000", categoryId: incomeCat };
    const replacementKey = randomUUID();
    const reversalRaw = mcpResultJson(await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: originalIncome.value.id, occurredOn: "2026-10-27", reason: "Correct original income", replacement: replacementInput, idempotencyKey: replacementKey } }), "MCP reverse with replacement"), "MCP reverse with replacement");
    const reversal = transactionReversedResponseSchema.parse({ ok: true, data: reversalRaw }).data;
    check(reversal.value.reversal.kind === "adjustment" && reversal.value.reversal.reversalOfTransactionId === originalIncome.value.id && reversal.value.replacement?.description === "Replacement income", "reversão/substituição deve manter vínculos e o novo histórico");
    const duplicateReversal = await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: originalIncome.value.id, occurredOn: "2026-10-27", reason: "Duplicate reverse", idempotencyKey: randomUUID() } }), "MCP duplicate reversal");
    check(duplicateReversal.isError === true && /CONFLICT/.test(safeMessage(duplicateReversal.content?.find((part: any) => part.type === "text")?.text)), "transação já revertida deve rejeitar segunda reversão");
    const summaryAfterReplacement = await fetch(`${base}/api/v1/reports/summary?from=${date}&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => monthlySummaryResponseSchema.parse(v).data);
    check(BigInt(summaryAfterReplacement.incomeMinorByCurrency.BRL ?? "0") - BigInt(summaryBeforeReplacement.incomeMinorByCurrency.BRL ?? "0") === 8000n, "relatório deve contar apenas valor da substituição e omitir receita revertida");
    const correctedHistory = await fetch(`${base}/api/v1/transactions?from=${date}&to=2026-12-31`, { headers: bearerHeaders }).then(r => r.json()).then(v => transactionsResponseSchema.parse(v).data);
    check(correctedHistory.find(item => item.id === originalIncome.value.id)?.reversedByTransactionIds.length === 1 && correctedHistory.some(item => item.id === reversal.value.reversal.id && item.reversalOfTransactionId === originalIncome.value.id), "histórico deve expor vínculo da reversão em ambos os lados");

    const refundedExpense = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_expense", arguments: { ...baseMeta, description: "Expense that is refunded", accountId: checkingId, amountMinor: "3000", paymentMethod: "debit", allocations: [{ categoryId: expenseCat, amountMinor: "3000" }], idempotencyKey: randomUUID() } }), "MCP create refundable expense"), "MCP create refundable expense");
    await bounded(mcpClient.callTool({ name: "create_refund", arguments: { ...baseMeta, description: "Refunded expense", originalTransactionId: refundedExpense.value.id, accountId: checkingId, amountMinor: "500", idempotencyKey: randomUUID() } }), "MCP refund expense");
    const reverseRefunded = await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: refundedExpense.value.id, occurredOn: "2026-10-27", reason: "Cannot reverse refunded transaction", idempotencyKey: randomUUID() } }), "MCP reverse refunded expense");
    check(reverseRefunded.isError === true && /CONFLICT/.test(safeMessage(reverseRefunded.content?.find((part: any) => part.type === "text")?.text)), "despesa reembolsada deve rejeitar reversão");
    const reclassifyRefunded = await bounded(mcpClient.callTool({ name: "correct_transaction", arguments: { transactionId: refundedExpense.value.id, reason: "Cannot reclassify after refund", metadata: {}, allocations: [{ categoryId: revisedExpenseCat, amountMinor: "3000" }], idempotencyKey: randomUUID() } }), "MCP reclassify refunded expense");
    check(reclassifyRefunded.isError === true && /CONFLICT/.test(safeMessage(reclassifyRefunded.content?.find((part: any) => part.type === "text")?.text)), "despesa reembolsada deve rejeitar reclassificação incompatível");
    const mcpExpenseRefund = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_refund", arguments: { ...baseMeta, description: "Refund corrected MCP expense", originalTransactionId: mcpExpense.value.id, accountId: checkingId, amountMinor: "500", idempotencyKey: randomUUID() } }), "MCP refund corrected expense"), "MCP refund corrected expense");
    check(mcpExpenseRefund.value.allocations[0]?.categoryId === revisedExpenseCat, "MCP estorno deve seguir alocação corrigida mais recente");
    const reverseRefundable = await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: mcpExpense.value.id, occurredOn: "2026-10-27", reason: "Reverse corrected expense", idempotencyKey: randomUUID() } }), "MCP reverse corrected expense");
    check(reverseRefundable.isError === true && /CONFLICT/.test(safeMessage(reverseRefundable.content?.find((part: any) => part.type === "text")?.text)), "despesa com reembolso não deve ser revertida");
    const refundReversed = await bounded(mcpClient.callTool({ name: "create_refund", arguments: { ...baseMeta, originalTransactionId: reversal.value.reversal.id, accountId: checkingId, amountMinor: "1", idempotencyKey: randomUUID() } }), "MCP refund adjustment");
    check(refundReversed.isError === true, "reversão não pode receber reembolso duplicado");
    const reverseCard = await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: purchase.value.transaction.id, occurredOn: "2026-10-27", reason: "Card purchase is not reversibly generic", idempotencyKey: randomUUID() } }), "MCP reverse card purchase");
    check(reverseCard.isError === true && /CONFLICT/.test(safeMessage(reverseCard.content?.find((part: any) => part.type === "text")?.text)), "compra de cartão deve rejeitar reversão genérica");
    const reversePayment = await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: partialPayment.data.value.transaction.id, occurredOn: "2026-10-27", reason: "Statement payment is not reversible", idempotencyKey: randomUUID() } }), "MCP reverse statement payment");
    check(reversePayment.isError === true && /CONFLICT/.test(safeMessage(reversePayment.content?.find((part: any) => part.type === "text")?.text)), "pagamento de fatura deve rejeitar reversão genérica");
    const expenseToReverse = mcpResultJson(await bounded(mcpClient.callTool({ name: "create_expense", arguments: { ...baseMeta, description: "Expense to reverse", accountId: checkingId, amountMinor: "2000", paymentMethod: "pix", allocations: [{ categoryId: expenseCat, amountMinor: "2000" }], idempotencyKey: randomUUID() } }), "MCP create expense to reverse"), "MCP create expense to reverse");
    const reversePlainExpense = mcpResultJson(await bounded(mcpClient.callTool({ name: "reverse_transaction", arguments: { transactionId: expenseToReverse.value.id, occurredOn: "2026-10-27", reason: "Reverse plain expense", idempotencyKey: randomUUID() } }), "MCP reverse plain expense"), "MCP reverse plain expense");
    const refundReversedExpense = await bounded(mcpClient.callTool({ name: "create_refund", arguments: { ...baseMeta, originalTransactionId: expenseToReverse.value.id, accountId: checkingId, amountMinor: "1", idempotencyKey: randomUUID() } }), "MCP refund reversed expense");
    check(reversePlainExpense.value.reversal.reversalOfTransactionId === expenseToReverse.value.id && refundReversedExpense.isError === true, "despesa revertida deve manter vínculo e recusar estorno adicional");

    assert.equal((await fetch(`http://127.0.0.1:${mcpPort}/healthz`)).status, 200);
    const mcpUnauthorized = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "integration", version: "1" } } }) });
    assert.equal(mcpUnauthorized.status, 401);
    const mcpInvalidBearer = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, { method: "POST", headers: { authorization: "Bearer invalid-token", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "integration", version: "1" } } }) });
    check(mcpInvalidBearer.status === 401, `MCP deve rejeitar bearer inválido com 401, recebeu ${mcpInvalidBearer.status}`);
    const mcpAuth = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, { method: "POST", headers: { authorization: `Bearer ${hermesToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "integration", version: "1" } } }) });
    assert.equal(mcpAuth.status, 200, "Hermes bearer must authenticate independently");
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`Integração ${mode}: PASS (PostgreSQL real + migration + web + MCP; nenhuma credencial exibida)`);
  } finally { await cleanup(); }
}

process.once("SIGINT", () => {
  process.exitCode = 130;
  if (activeCleanup) void activeCleanup().finally(() => process.exit(130));
  else process.exit(130);
});

main().catch(error => { console.error(`Integração ${mode}: FAIL — ${error instanceof Error ? error.message : "erro inesperado"}`); process.exitCode = 1; });

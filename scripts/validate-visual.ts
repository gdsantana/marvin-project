import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BrowserContext, Page, Route } from "playwright";

const help = `Validação visual P1–P5 com API integralmente interceptada.
Pré-requisitos: servidor Next.js isolado já iniciado, sem banco pessoal nem secrets reais;
o servidor inicia um scheduler financeiro, portanto use somente ambiente descartável.
Playwright externo e Chromium compatível devem estar instalados; nenhuma dependência é adicionada.
Execução na raiz:
VISUAL_ISOLATED=1 PLAYWRIGHT_MODULE=/caminho/node_modules/playwright/package.json CHROMIUM_EXECUTABLE=/usr/bin/chromium VISUAL_BASE_URL=http://127.0.0.1:3000 pnpm --filter @finance/web exec tsx ../../scripts/validate-visual.ts
--help não abre navegador nem acessa servidor. --self-check verifica somente fixtures.
VISUAL_ISOLATED=1 é obrigatório para execução de navegador.
Evidências sintéticas são gravadas em diretório temporário informado ao terminar.
O roteiro não inicia servidor, PostgreSQL, migrations ou testes financeiros.
Falhas são agregadas por cenário e retornam exit code 1.
Inspeção visual, contraste WCAG e leitor de tela continuam manuais.`;

const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const accounts = [
  { id: ids[0], name: "Conta sintética BRL", type: "checking", currency: "BRL", balanceMinor: "900719925474099301" },
  { id: ids[1], name: "Conta sintética BRL secundária", type: "checking", currency: "BRL", balanceMinor: "23456" },
  { id: ids[2], name: "Cartão sintético", type: "credit_card", currency: "BRL", balanceMinor: "-10001", availableCreditMinor: "89999" },
  { id: ids[9], name: "Reserva sintética BRL", type: "savings", currency: "BRL", balanceMinor: "1100" },
];
const entry = (accountIndex: number, amountMinor: string) => ({ accountId: accounts[accountIndex]!.id, accountName: accounts[accountIndex]!.name, accountType: accounts[accountIndex]!.type, amountMinor, currency: accounts[accountIndex]!.currency });
const transactions = [
  { id: ids[3], kind: "income", description: "Receita sintética", occurredOn: "2026-10-10", reviewStatus: "confirmed", canReverse: true, entries: [entry(0, "12345")] },
  { id: ids[4], kind: "expense", description: "Despesa sintética com descrição extensa " + "contexto ".repeat(16), occurredOn: "2026-10-11", paymentMethod: "pix", reviewStatus: "confirmed", canReverse: true, entries: [entry(0, "-6789")], allocations: [{ categoryId: ids[7], categoryName: "Categoria sintética", amountMinor: "-6789" }] },
  { id: ids[5], kind: "transfer", description: "Transferência própria sintética", occurredOn: "2026-10-12", reviewStatus: "confirmed", canReverse: true, entries: [entry(0, "-1100"), entry(3, "1100")] },
  { id: ids[6], kind: "transfer", description: "Pagamento de fatura sintético", occurredOn: "2026-10-13", reviewStatus: "confirmed", canReverse: false, entries: [entry(0, "-2200"), entry(2, "2200")] },
];
const fixtures: Record<string, unknown> = {
  "/api/v1/accounts": accounts,
  "/api/v1/reports/categories": [{ currency: "BRL", categoryId: ids[7], categoryName: "Categoria sintética", incomeMinor: "0", expenseMinor: "6789", netMinor: "-6789" }],
  "/api/v1/categories": [{ id: ids[7], name: "Categoria sintética", type: "expense", isArchived: false }],
  "/api/v1/transactions": [...transactions, { ...transactions[1], id: "cancelled-original", description: "Lançamento cancelado sintético", reversedByTransactionIds: ["cancelled-reversal"], canReverse: false }, { ...transactions[1], id: "cancelled-reversal", description: "Compensação sintética", kind: "adjustment", reversalOfTransactionId: "cancelled-original", canReverse: false }],
  "/api/v1/institutions": [{ id: ids[8], name: "Instituição sintética" }],
  "/api/v1/statements": ["open", "partially_paid"].map((status, i) => ({ id: `10000000-0000-4000-8000-00000000000${i}`, cardAccountId: ids[2], cardAccountName: "Cartão sintético", currency: "BRL", dueOn: "2026-11-10", status, remainingMinor: "10001", items: [] })),
  "/api/v1/expense-forecasts": [{ id: "20000000-0000-4000-8000-000000000000", accountId: ids[0], expectedOn: "2026-11-01", amountMinor: "3333", categoryId: ids[7], description: "Previsão sintética", currency: "BRL", status: "projected", realizedTransactionId: null, createdAt: "2026-10-01T12:00:00Z" }],
  "/api/v1/cards/settings": { accountId: ids[2], creditLimitMinor: "100000", closingDay: 25, dueDay: 10, billingTimezone: "America/Sao_Paulo", billingMode: "manual" },
};
const summary = (url: URL, income = "12345") => ({ from: url.searchParams.get("from"), to: url.searchParams.get("to"), balancesByCurrency: { BRL: "900719925474099301" }, incomeMinorByCurrency: { BRL: income }, expenseMinorByCurrency: { BRL: "6789" } });
const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data }) });
type WriteAttempt = { path: string; body: Record<string, unknown>; key: string | undefined; csrf: string | undefined };
type State = { authenticated: boolean; empty: boolean; failReport: boolean; writes: WriteAttempt[]; previews: Record<string, unknown>[]; unexpected: string[]; reportHook?: (route: Route, url: URL) => Promise<void> };

async function intercept(context: BrowserContext): Promise<State> {
  const state: State = { authenticated: true, empty: false, failReport: false, writes: [], previews: [], unexpected: [] };
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(process.env.VISUAL_BASE_URL!).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") {
      if (request.method() === "DELETE") state.authenticated = false;
      return json(route, { authenticated: state.authenticated, csrfToken: "synthetic-csrf" });
    }
    if (url.pathname === "/api/auth/login") {
      state.authenticated = true;
      return json(route, { authenticated: true });
    }
    if (request.method() === "GET" && ["/api/v1/reports/summary", "/api/v1/reports/monthly-series"].includes(url.pathname)) {
      if (state.reportHook && url.pathname.endsWith("/summary")) return state.reportHook(route, url);
      if (state.failReport) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Não foi possível carregar os dados. Tente novamente." } }) });
      const data = state.empty ? { ...summary(url), balancesByCurrency: {}, incomeMinorByCurrency: {}, expenseMinorByCurrency: {} } : summary(url);
      return json(route, url.pathname.endsWith("/monthly-series") ? [data] : data);
    }
    if (request.method() === "GET" && url.pathname in fixtures) return json(route, state.empty ? [] : fixtures[url.pathname]);
    if (request.method() === "POST" && url.pathname === "/api/v1/transactions/preview") {
      const body = request.postDataJSON();
      state.previews.push(body);
      assert.equal(request.headers()["x-csrf-token"], "synthetic-csrf");
      return json(route, { entries: [{ accountId: ids[0], amountMinor: body.amountMinor }], allocations: [] });
    }
    if (request.method() === "POST" && url.pathname === "/api/v1/transactions/income") {
      state.writes.push({ path: url.pathname, body: request.postDataJSON(), key: request.headers()["idempotency-key"], csrf: request.headers()["x-csrf-token"] });
      if (state.writes.length === 1) return route.abort("connectionreset");
      return json(route, { transactionId: ids[3] });
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ error: { message: "Fixture ausente" } }) });
  });
  return state;
}

async function visibleText(page: Page, text: string) {
  await page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor({ state: "visible" });
}

async function noOverflow(page: Page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Rolagem horizontal na página");
}

async function appearance(page: Page) {
  const result = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return { dark: document.documentElement.classList.contains("dark"), scheme: root.colorScheme, missing: ["background", "foreground", "card", "card-foreground", "primary", "primary-foreground", "muted", "muted-foreground", "border", "input", "ring"].filter(token => !root.getPropertyValue(`--${token}`).trim()) };
  });
  assert(result.dark, "P1: raiz sem .dark");
  assert.equal(result.scheme, "dark", "P1: color-scheme");
  assert.deepEqual(result.missing, [], "P1: papéis semânticos ausentes");
  assert.equal(await page.getByRole("button", { name: /tema|aparência/i }).count(), 0);
}

async function controls(page: Page) {
  for (const role of ["button", "link", "textbox", "combobox", "spinbutton"] as const) {
    for (const control of await page.getByRole(role).all()) {
      if (await control.isVisible()) assert((await control.ariaSnapshot()).match(/^- \w+ "[^"\n]+"/), `P4: ${role} sem nome acessível`);
    }
  }
  const excessiveMotion = await page.evaluate(() => [...document.querySelectorAll("*")].filter(element => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration].some(value => value.split(",").some(duration => parseFloat(duration) > 0.01));
  }).length);
  assert.equal(excessiveMotion, 0, "P4: movimento não reduzido");
  await noOverflow(page);
}

async function dialogCheck(page: Page, title: string, screenshotPath: string) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement), null, { timeout: 1000 });
  assert(await dialog.evaluate(element => element.contains(document.activeElement)), "P4: foco inicial fora do diálogo");
  const box = await dialog.boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= page.viewportSize()!.width + 1 && box.y + box.height <= page.viewportSize()!.height + 1, "P4: diálogo fora da viewport");
  const focusable = dialog.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
  await focusable.last().focus();
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement), null, { timeout: 1000 });
  assert(await dialog.evaluate(element => element.contains(document.activeElement)), `P4: Tab saiu do diálogo ${title}: ${await page.evaluate(() => document.activeElement?.outerHTML)}`);
  assert(await page.evaluate(() => {
    const element = document.activeElement;
    if (!element?.matches(":focus-visible")) return false;
    const style = getComputedStyle(element);
    return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
  }), "P4: foco de teclado sem indicador visível");
  await focusable.first().focus();
  await page.keyboard.press("Shift+Tab");
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement), null, { timeout: 1000 });
  assert(await dialog.evaluate(element => element.contains(document.activeElement)), `P4: Shift+Tab saiu do diálogo ${title}: ${await page.evaluate(() => document.activeElement?.outerHTML)}`);
  await controls(page);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await appearance(page);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert(await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.isConnected), "P4: foco não restaurado");
}

async function main() {
  if (process.argv.includes("--help")) { console.log(help); return; }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(transactions.filter(transaction => transaction.kind === "transfer").length, 2);
  assert.equal(BigInt(accounts[0]!.balanceMinor).toString(), "900719925474099301");
  for (const transaction of transactions.filter(transaction => transaction.kind === "transfer")) {
    assert.equal(transaction.entries.reduce((total, item) => total + BigInt(item.amountMinor), 0n), 0n);
    assert.equal(new Set(transaction.entries.map(item => item.currency)).size, 1);
  }
  if (process.argv.includes("--self-check")) { console.log("Fixtures: OK; navegador e aplicação não executados."); return; }
  assert.equal(process.env.VISUAL_ISOLATED, "1", help);
  assert(process.env.PLAYWRIGHT_MODULE && process.env.VISUAL_BASE_URL, help);
  const base = new URL(process.env.VISUAL_BASE_URL);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) && base.protocol === "http:" && base.pathname === "/" && !base.username && !base.password && !base.search && !base.hash, "Use origem HTTP local de ambiente descartável");
  const { chromium } = createRequire(resolve(process.env.PLAYWRIGHT_MODULE))("playwright") as typeof import("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  const output = await mkdtemp(join(tmpdir(), "marvin-visual-"));
  const results: { scenario: string; passed: boolean; error?: string }[] = [];
  const routes = ["/", "/accounts", "/cards", "/entries", "/statements", "/reports"];
  if (process.argv.includes("--audit")) {
    try {
      for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark", timezoneId: "America/Sao_Paulo", locale: "pt-BR", reducedMotion: "reduce" });
        const state = await intercept(context);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        for (const route of routes) {
          await page.goto(`${base.origin}${route}`);
          await page.locator("#main-content").waitFor();
          await visibleText(page, route === "/reports" ? "BRL 123,45" : route === "/entries" ? "Receita sintética" : route === "/cards" || route === "/statements" ? "Cartão sintético" : route === "/accounts" ? "Conta sintética BRL" : "BRL 9.007.199.254.740.993,01");
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}: rolagem horizontal`);
          await page.screenshot({ path: join(output, `${viewport.width}-audit-${route.slice(1) || "overview"}.png`), fullPage: true });
          if (route === "/entries") {
            const toggle = page.getByLabel("Mostrar cancelados");
            assert.equal(await page.getByText("Lançamento cancelado sintético", { exact: true }).count(), 0);
            await toggle.check(); assert(await toggle.isChecked());
            await page.getByText("Lançamento cancelado sintético", { exact: true }).filter({ visible: true }).first().waitFor();
            await toggle.uncheck();
            assert.equal(await page.getByText("Lançamento cancelado sintético", { exact: true }).count(), 0);
            await page.getByLabel("De", { exact: true }).fill("2025-01-01");
            await Promise.all([page.waitForResponse(response => response.url().includes("/expense-forecasts?") && response.url().includes("to=2025-12-31")), page.getByLabel("Até", { exact: true }).fill("2025-12-31")]);
            const cancel = page.getByRole("button", { name: "Cancelar lançamento", exact: true }).first();
            await page.locator("#transaction-" + ids[3] + " summary:visible").click();
            await cancel.click();
            await page.getByRole("dialog").waitFor();
            await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
          }
          results.push({ scenario: `${viewport.width}-audit-${route}`, passed: true });
        }
        if (viewport.width < 768) {
          await page.getByRole("button", { name: "Mais opções", exact: true }).click();
          await page.getByRole("navigation", { name: "Mais opções", exact: true }).getByRole("link", { name: "Contas", exact: true }).click();
          await page.waitForURL(`${base.origin}/accounts`);
        } else {
          await page.getByRole("combobox", { name: "Criar novo registro" }).selectOption("account");
          await page.getByRole("dialog").waitFor();
          assert.equal(await page.locator('input[name="currency"]').inputValue(), "BRL");
          assert.equal(await page.getByRole("combobox", { name: "Moeda", exact: true }).count(), 0);
        }
        assert.deepEqual(state.unexpected, []); assert.deepEqual(errors, []);
        await context.close();
      }
      await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
      console.log(`PASS: ${results.length} telas mobile/desktop; evidências em ${output}`);
    } finally { await browser.close(); }
    return;
  }

  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      for (const colorScheme of ["light", "dark"] as const) {
        async function scenario(name: string, run: (page: Page, state: State) => Promise<void>) {
          const label = `${viewport.width}-${colorScheme}-${name}`;
          const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "reduce", locale: "pt-BR", timezoneId: "America/Sao_Paulo", serviceWorkers: "block" });
          const state = await intercept(context);
          const page = await context.newPage();
          page.setDefaultTimeout(7000);
          const errors: string[] = [];
          page.on("pageerror", () => errors.push("Erro JavaScript na página"));
          try {
            await run(page, state);
            assert.deepEqual(state.unexpected, [], "Requisições sem fixture");
            assert.deepEqual(errors, [], "Erros de execução");
            results.push({ scenario: label, passed: true });
          } catch (error) {
            results.push({ scenario: label, passed: false, error: error instanceof Error ? error.message : "Falha desconhecida" });
          } finally {
            await page.screenshot({ path: join(output, `${label}.png`), fullPage: true }).catch(() => undefined);
            await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
            const result = results.at(-1);
            if (result) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.scenario}${result.error ? `: ${result.error}` : ""}`);
            await context.close();
          }
        }
        for (const route of ["/login", ...routes]) await scenario(`P1-P4-${route === "/" ? "overview" : route.slice(1)}`, async page => {
          await page.goto(`${base.origin}${route}`);
          if (route === "/login") await page.getByLabel("Senha", { exact: true }).waitFor();
          else {
            await page.getByRole("combobox", { name: "Criar novo registro" }).waitFor();
            await visibleText(page, route === "/reports" ? "BRL 123,45" : route === "/entries" ? "Receita sintética" : route === "/cards" || route === "/statements" ? "Cartão sintético" : route === "/accounts" ? "Conta sintética BRL" : "BRL 9.007.199.254.740.993,01");
            for (const destination of routes) {
              const link = page.locator(`nav a[href="${destination}"]:visible`).first();
              await link.waitFor();
              if (destination === route) assert.equal(await link.getAttribute("aria-current"), "page");
            }
          }
          await controls(page);
          await appearance(page);
        });
        await scenario("P4-navigation", async page => {
          await page.goto(base.origin);
          for (const destination of [...routes.slice(1), "/"]) {
            const link = page.locator(`nav a[href="${destination}"]:visible`).first();
            await link.focus();
            await page.keyboard.press("Enter");
            await page.waitForURL(`${base.origin}${destination}`);
            await page.getByRole("combobox", { name: "Criar novo registro" }).waitFor();
            assert.equal(await page.locator(`nav a[href="${destination}"]:visible`).first().getAttribute("aria-current"), "page");
            await controls(page);
            await appearance(page);
          }
        });
        await scenario("P4-dialogs", async page => {
          await page.goto(`${base.origin}/entries`);
          await visibleText(page, "Receita sintética");
          const trigger = page.getByRole("combobox", { name: "Criar novo registro" });
          const options = await trigger.locator("option").evaluateAll(elements => elements.filter((element): element is HTMLOptionElement => element instanceof HTMLOptionElement && !!element.value).map(element => ({ value: element.value, title: element.textContent! })));
          assert.equal(options.length, 13, "P4: inventário de ações mudou");
          for (const option of options) { await trigger.selectOption(option.value); await dialogCheck(page, option.title, join(output, `${viewport.width}-${colorScheme}-dialog-${option.value}.png`)); }
          await page.locator(`#transaction-${ids[3]} summary`).click();
          for (const [button, title] of [["Corrigir dados ou categoria", "Corrigir lançamento"], ["Reverter lançamento", "Reverter lançamento"], ["Realizar", "Realizar previsão"], ["Cancelar", "Cancelar previsão"]]) {
            await page.getByRole("button", { name: button, exact: true }).first().click();
            await dialogCheck(page, title!, join(output, `${viewport.width}-${colorScheme}-dialog-${title!.normalize("NFD").replace(/[^a-zA-Z]/g, "")}.png`));
          }
        });
        await scenario("P2-out-of-order", async (page, state) => {
          await page.goto(`${base.origin}/reports`);
          await visibleText(page, "BRL 123,45");
          let held: Route | undefined;
          let markHeld!: () => void;
          const requested = new Promise<void>(resolve => { markHeld = resolve; });
          state.reportHook = async (route, url) => {
            if (Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!) > 60 * 86400000) return json(route, summary(url, "22222"));
            held = route;
            markHeld();
          };
          const period = page.getByRole("combobox", { name: "Período do relatório" });
          await period.selectOption("last-month");
          await Promise.race([requested, new Promise((_, reject) => setTimeout(() => reject(new Error("P2: consulta não observada")), 7000))]);
          await period.selectOption("year");
          await visibleText(page, "BRL 222,22");
          assert(held);
          await json(held, summary(new URL(held.request().url()), "11111")).catch(error => {
            assert(/closed|handled|canceled|cancelled|aborted/i.test(String(error)), "P2: erro inesperado ao liberar resposta antiga");
          });
          await page.waitForTimeout(300);
          assert.equal(await period.inputValue(), "year");
          await visibleText(page, "BRL 222,22");
          assert.equal(await page.getByText("BRL 111,11", { exact: true }).count(), 0, "P2: resposta obsoleta exibida");
        });
        await scenario("P2-card-settings", async page => {
          const secondCard = { ...accounts[2], id: "30000000-0000-4000-8000-000000000000", name: "Segundo cartão sintético" };
          let held: Route | undefined;
          let markRequested!: () => void;
          const requested = new Promise<void>(resolve => { markRequested = resolve; });
          await page.route("**/api/v1/accounts", route => json(route, [...accounts, secondCard]));
          await page.route("**/api/v1/cards/settings?*", route => {
            if (new URL(route.request().url()).searchParams.get("accountId") === ids[2]) {
              held = route; markRequested(); return;
            }
            return json(route, { accountId: secondCard.id, creditLimitMinor: "20000", closingDay: 12, dueDay: 22, billingTimezone: "America/Sao_Paulo", billingMode: "manual" });
          });
          await page.goto(`${base.origin}/cards`);
          await page.getByRole("combobox", { name: "Criar novo registro" }).selectOption("configureCard");
          const dialog = page.getByRole("dialog", { name: "Configurar cartão", exact: true });
          await Promise.race([requested, new Promise((_, reject) => setTimeout(() => reject(new Error("Configuração inicial não solicitada")), 7000))]);
          assert(await dialog.getByRole("button", { name: "Configurar cartão", exact: true }).isDisabled());
          await dialog.getByLabel("Cartão", { exact: true }).selectOption(secondCard.id);
          await page.waitForFunction(() => (document.querySelector('input[name="creditLimitMinor"]') as HTMLInputElement | null)?.value === "200,00");
          assert(await dialog.getByRole("button", { name: "Configurar cartão", exact: true }).isEnabled());
          assert(held);
          await json(held, fixtures["/api/v1/cards/settings"]).catch(() => undefined);
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          assert.equal(await dialog.getByLabel("Cartão", { exact: true }).inputValue(), secondCard.id);
          assert.equal(await dialog.getByLabel("Limite (moeda do cartão)", { exact: true }).inputValue(), "200,00");
          assert.equal(await dialog.getByLabel("Dia de vencimento", { exact: true }).inputValue(), "22");
        });
        await scenario("P3-preview-retry", async (page, state) => {
          await page.goto(`${base.origin}/entries`);
          await visibleText(page, "Receita sintética");
          await page.getByRole("combobox", { name: "Criar novo registro" }).selectOption("income");
          const dialog = page.getByRole("dialog", { name: "Registrar receita", exact: true });
          await dialog.getByLabel("Valor (R$)", { exact: true }).fill("123,45");
          await dialog.getByLabel("Descrição", { exact: true }).fill("Receita mockada");
          await dialog.getByRole("button", { name: "Revisar operação", exact: true }).click();
          await dialog.getByRole("button", { name: "Confirmar e salvar", exact: true }).waitFor();
          assert.equal(state.previews.length, 1);
          assert.equal(state.writes.length, 0);
          await dialog.getByLabel("Descrição", { exact: true }).fill("Receita mockada revisada");
          await dialog.getByRole("button", { name: "Revisar operação", exact: true }).waitFor();
          assert.equal(await dialog.getByText("Revise antes de gravar", { exact: true }).count(), 0);
          await dialog.getByRole("button", { name: "Revisar operação", exact: true }).click();
          await dialog.getByRole("button", { name: "Confirmar e salvar", exact: true }).click();
          await dialog.getByRole("alert").waitFor();
          assert.equal(await dialog.getByLabel("Descrição", { exact: true }).inputValue(), "Receita mockada revisada");
          assert.equal(state.previews.length, 2);
          assert.equal(state.writes.length, 1);
          await dialog.getByRole("button", { name: "Confirmar e salvar", exact: true }).click();
          await dialog.waitFor({ state: "hidden" });
          await visibleText(page, "Registro salvo.");
          assert.equal(state.writes.length, 2);
          assert(state.writes[0]!.key);
          assert.equal(state.writes[0]!.key, state.writes[1]!.key);
          assert.deepEqual(state.writes[0]!.body, state.writes[1]!.body);
          assert.equal(state.writes[0]!.body.amountMinor, "12345");
          assert.equal(state.writes[0]!.csrf, "synthetic-csrf");
          assert.equal(state.previews[1]!.operation, "income");
        });
        await scenario("P5-values-capabilities", async page => {
          await page.goto(base.origin);
          await visibleText(page, "BRL 9.007.199.254.740.993,01");
          for (const value of ["BRL 234,56", "BRL 123,45", "BRL 67,89"]) assert((await page.locator("body").innerText()).includes(value), `P5: valor ausente ${value}`);
          assert.equal(await page.getByText(/patrimônio líquido|sincronizar banco|análise por ia|meta de economia/i).count(), 0);
          await page.goto(`${base.origin}/entries`);
          await visibleText(page, "Transferência própria sintética");
          assert.match(await page.locator(`#transaction-${ids[5]}`).innerText(), /Transferência/);
          assert.match(await page.locator(`#transaction-${ids[6]}`).innerText(), /Transferência/);
          assert.equal(await page.getByRole("searchbox").count(), 0, "P5: busca sem suporte no contrato atual");
        });
        await scenario("P2-empty-error-retry", async (page, state) => {
          state.empty = true;
          await page.goto(`${base.origin}/reports`);
          await page.getByText(/Não há movimentações/).waitFor();
          state.empty = false;
          state.failReport = true;
          await page.reload();
          await page.getByRole("alert").filter({ hasText: "Não foi possível carregar o relatório. Tente novamente." }).waitFor();
          assert.equal(await page.getByText("BRL 0,00", { exact: true }).count(), 0);
          state.failReport = false;
          await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
          await visibleText(page, "BRL 123,45");
        });
        await scenario("P4-auth", async (page, state) => {
          state.authenticated = false;
          await page.goto(`${base.origin}/accounts`);
          await page.waitForURL(`${base.origin}/login`);
          await page.getByLabel("Senha", { exact: true }).fill("senha-sintetica");
          await page.getByRole("button", { name: "Entrar", exact: true }).click();
          await page.waitForURL(`${base.origin}/`);
          await visibleText(page, "BRL 9.007.199.254.740.993,01");
          await page.getByRole("button", { name: "Sair", exact: true }).filter({ visible: true }).first().click();
          await page.waitForURL(`${base.origin}/login`);
          assert.equal(state.authenticated, false);
        });
      }
    }
  } finally {
    await browser.close();
    await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
  }
  for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.scenario}${result.error ? `: ${result.error}` : ""}`);
  console.log(`Evidências: ${output}`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação"); process.exitCode = 1; });

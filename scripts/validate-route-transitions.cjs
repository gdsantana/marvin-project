// Run against an isolated Next server with intercepted APIs; no real database.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");

async function main() {
  assert.equal(process.env.VISUAL_ISOLATED, "1", "Use only an isolated server with no real database access.");
  assert(process.env.PLAYWRIGHT_MODULE && process.env.VISUAL_BASE_URL);
  const base = new URL(process.env.VISUAL_BASE_URL);
  assert(["127.0.0.1", "localhost"].includes(base.hostname));
  const { chromium } = createRequire(resolve(process.env.PLAYWRIGHT_MODULE))("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    for (const width of [390, 1440]) for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
      try {
        await context.addInitScript(() => {
          window.sseConnections = 0;
          window.EventSource = class extends EventTarget {
            constructor() { super(); window.sseConnections++; }
            close() {}
          };
        });
        let sessions = 0;
        await context.route("**/api/**", async route => {
          const url = new URL(route.request().url());
          let data = [];
          if (url.pathname === "/api/auth/session") { sessions++; data = { authenticated: true, csrfToken: "synthetic" }; }
          if (url.pathname === "/api/v1/accounts") data = [{ id: "00000000-0000-4000-8000-000000000001", name: "Conta sintética", type: "checking", currency: "BRL", balanceMinor: "10000" }];
          if (url.pathname === "/api/v1/transactions") {
            await new Promise(resolve => setTimeout(resolve, 450));
            data = [{ id: "synthetic", kind: "income", description: "Receita sintética", occurredOn: "2026-11-23" }];
          }
          if (url.pathname === "/api/v1/reports/summary") data = { from: "2026-11-01", to: "2026-11-30", balancesByCurrency: { BRL: "10000" }, incomeMinorByCurrency: { BRL: "10000" }, expenseMinorByCurrency: { BRL: "0" } };
          if (url.pathname === "/api/v1/reports/spending") data = { from: url.searchParams.get("from"), to: url.searchParams.get("to"), currency: "BRL", categories: [], paymentMethods: [] };
          await route.fulfill({ json: { ok: true, data } });
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base.origin}/entries`);
        await page.locator("[data-transaction-id]:visible").waitFor();
        await page.evaluate(() => {
          window.originalMain = document.querySelector("#main-content");
          window.originalNavigation = document.querySelector('nav[aria-label="Navegação principal móvel"]');
          window.removedShell = false;
          new MutationObserver(records => {
            for (const record of records) for (const node of record.removedNodes) {
              if (node === window.originalMain || node.contains?.(window.originalMain)) window.removedShell = true;
            }
          }).observe(document.body, { childList: true, subtree: true });
        });
        const nav = page.getByRole("navigation", { name: width < 768 ? "Navegação principal móvel" : "Navegação principal", exact: true });
        for (const [name, path] of [["Início", "/"], ["Relatórios", "/reports"], ["Transações", "/entries"]]) {
          await nav.getByRole("link", { name, exact: true }).click();
          await page.waitForURL(`${base.origin}${path}`);
          assert(await page.evaluate(() => !window.removedShell && document.querySelector("#main-content") === window.originalMain && document.querySelector('nav[aria-label="Navegação principal móvel"]') === window.originalNavigation));
        }
        await page.goBack(); await page.waitForURL(`${base.origin}/reports`);
        await page.goForward(); await page.waitForURL(`${base.origin}/entries`);
        await page.locator("[data-transaction-id]:visible").waitFor();
        assert.equal(sessions, 1, "Navigation must not restart authentication");
        assert.equal(await page.evaluate(() => window.sseConnections), 1, "Navigation must keep SSE connected");
        assert(await page.evaluate(() => !window.removedShell && document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        console.log(`${width}px / ${reducedMotion}: persistent shell, session, SSE, history and overflow OK`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

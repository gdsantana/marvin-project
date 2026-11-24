// Compare loading and loaded geometry with independently delayed synthetic APIs.
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");

async function main() {
  assert.equal(process.env.VISUAL_ISOLATED, "1", "Use an isolated server without real database access.");
  assert(process.env.PLAYWRIGHT_MODULE && process.env.VISUAL_BASE_URL);
  const base = new URL(process.env.VISUAL_BASE_URL);
  assert(["localhost", "127.0.0.1"].includes(base.hostname));
  const { chromium } = createRequire(resolve(process.env.PLAYWRIGHT_MODULE))("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
  const accountId = "00000000-0000-4000-8000-000000000001";
  const failures = [];
  try {
    for (const width of [390, 1440]) for (const path of ["/", "/reports", "/entries", "/accounts", "/cards", "/statements", "/new", "/settings", `/accounts/${accountId}`]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const releases = {};
      const gates = Object.fromEntries(["references", "summary", "analytics", "spending"].map(key => [key, new Promise(resolve => { releases[key] = resolve; })]));
      try {
        await context.addInitScript(() => { window.EventSource = class extends EventTarget { close() {} }; });
        const accounts = ["checking", "savings", "credit_card"].map((type, index) => ({ id: index ? `00000000-0000-4000-8000-00000000000${index + 1}` : accountId, name: `Conta ${index + 1}`, type, currency: "BRL", balanceMinor: "12345" }));
        await context.route("**/api/**", async route => {
          const url = new URL(route.request().url());
          const summary = { from: url.searchParams.get("from") ?? "2026-11-01", to: url.searchParams.get("to") ?? "2026-11-30", balancesByCurrency: { BRL: "12345" }, incomeMinorByCurrency: { BRL: "20000" }, expenseMinorByCurrency: { BRL: "7655" } };
          const categoryId = "00000000-0000-4000-8000-000000000009";
          let data = [];
          if (url.pathname === "/api/auth/session") data = { authenticated: true, csrfToken: "synthetic" };
          else {
            const group = url.pathname.endsWith("/summary") ? "summary" : /monthly-series|reports\/categories/.test(url.pathname) ? "analytics" : url.pathname.endsWith("/spending") ? "spending" : "references";
            await gates[group];
            if (url.pathname.endsWith("/accounts")) data = accounts;
            if (url.pathname.endsWith("/categories")) data = url.pathname.includes("/reports/") ? [{ categoryId, categoryName: "Moradia", currency: "BRL", expenseMinor: "7655", incomeMinor: "0", netMinor: "-7655" }] : [{ id: categoryId, name: "Moradia", type: "expense" }];
            if (url.pathname.endsWith("/transactions")) data = [0, 1].map(index => ({ id: `transaction-${index}`, kind: "expense", occurredOn: "2026-11-23", description: "Compra sintética", entries: [{ accountId, accountName: "Conta 1", amountMinor: "-2000", currency: "BRL" }] }));
            if (url.pathname.endsWith("/summary")) data = summary;
            if (url.pathname.endsWith("/monthly-series")) data = [{ ...summary, from: "2026-10-01", to: "2026-10-31" }, { ...summary, from: "2026-11-01", to: "2026-11-30" }];
            if (url.pathname.endsWith("/spending")) data = { categories: [{ categoryId, categoryName: "Moradia", amountMinor: "7655" }], paymentMethods: ["credit", "debit", "pix", "other"].map(method => ({ method, amountMinor: "2000" })) };
          }
          await route.fulfill({ json: { ok: true, data } });
        });
        const page = await context.newPage();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base.origin}${path}`);
        await page.locator("#main-content").waitFor();
        if (path === "/new") await page.locator(".loading-form").waitFor();
        else if (path !== "/settings") await page.getByRole("status").first().waitFor({ state: "attached" });
        // Wait for fonts and two layout frames, never for the intercepted data.
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        const geometry = () => page.evaluate(() => [...document.querySelectorAll('#main-content [data-slot="card"], #main-content h2, #main-content h3, #main-content form')].filter(element => !element.closest('[aria-label="Extrato de transações"]')).map((element, index) => ({ key: `${element.tagName}:${index}`, top: element.getBoundingClientRect().top + scrollY, width: element.getBoundingClientRect().width })));
        const initial = await geometry();
        if (["/", "/reports", "/new"].includes(path)) await page.screenshot({ path: `/tmp/marvin-loading-${width}-${path.slice(1) || "overview"}.png`, fullPage: true });
        assert(initial.length > 0, `${path}: no reserved component layout`);
        for (const stage of ["references", "summary", "analytics", "spending"]) {
          releases[stage]();
          await page.waitForTimeout(350);
          const next = await geometry();
          assert.equal(next.length, initial.length, `${width} ${path}: sections appear or disappear after ${stage}`);
          for (let i = 0; i < initial.length; i++) {
            assert(Math.abs(next[i].top - initial[i].top) <= 3, `${width} ${path}: ${initial[i].key} moved ${next[i].top - initial[i].top}px after ${stage}`);
            assert(Math.abs(next[i].width - initial[i].width) <= 1, `${width} ${path}: ${initial[i].key} resized after ${stage}`);
          }
        }
        await page.waitForFunction(() => document.querySelectorAll('#main-content [data-slot="skeleton"], .loading-form').length === 0);
        const final = await geometry();
        assert.equal(final.length, initial.length);
        for (let i = 0; i < initial.length; i++) assert(Math.abs(final[i].top - initial[i].top) <= 3, `${width} ${path}: final ${initial[i].key} moved`);
        if (["/", "/reports", "/new"].includes(path)) await page.screenshot({ path: `/tmp/marvin-loaded-${width}-${path.slice(1) || "overview"}.png`, fullPage: true });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        console.log(`${width}px ${path}: loading geometry stable across four response stages`);
      } catch (error) { failures.push(`${width}px ${path}: ${error.message}`); console.error(failures[failures.length - 1]); } finally { Object.values(releases).forEach(release => release()); await context.close(); }
    }
    assert.deepEqual(failures, []);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

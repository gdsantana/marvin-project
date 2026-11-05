const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { resolve, join } = require("node:path");
const { mkdtemp } = require("node:fs/promises");
const { tmpdir } = require("node:os");

(async () => {
  assert.equal(process.env.VISUAL_ISOLATED, "1", "Use somente servidor isolado sem banco pessoal.");
  const base = new URL(process.env.VISUAL_BASE_URL);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) && base.protocol === "http:");
  const { chromium } = createRequire(resolve(process.env.PLAYWRIGHT_MODULE))("playwright");
  const output = await mkdtemp(join(tmpdir(), "marvin-inline-category-evidence-"));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
      const writes = [], previews = [], errors = [];
      let failCategory = true;
      const expense = "10000000-0000-4000-8000-000000000001";
      const income = "10000000-0000-4000-8000-000000000002";
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin) return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const reply = data => route.fulfill({ json: { ok: true, data } });
        if (url.pathname === "/api/auth/session") return reply({ authenticated: true, csrfToken: "synthetic-csrf" });
        if (route.request().method() === "GET") {
          if (url.pathname.endsWith("/accounts")) return reply([{ id: "account", name: "Conta teste", type: "checking", currency: "BRL", balanceMinor: "25000" }, { id: "card", name: "Cartão teste", type: "credit_card", currency: "BRL", balanceMinor: "0" }]);
          if (url.pathname.endsWith("/categories")) return reply([{ id: expense, name: "Moradia", type: "expense", parentId: null, isArchived: false }, { id: income, name: "Salário", type: "income", parentId: null, isArchived: false }]);
          return reply([]);
        }
        const body = route.request().postDataJSON();
        if (url.pathname.endsWith("/preview")) { previews.push(body); return reply({ operation: body.operation, entries: [], allocations: body.allocations ?? [] }); }
        assert.equal(url.pathname, "/api/v1/categories", "O cadastro não deve gravar a transação");
        writes.push({ body, headers: route.request().headers() });
        if (failCategory) { failCategory = false; return route.fulfill({ status: 503, json: { ok: false, error: { message: "Falha simulada" } } }); }
        return reply({ id: `20000000-0000-4000-8000-${String(writes.length).padStart(12, "0")}` });
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(new URL("/new", base).href);
      await page.getByLabel("Valor", { exact: true }).fill("123,45");
      await page.getByLabel("Descrição", { exact: true }).fill("Aluguel de casa");
      await page.getByLabel("Conta", { exact: true }).selectOption("account");
      await page.getByLabel("Data", { exact: true }).fill("2026-11-01");
      const open = async (button = page.getByRole("button", { name: "Criar categoria", exact: true }).first()) => {
        await button.click();
        await page.getByRole("dialog", { name: "Criar categoria", exact: true }).waitFor();
        return page.getByRole("dialog", { name: "Criar categoria", exact: true });
      };
      let dialog = await open();
      assert.equal(await dialog.getByLabel("Categoria superior").locator("option").count(), 2);
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      assert.equal(writes.length, 0);
      dialog = await open();
      await dialog.getByLabel("Nome da categoria").fill("Aluguel");
      await dialog.getByLabel("Categoria superior").selectOption(expense);
      await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
      await dialog.getByRole("alert").waitFor();
      await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[1].body, { name: "Aluguel", type: "expense", parentId: expense });
      assert.equal(writes[0].headers["idempotency-key"], writes[1].headers["idempotency-key"]);
      assert.equal(writes[1].headers["x-csrf-token"], "synthetic-csrf");
      assert.equal(await page.getByLabel("Categoria", { exact: true }).locator("option:checked").textContent(), "Moradia / Aluguel");
      assert.equal(await page.getByLabel("Valor", { exact: true }).inputValue(), "123,45");
      assert.equal(await page.getByLabel("Descrição", { exact: true }).inputValue(), "Aluguel de casa");
      assert.equal(await page.getByLabel("Conta", { exact: true }).inputValue(), "account");
      assert.equal(await page.getByLabel("Data", { exact: true }).inputValue(), "2026-11-01");
      await page.getByRole("button", { name: "Revisar transação", exact: true }).click();
      await page.getByRole("button", { name: "Confirmar e salvar", exact: true }).waitFor();
      assert.equal(previews.at(-1).allocations[0].categoryId, "20000000-0000-4000-8000-000000000002");
      await page.getByRole("button", { name: "Editar dados", exact: true }).click();
      await page.getByRole("button", { name: "Receita", exact: true }).click();
      dialog = await open();
      await dialog.getByLabel("Nome da categoria").fill("Freelance");
      assert.equal(await dialog.getByLabel("Categoria superior").locator("option").count(), 2);
      await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(writes.at(-1).body, { name: "Freelance", type: "income", parentId: null });
      assert.equal(await page.getByLabel("Categoria", { exact: true }).locator("option:checked").textContent(), "Freelance");
      await page.getByRole("button", { name: "Despesa", exact: true }).click();
      await page.getByRole("button", { name: "Dividir entre categorias", exact: true }).click();
      dialog = await open();
      await dialog.getByLabel("Nome da categoria").fill("Condomínio");
      await dialog.getByLabel("Categoria superior").selectOption(expense);
      await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await page.getByLabel("Categoria 1", { exact: true }).locator("option:checked").textContent(), "Moradia / Condomínio");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(output, `${width}-split.png`), fullPage: true });
      dialog = await open();
      await page.screenshot({ path: join(output, `${width}-dialog.png`), fullPage: true });
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByRole("button", { name: "Usar uma categoria", exact: true }).click();
      const writesBeforeExisting = writes.length;
      dialog = await open();
      await dialog.getByLabel("Nome da categoria").fill(" moradia ");
      await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(writes.length, writesBeforeExisting);
      assert.equal(await page.getByLabel("Categoria", { exact: true }).inputValue(), expense);
      await page.getByLabel("Forma de pagamento").selectOption("credit");
      dialog = await open();
      await dialog.getByLabel("Nome da categoria").fill("Taxas do cartão");
      await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(writes.at(-1).body.type, "expense");
      assert.equal(await page.getByLabel("Categoria", { exact: true }).locator("option:checked").textContent(), "Taxas do cartão");
      if (width === 1440) {
        await page.goto(new URL("/entries", base).href);
        await page.getByLabel("Criar novo registro").selectOption("expense");
        const outer = page.getByRole("dialog", { name: "Nova transação", exact: true });
        await outer.getByLabel("Descrição", { exact: true }).fill("Mantida no diálogo");
        dialog = await open(outer.getByRole("button", { name: "Criar categoria", exact: true }));
        await dialog.getByLabel("Nome da categoria").fill("Nova no diálogo");
        await dialog.getByRole("button", { name: "Criar e selecionar", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await outer.getByLabel("Descrição", { exact: true }).inputValue(), "Mantida no diálogo");
        assert.equal(await outer.getByLabel("Categoria", { exact: true }).locator("option:checked").textContent(), "Nova no diálogo");
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(`Cadastro de categorias aprovado em 320, 390 e 1440 px. Evidências: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

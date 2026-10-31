import { FinanceService } from "@finance/domain";
import { createDatabase } from "./client.js";
import { cleanDevelopment, developmentDatabaseErrorMessage, developmentDatabaseUrl } from "./clean.js";
import { createFinanceRepository } from "./repositories.js";

export async function seedDevelopment(service: FinanceService, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const today = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const monthStart = (offset: number) => new Date(Date.UTC(Number(today.year), Number(today.month) - 1 + offset, 1)).toISOString().slice(0, 10);
  const openingDate = monthStart(-2);
  const categories: Record<string, string> = {};
  for (const [type, names] of [
    ["expense", ["Alimentação", "Mercado", "Transporte", "Lazer", "Esporte", "Saúde", "Moradia", "Educação", "Compras", "Serviços"]],
    ["income", ["Salário", "Rendimentos", "Outras receitas"]],
  ] as const) {
    for (const name of names) categories[name] = await service.createCategory({ name, type, parentId: null }, `dev-seed-v1-category-${type}-${name}`);
  }

  const accounts: Record<string, string> = {};
  for (const bank of ["Nubank", "Itaú"] as const) {
    const institutionId = await service.createInstitution({ name: bank }, `dev-seed-v1-institution-${bank}`);
    const common = { institutionId, currency: "BRL", openingDate };
    accounts[`${bank}-checking`] = await service.createAccount({ ...common, name: `Conta ${bank}`, type: "checking", openingBalanceMinor: 300000n }, `dev-seed-v1-account-${bank}-checking`);
    accounts[`${bank}-card`] = await service.createAccount({ ...common, name: `Cartão ${bank}`, type: "credit_card", openingBalanceMinor: 0n, cardSettings: { creditLimitMinor: 1000000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, `dev-seed-v1-account-${bank}-card`);
  }

  for (const offset of [-2, -1, 0]) {
    const month = monthStart(offset).slice(0, 7);
    const date = (day: number) => `${month}-${String(offset === 0 ? Math.min(day, Number(today.day)) : day).padStart(2, "0")}`;
    const metadata = { source: "import" as const, reviewStatus: "confirmed" as const };
    const key = (name: string) => `dev-seed-v2-${month}-${name}`;
    const variedAmount = (amount: string) => (BigInt(amount) + BigInt(offset + 2) * 1000n).toString();

    for (const [name, account, amount, category, description] of [
      ["salary", "Nubank-checking", "650000", "Salário", "Salário fictício"],
      ["income", "Itaú-checking", "85000", "Rendimentos", "Rendimento fictício"],
    ]) await service.createIncome({ ...metadata, occurredOn: date(5), description, accountId: accounts[account]!, amountMinor: variedAmount(amount!), categoryId: categories[category]! }, key(name!));

    for (const [name, account, amount, category, description, day] of [
      ["market", "Nubank-checking", "23590", "Mercado", "Compras no mercado", 7],
      ["transport", "Nubank-checking", "4800", "Transporte", "Transporte urbano", 9],
      ["health", "Itaú-checking", "18000", "Saúde", "Consulta médica", 11],
      ["housing", "Itaú-checking", "125000", "Moradia", "Aluguel fictício", 6],
    ] as const) {
      const amountMinor = variedAmount(amount);
      await service.createExpense({ ...metadata, occurredOn: date(day), description, accountId: accounts[account]!, amountMinor, paymentMethod: "pix", allocations: [{ categoryId: categories[category]!, amountMinor }] }, key(name));
    }

    for (const [name, account, amount, category, description, installments, day] of [
      ["food", "Nubank-card", "12990", "Alimentação", "Restaurante fictício", 1, 12],
      ["sports", "Nubank-card", "36001", "Esporte", "Equipamento esportivo", 3, 13],
      ["leisure", "Itaú-card", "15900", "Lazer", "Ingressos fictícios", 1, 14],
      ["shopping", "Itaú-card", "48002", "Compras", "Compra fictícia", 3, 15],
    ] as const) {
      const totalAmountMinor = variedAmount(amount);
      // Start installments in the oldest month so all three bills stay inside the sample period.
      await service.createCreditPurchase({ ...metadata, occurredOn: date(day), description, cardAccountId: accounts[account]!, totalAmountMinor, installmentCount: offset === -2 ? installments : 1, allocations: [{ categoryId: categories[category]!, amountMinor: totalAmountMinor }] }, key(name));
    }

    if (offset < 0) {
      for (const bank of ["Nubank", "Itaú"]) {
        const forecast = await service.statementForecast(`${month}-01`, `${month}-28`);
        for (const statement of forecast.BRL ?? []) {
          const detail = await service.statementDetail(statement.statementId);
          if (detail.cardAccountId !== accounts[`${bank}-card`]) continue;
          await service.closeStatement(statement.statementId, key(`${bank}-close`));
          await service.payStatement({ ...metadata, occurredOn: date(28), description: `Pagamento da fatura ${bank}`, statementId: statement.statementId, fromAccountId: accounts[`${bank}-checking`]!, amountMinor: statement.billedMinor }, key(`${bank}-payment`));
        }
      }
    }
  }
}

async function main() {
  const { db, pool } = createDatabase(developmentDatabaseUrl());
  try {
    await cleanDevelopment(db);
    await seedDevelopment(new FinanceService(createFinanceRepository(db)));
    console.log("Dados fictícios de desenvolvimento inseridos.");
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch((error: unknown) => {
  console.error(`Falha na carga. ${developmentDatabaseErrorMessage(error)} A carga pode ter sido parcialmente aplicada; execute novamente após corrigir a causa.`);
  process.exitCode = 1;
});

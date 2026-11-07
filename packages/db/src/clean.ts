import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "./client.js";

class DevelopmentDatabaseConfigError extends Error {}

export function developmentDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "production" || env.SEED_DEVELOPMENT !== "true") {
    throw new DevelopmentDatabaseConfigError("Limpeza e carga fictícia exclusivas para desenvolvimento: defina SEED_DEVELOPMENT=true e não use NODE_ENV=production.");
  }
  const databaseUrl = env.MIGRATION_DATABASE_URL ?? env.DEVELOPMENT_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) throw new DevelopmentDatabaseConfigError("Defina DATABASE_URL para o banco local de desenvolvimento.");
  let url: URL;
  try { url = new URL(databaseUrl); }
  catch { throw new DevelopmentDatabaseConfigError("DATABASE_URL inválida: informe uma URL PostgreSQL local."); }
  if (url.hostname === "db") {
    throw new DevelopmentDatabaseConfigError("DATABASE_URL usa o host db da rede Docker Compose. Execute pnpm db:up e configure DEVELOPMENT_DATABASE_URL com localhost e a porta local do PostgreSQL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new DevelopmentDatabaseConfigError("Limpeza e seed permitidos somente em PostgreSQL local: use localhost, 127.0.0.1 ou [::1].");
  }
  if ([...url.searchParams.keys()].some(key => ["host", "hostaddr", "service"].includes(key.toLowerCase()))) {
    throw new DevelopmentDatabaseConfigError("Não sobrescreva o host local nos parâmetros de DATABASE_URL.");
  }
  return databaseUrl;
}

export function developmentDatabaseErrorMessage(error: unknown): string {
  const messages: Record<string, string> = {
    ECONNREFUSED: "Conexão recusada: verifique se o PostgreSQL está ativo e se a porta local está correta.",
    ENOTFOUND: "Host do PostgreSQL não encontrado. Verifique o endereço local em DATABASE_URL.",
    EAI_AGAIN: "Não foi possível resolver o host do PostgreSQL. Verifique o endereço local em DATABASE_URL.",
    "28P01": "Autenticação recusada: verifique usuário e senha do banco de desenvolvimento.",
    "28000": "Acesso ao PostgreSQL recusado. Verifique as permissões de conexão.",
    "3D000": "Banco de desenvolvimento inexistente. Crie o banco antes de executar o comando.",
    "42P01": "Tabelas da aplicação ausentes: aplique pnpm db:migrate usando a mesma DATABASE_URL.",
    "42501": "Permissão insuficiente: o usuário do banco precisa poder limpar as tabelas da aplicação.",
  };
  let cause = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (cause instanceof DevelopmentDatabaseConfigError) return cause.message;
    const code = (cause as Error & { code?: string }).code;
    if (code && Object.hasOwn(messages, code)) return messages[code]!;
    cause = cause.cause;
  }
  return "Verifique a conexão, as permissões e as migrations do banco de desenvolvimento.";
}

export async function cleanDevelopment(db: Database, env: NodeJS.ProcessEnv = process.env) {
  developmentDatabaseUrl(env);
  // Explicit tables avoid cascading into unrelated data and preserve Drizzle's migration history.
  await db.execute(sql`TRUNCATE TABLE
    statement_payments, card_statement_items, installment_plans, card_statements,
    transaction_revisions, expense_forecasts, category_allocations, account_entries,
    transactions, credit_card_settings, accounts, categories, institutions,
    agent_requests, idempotency_claims`);
}

async function main() {
  const { db, pool } = createDatabase(developmentDatabaseUrl());
  try {
    await cleanDevelopment(db);
    console.log("Dados do banco local de desenvolvimento removidos. Migrations preservadas.");
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch((error: unknown) => {
  console.error(`Falha na limpeza. ${developmentDatabaseErrorMessage(error)}`);
  process.exitCode = 1;
});

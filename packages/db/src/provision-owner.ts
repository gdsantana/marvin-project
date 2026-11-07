import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createDatabase } from "./client.js";
import { provisionOwner } from "./auth.js";
import { sql } from "drizzle-orm";
import { ownerDatabaseUrl, OwnerProvisionError, ownerProvisionErrorMessage } from "./provision-config.js";

async function main() {
  if (!process.stdin.isTTY) throw new OwnerProvisionError("Execute em terminal interativo.");
  const { db, pool } = createDatabase(ownerDatabaseUrl(), { connectionTimeoutMillis: 5000 });
  try {
    const tables = await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('auth_users') IS NOT NULL AND to_regclass('auth_sessions') IS NOT NULL AND to_regclass('auth_login_attempts') IS NOT NULL AS ready`);
    if (!tables.rows[0]?.ready) throw new OwnerProvisionError("Tabelas de autenticação ausentes. Aplique pnpm db:migrate com DATABASE_URL apontando para o mesmo banco antes de criar a conta.");
    let hidden = false;
    const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
    const prompt = createInterface({ input: process.stdin, output, terminal: true });
    let username: string, password: string;
    try {
      username = (await prompt.question("Usuário: ")).trim().toLowerCase();
      process.stdout.write("Senha com ao menos 12 caracteres: ");
      hidden = true;
      password = await prompt.question("");
      process.stdout.write("\nConfirme a senha: ");
      const confirmation = await prompt.question("");
      process.stdout.write("\n");
      if (password !== confirmation) throw new OwnerProvisionError("As senhas não coincidem. Execute o comando novamente.");
    } finally { prompt.close(); }
    await provisionOwner(db, username, password, process.argv.includes("--reset-password"));
    console.log("Conta proprietária configurada. Entre com usuário e senha.");
  } finally { await pool.end(); }
}
main().catch((error: unknown) => {
  console.error(`Não foi possível configurar a conta. ${ownerProvisionErrorMessage(error)}`);
  process.exitCode = 1;
});

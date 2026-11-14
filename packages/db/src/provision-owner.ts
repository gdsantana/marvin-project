import { requestPassword } from "./password-prompt.js";
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
      while (true) {
        username = (await prompt.question("Usuário: ")).trim().toLowerCase();
        if (/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) break;
        process.stdout.write("Use 3 a 64 caracteres: letras, números, ponto, sublinhado ou hífen, começando por letra ou número. Tente novamente.\n");
      }
      hidden = true;
      password = await requestPassword(async (message) => {
        process.stdout.write(message);
        const answer = await prompt.question("");
        process.stdout.write("\n");
        return answer;
      }, (message) => process.stdout.write(`${message}\n`));
    } finally { prompt.close(); }
    await provisionOwner(db, username, password, process.argv.includes("--reset-password"));
    console.log("Conta proprietária configurada. Entre com usuário e senha.");
  } finally { await pool.end(); }
}
main().catch((error: unknown) => {
  console.error(`Não foi possível configurar a conta. ${ownerProvisionErrorMessage(error)}`);
  process.exitCode = 1;
});

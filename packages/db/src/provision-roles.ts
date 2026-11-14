import { requestPassword } from "./password-prompt.js";
import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { Pool } from "pg";
import { DatabaseRoleError, provisionDatabaseRoles } from "./database-roles.js";
import { parseRoleCredentials } from "./provision-config.js";

async function main() {
  const fileFlag = process.argv.indexOf("--credentials-file");
  if (fileFlag !== -1 && !process.argv[fileFlag + 1]) throw new DatabaseRoleError("Informe o caminho do arquivo temporário de credenciais.");
  if (fileFlag === -1 && !process.stdin.isTTY) throw new DatabaseRoleError("Execute em terminal interativo no host de operações.");
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new DatabaseRoleError("Configure DATABASE_ADMIN_URL no arquivo operacional .env.ops.");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await pool.query("SELECT 1");
    let passwords: string[];
    if (fileFlag !== -1) {
      const credentials = parseRoleCredentials(await readFile(process.argv[fileFlag + 1]!, "utf8"));
      passwords = [credentials.appPassword, credentials.migrationPassword];
    } else {
      let hidden = false;
      const output = new Writable({ write(chunk, encoding, done) { if (!hidden) process.stdout.write(chunk, encoding); done(); } });
      const prompt = createInterface({ input: process.stdin, output, terminal: true });
      passwords = [];
      try {
        for (const role of ["marvin_app", "marvin_migrator"]) {
          hidden = true;
          const password = await requestPassword(async (message) => {
            process.stdout.write(message);
            const answer = await prompt.question("");
            process.stdout.write("\n");
            return answer;
          }, message => process.stdout.write(`${message}\n`), password => {
            if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) return "Use 32 a 128 caracteres: letras, números, hífen ou sublinhado. Tente novamente.";
            if (passwords.includes(password)) return "Use uma senha diferente da outra role. Tente novamente.";
            return undefined;
          }, `Senha URL-safe para ${role}, 32 a 128 caracteres: `);
          passwords.push(password);
        }
      } finally { prompt.close(); }
    }
    await provisionDatabaseRoles(pool, { appPassword: passwords[0]!, migrationPassword: passwords[1]!, adoptExisting: process.argv.includes("--adopt-existing"), rotatePasswords: process.argv.includes("--rotate-passwords") });
    console.log("Roles técnicas provisionadas. Senhas de roles existentes só mudam com --rotate-passwords. Configure as conexões sem compartilhar credenciais.");
  } finally { await pool.end(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof DatabaseRoleError ? error.message : "Falha ao provisionar roles. Confira conexão administrativa, permissões e schema; nenhum detalhe privado foi exibido.");
  process.exitCode = 1;
});

import { DatabaseRoleError, requireMigrationDatabaseUrl } from "./database-roles.js";
import { migrateDatabase } from "./migrate-database.js";

async function main() {
  await migrateDatabase(requireMigrationDatabaseUrl());
  console.log("Migrations e permissões de runtime aplicadas.");
}
main().catch((error: unknown) => {
  console.error(error instanceof DatabaseRoleError ? error.message : "Falha nas migrations/permissões. Verifique conexão, roles e schema; nenhum detalhe privado foi exibido.");
  process.exitCode = 1;
});

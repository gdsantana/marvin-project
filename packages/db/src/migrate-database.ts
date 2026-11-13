import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";
import { applyRuntimeGrants, DatabaseRoleError } from "./database-roles.js";

export async function migrateDatabase(url: string) {
  const { db, pool } = createDatabase(url, { connectionTimeoutMillis: 5000 });
  try {
    if ((await pool.query("SELECT current_user AS name")).rows[0].name !== "marvin_migrator") {
      throw new DatabaseRoleError("Migrations exigem a identidade marvin_migrator; não use a conexão de runtime ou admin.");
    }
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyRuntimeGrants(client);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}

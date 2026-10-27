import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string, config: Omit<PoolConfig, "connectionString"> = {}) {
  const pool = new Pool({ ...config, connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL must be set for Drizzle commands");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
});

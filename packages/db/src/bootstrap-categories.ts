import { sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { createDatabase, type Database } from "./client.js";

export async function bootstrapCategories(db: Database) {
  return db.transaction(async tx => {
    // Serialize catalog writes because category names have no unique constraint.
    await tx.execute(sql`LOCK TABLE categories IN SHARE ROW EXCLUSIVE MODE`);
    let inserted = 0;
    for (const [type, names] of [
      ["expense", ["Alimentação", "Mercado", "Transporte", "Lazer", "Esporte", "Saúde", "Moradia", "Educação", "Compras", "Serviços"]],
      ["income", ["Salário", "Rendimentos", "Outras receitas"]],
    ] as const) {
      for (const name of names) {
        const result = await tx.execute(sql`
          INSERT INTO categories (name, type)
          SELECT ${name}, ${type}
          WHERE NOT EXISTS (
            SELECT 1 FROM categories
            WHERE lower(trim(name)) = lower(${name}) AND type = ${type} AND parent_id IS NULL
          ) RETURNING id
        `);
        inserted += result.rowCount ?? 0;
      }
    }
    return inserted;
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("missing DATABASE_URL");
  const { db, pool } = createDatabase(url);
  try {
    const inserted = await bootstrapCategories(db);
    console.log(`Categorias básicas: ${inserted} criadas.`);
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("Falha ao cadastrar categorias básicas. Verifique DATABASE_URL, conexão, permissões e migrations. Nenhuma alteração parcial foi mantida.");
  process.exitCode = 1;
});

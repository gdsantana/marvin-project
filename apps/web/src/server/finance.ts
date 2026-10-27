import { createDatabase, createFinanceRepository } from "@finance/db";
import { FinanceService } from "@finance/domain";

const globalFinance = globalThis as typeof globalThis & { marvinFinance?: FinanceService; marvinRepository?: ReturnType<typeof createFinanceRepository>; marvinPool?: { end(): Promise<void> } };

export function financeApplication() {
  if (globalFinance.marvinFinance && globalFinance.marvinRepository) return { service: globalFinance.marvinFinance, repository: globalFinance.marvinRepository };
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurado");
  const { db, pool } = createDatabase(connectionString);
  globalFinance.marvinPool = pool;
  globalFinance.marvinRepository = createFinanceRepository(db);
  globalFinance.marvinFinance = new FinanceService(globalFinance.marvinRepository);
  return { service: globalFinance.marvinFinance, repository: globalFinance.marvinRepository };
}

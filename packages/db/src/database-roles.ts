import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { escapeIdentifier, type Pool, type PoolClient } from "pg";

export class DatabaseRoleError extends Error {}
const appRole = "marvin_app";
const migrationRole = "marvin_migrator";
const managedRoleComment = "marvin-project: database role separation v1";

// Deliberately deny new tables until their runtime access is reviewed here.
const runtimeTables = {
  institutions: "SELECT, INSERT", accounts: "SELECT, INSERT", categories: "SELECT, INSERT",
  transactions: "SELECT, INSERT", account_entries: "SELECT, INSERT", category_allocations: "SELECT, INSERT",
  installment_plans: "SELECT, INSERT", card_statement_items: "SELECT, INSERT", statement_payments: "SELECT, INSERT",
  transaction_revisions: "SELECT, INSERT", credit_card_settings: "SELECT, INSERT, UPDATE",
  card_statements: "SELECT, INSERT, UPDATE", expense_forecasts: "SELECT, INSERT, UPDATE",
  idempotency_claims: "SELECT, INSERT, UPDATE", auth_users: "SELECT",
  auth_sessions: "SELECT, INSERT, DELETE", auth_login_attempts: "SELECT, INSERT, UPDATE, DELETE",
} as const;
const financialFunctions = [
  "enforce_credit_card_settings_account", "enforce_statement_card_account", "enforce_statement_payment_limits",
  "reject_financial_mutation", "enforce_statement_item_source", "validate_installment_plan",
  "check_installment_plan_trigger", "enforce_refund_limit", "enforce_expense_forecast_transition",
  "validate_expense_forecast", "enforce_revision_sequence",
];

export function requireMigrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.MIGRATION_DATABASE_URL;
  if (!value) throw new DatabaseRoleError("Configure MIGRATION_DATABASE_URL no ambiente operacional; DATABASE_URL não é fallback de migrations.");
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch { throw new DatabaseRoleError("MIGRATION_DATABASE_URL inválida. Confira a configuração sem compartilhar credenciais."); }
  return value;
}

// PostgreSQL SCRAM verifier: avoid sending a plaintext password in CREATE ROLE/logged SQL.
// URL-safe ASCII passwords avoid SASLprep normalization differences.
export function passwordVerifier(password: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(password)) throw new DatabaseRoleError("Use senhas distintas de 32 a 128 caracteres URL-safe: letras, números, hífen ou sublinhado.");
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const stored = createHash("sha256").update(createHmac("sha256", salted).update("Client Key").digest()).digest("base64");
  const server = createHmac("sha256", salted).update("Server Key").digest("base64");
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
}

async function roleIsSafe(client: PoolClient, name: string) {
  const result = await client.query(`SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS safe,
    shobj_description(oid, 'pg_authid') AS marker FROM pg_roles WHERE rolname = $1`, [name]);
  if (!result.rowCount) return false;
  const memberships = await client.query("SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1", [name]);
  if (!result.rows[0].safe || result.rows[0].marker !== managedRoleComment || memberships.rowCount) {
    throw new DatabaseRoleError("Role existente não gerenciada ou com privilégios incompatíveis. Revise explicitamente antes de provisionar.");
  }
  return true;
}

export async function applyRuntimeGrants(client: PoolClient) {
  const identity = await client.query("SELECT current_user AS name");
  if (identity.rows[0].name !== migrationRole) throw new DatabaseRoleError("Permissões de runtime devem ser aplicadas como marvin_migrator.");
  await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC, marvin_app; GRANT USAGE ON SCHEMA public TO marvin_app");
  await client.query("ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC");
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, marvin_app");
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, marvin_app");
  for (const [name, privileges] of Object.entries(runtimeTables)) {
    const table = `public.${escapeIdentifier(name)}`;
    if (!(await client.query("SELECT to_regclass($1) AS name", [table])).rows[0].name) continue;
    await client.query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC, marvin_app`);
    // Table revocation does not remove column grants from previous executions.
    const columns = await client.query("SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped", [table]);
    const columnList = columns.rows.map(row => escapeIdentifier(row.attname as string)).join(", ");
    await client.query(`REVOKE SELECT (${columnList}), INSERT (${columnList}), UPDATE (${columnList}), REFERENCES (${columnList}) ON ${table} FROM PUBLIC, marvin_app`);
    await client.query(`GRANT ${privileges} ON TABLE ${table} TO marvin_app`);
  }
  // SELECT FOR UPDATE also requires UPDATE on at least one column, even when no row changes.
  for (const name of ["accounts", "transactions", "auth_users"]) {
    if ((await client.query("SELECT to_regclass($1) AS name", [`public.${name}`])).rows[0].name) {
      await client.query(`GRANT UPDATE (id) ON public.${escapeIdentifier(name)} TO marvin_app`);
    }
  }
  const functions = await client.query(`SELECT p.oid::regprocedure::text AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`, [financialFunctions]);
  for (const row of functions.rows) {
    // Signature is rendered by PostgreSQL, not request input.
    await client.query(`REVOKE ALL ON FUNCTION ${row.signature} FROM PUBLIC, marvin_app`);
    await client.query(`GRANT EXECUTE ON FUNCTION ${row.signature} TO marvin_app`);
  }
}

export async function provisionDatabaseRoles(pool: Pool, options: { appPassword: string; migrationPassword: string; adoptExisting?: boolean; rotatePasswords?: boolean }) {
  if (options.appPassword === options.migrationPassword) throw new DatabaseRoleError("As senhas de aplicação e migrations devem ser diferentes.");
  const verifiers = { marvin_app: passwordVerifier(options.appPassword), marvin_migrator: passwordVerifier(options.migrationPassword) };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(721907124)");
    const admin = await client.query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user");
    if (!admin.rows[0]?.rolsuper) throw new DatabaseRoleError("Provisionamento exige conexão administrativa PostgreSQL; não use a conexão Web.");
    const database = (await client.query("SELECT current_database() AS name")).rows[0].name as string;
    if (["postgres", "template0", "template1"].includes(database)) throw new DatabaseRoleError("Use uma base dedicada do Marvin, não uma base de sistema PostgreSQL.");
    const owner = await client.query("SELECT r.rolname FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE d.datname = current_database()");
    if ([appRole, migrationRole].includes(owner.rows[0].rolname)) throw new DatabaseRoleError("O banco deve permanecer sob propriedade administrativa, fora das roles técnicas.");
    const relations = await client.query(`SELECT n.nspname, c.relname, c.relkind, r.rolname AS owner FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_roles r ON r.oid = c.relowner
      WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'S', 'v', 'm', 'p', 'f')`);
    for (const row of relations.rows) {
      const known = row.nspname === "public" ? row.relkind === "r" && [...Object.keys(runtimeTables), "agent_requests"].includes(row.relname) : ["__drizzle_migrations", "__drizzle_migrations_id_seq"].includes(row.relname);
      if (!known) throw new DatabaseRoleError("A base contém objetos fora do schema conhecido do Marvin. Use uma base dedicada e revise o provisionamento.");
      if (row.owner !== migrationRole && !options.adoptExisting) throw new DatabaseRoleError("Objetos existentes exigem --adopt-existing após backup e revisão de ownership.");
    }
    const functions = await client.query(`SELECT p.oid::regprocedure::text AS signature, p.proname, r.rolname AS owner FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner WHERE n.nspname = 'public'`);
    if (functions.rows.some(row => !financialFunctions.includes(row.proname) || (row.owner !== migrationRole && !options.adoptExisting))) {
      throw new DatabaseRoleError("Funções existentes exigem revisão do schema e --adopt-existing quando pertencem ao Marvin.");
    }
    for (const [name, verifier] of Object.entries(verifiers)) {
      const exists = await roleIsSafe(client, name);
      if (exists && !options.rotatePasswords) continue;
      await client.query(`${exists ? "ALTER" : "CREATE"} ROLE ${escapeIdentifier(name)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${verifier}'`);
      if (!exists) await client.query(`COMMENT ON ROLE ${escapeIdentifier(name)} IS '${managedRoleComment}'`);
    }
    await client.query(`REVOKE ALL ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC, marvin_app, marvin_migrator`);
    await client.query(`GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO marvin_app, marvin_migrator`);
    await client.query(`GRANT CREATE ON DATABASE ${escapeIdentifier(database)} TO marvin_migrator`);
    await client.query("ALTER SCHEMA public OWNER TO marvin_migrator");
    for (const row of relations.rows) {
      // The known Drizzle serial sequence follows its table's owner automatically.
      if (row.relkind !== "S") await client.query(`ALTER TABLE ${escapeIdentifier(row.nspname)}.${escapeIdentifier(row.relname)} OWNER TO marvin_migrator`);
    }
    for (const row of functions.rows) await client.query(`ALTER FUNCTION ${row.signature} OWNER TO marvin_migrator`);
    if ((await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle'")).rowCount) {
      await client.query("ALTER SCHEMA drizzle OWNER TO marvin_migrator; REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, marvin_app");
    }
    await client.query("SET LOCAL ROLE marvin_migrator");
    await applyRuntimeGrants(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

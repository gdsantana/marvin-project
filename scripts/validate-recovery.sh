#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
pg_bin_dir="${PG_BIN_DIR:-}"
pg_lib_dir="${PG_LIB_DIR:-}"
if [[ -z "$pg_bin_dir" ]]; then
  if command -v initdb >/dev/null 2>&1; then pg_bin_dir="$(dirname "$(command -v initdb)")"
  elif [[ -x /tmp/marvin-pg-runtime/usr/bin/initdb ]]; then pg_bin_dir=/tmp/marvin-pg-runtime/usr/bin
  else printf 'PostgreSQL local não encontrado. Defina PG_BIN_DIR; recovery Docker requer ferramentas de cluster locais.\n' >&2; exit 2
  fi
fi
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/marvin-recovery.XXXXXXXX")"
fixture_file="$repo_root/apps/web/.validate-recovery-$$.ts"
log_file="$temp_root/command.log"
source_port=$((40000 + ($$ % 12000)))
restore_port=$((source_port + 1))
source_started=0
restore_started=0
cleaned=0

cleanup() {
  (( cleaned )) && return
  cleaned=1
  if (( restore_started )); then "$pg_bin_dir/pg_ctl" -D "$temp_root/restore" -m fast -w stop >"$log_file" 2>&1 || true; fi
  if (( source_started )); then "$pg_bin_dir/pg_ctl" -D "$temp_root/source" -m fast -w stop >"$log_file" 2>&1 || true; fi
  rm -f -- "$fixture_file"
  rm -rf -- "$temp_root"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

run_quiet() {
  local label="$1"; shift
  if "$@" >"$log_file" 2>&1; then return 0; fi
  printf 'Falha na etapa: %s\n' "$label" >&2
  exit 1
}

for binary in initdb pg_ctl postgres; do
  [[ -x "$pg_bin_dir/$binary" ]] || { printf 'Binário PostgreSQL ausente: %s/%s\n' "$pg_bin_dir" "$binary" >&2; exit 2; }
done
for binary in pg_dump pg_restore createdb psql; do
  command -v "$binary" >/dev/null || { printf 'Utilitário PostgreSQL ausente no PATH: %s\n' "$binary" >&2; exit 2; }
  [[ "$("$binary" --version)" == *" 17."* || "$("$binary" --version)" == *" 18."* ]] || { printf 'O utilitário %s deve ser PostgreSQL 17 ou 18.\n' "$binary" >&2; exit 2; }
done
[[ "$("$pg_bin_dir/postgres" --version)" == *" 17."* || "$("$pg_bin_dir/postgres" --version)" == *" 18."* ]] || { printf 'Use PostgreSQL 17 ou 18 para corresponder às imagens suportadas do projeto.\n' >&2; exit 2; }

export PATH="$pg_bin_dir:$PATH"
if [[ -n "$pg_lib_dir" ]]; then export LD_LIBRARY_PATH="$pg_lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi

printf 'Preparando dois clusters PostgreSQL descartáveis...\n'
run_quiet 'inicialização do cluster origem' "$pg_bin_dir/initdb" -D "$temp_root/source" --auth-local=trust --auth-host=trust --no-instructions
run_quiet 'inicialização do cluster destino' "$pg_bin_dir/initdb" -D "$temp_root/restore" --auth-local=trust --auth-host=trust --no-instructions
run_quiet 'inicialização da origem' "$pg_bin_dir/pg_ctl" -D "$temp_root/source" -l "$temp_root/source.log" -o "-p $source_port -h 127.0.0.1 -k $temp_root" -w start
source_started=1
run_quiet 'inicialização do destino' "$pg_bin_dir/pg_ctl" -D "$temp_root/restore" -l "$temp_root/restore.log" -o "-p $restore_port -h 127.0.0.1 -k $temp_root" -w start
restore_started=1

source_url="postgresql://$(id -un)@127.0.0.1:$source_port/marvin"
restore_url="postgresql://$(id -un)@127.0.0.1:$restore_port/marvin"
run_quiet 'criação da base origem' createdb --host=127.0.0.1 --port="$source_port" --username="$(id -un)" marvin
export DATABASE_URL="$source_url"
run_quiet 'aplicação das migrations' bash -lc "cd '$repo_root' && pnpm --filter @finance/db db:migrate"

cat >"$fixture_file" <<'TS'
import assert from "node:assert/strict";
import { createDatabase, createFinanceRepository } from "@finance/db";
import { FinanceService } from "@finance/domain";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL ausente");
  const { db, pool } = createDatabase(databaseUrl);
  try {
    const service = new FinanceService(createFinanceRepository(db));
    const checking = await service.createAccount({ id: "10000000-0000-4000-8000-000000000001", name: "Recovery checking", type: "checking", currency: "BRL", openingBalanceMinor: 250000n, openingDate: "2026-01-01", institutionId: null }, "recovery-account-checking");
    const card = await service.createAccount({ id: "10000000-0000-4000-8000-000000000002", name: "Recovery card", type: "credit_card", currency: "BRL", openingBalanceMinor: 0n, openingDate: "2026-01-01", institutionId: null, cardSettings: { creditLimitMinor: 500000n, closingDay: 20, dueDay: 28, billingTimezone: "America/Sao_Paulo", billingMode: "manual" } }, "recovery-account-card");
    const category = await service.createCategory({ id: "10000000-0000-4000-8000-000000000003", name: "Recovery category", type: "expense", parentId: null }, "recovery-category");
    const metadata = { occurredOn: "2026-10-25", description: "Disposable recovery fixture", source: "manual" as const, reviewStatus: "confirmed" as const };
    await service.createIncome({ ...metadata, accountId: checking, amountMinor: "125000", categoryId: null }, "recovery-income");
    await service.createCreditPurchase({ ...metadata, cardAccountId: card, totalAmountMinor: "12345", installmentCount: 1, allocations: [{ categoryId: category, amountMinor: "12345" }] }, "recovery-purchase");
    assert.equal(await service.accountBalance(checking), 375000n);
    assert.equal(await service.accountBalance(card), -12345n);
    if (process.env.RECOVERY_REPLAY === "1") console.log("replay-ok");
  } finally {
    await pool.end();
  }
}
void main();
TS

printf 'Criando fixture financeira descartável pela camada de domínio...\n'
run_quiet 'fixture FinanceService na origem' bash -lc "cd '$repo_root/apps/web' && pnpm exec tsx '$fixture_file'"

snapshot() {
  local url="$1"
  PGOPTIONS='-c search_path=public' psql -X -A -t --no-psqlrc "$url" -v ON_ERROR_STOP=1 -c "
    SELECT jsonb_build_object(
      'tables', (SELECT jsonb_agg(jsonb_build_array(name, rows) ORDER BY name) FROM (
        SELECT 'accounts' name, count(*) rows FROM accounts UNION ALL
        SELECT 'agent_requests', count(*) FROM agent_requests UNION ALL
        SELECT 'account_entries', count(*) FROM account_entries UNION ALL
        SELECT 'card_statements', count(*) FROM card_statements UNION ALL
        SELECT 'card_statement_items', count(*) FROM card_statement_items UNION ALL
        SELECT 'category_allocations', count(*) FROM category_allocations UNION ALL
        SELECT 'categories', count(*) FROM categories UNION ALL
        SELECT 'credit_card_settings', count(*) FROM credit_card_settings UNION ALL
        SELECT 'expense_forecasts', count(*) FROM expense_forecasts UNION ALL
        SELECT 'idempotency_claims', count(*) FROM idempotency_claims UNION ALL
        SELECT 'installment_plans', count(*) FROM installment_plans UNION ALL
        SELECT 'institutions', count(*) FROM institutions UNION ALL
        SELECT 'statement_payments', count(*) FROM statement_payments UNION ALL
        SELECT 'transaction_revisions', count(*) FROM transaction_revisions UNION ALL
        SELECT 'transactions', count(*) FROM transactions
        UNION ALL SELECT 'drizzle.__drizzle_migrations', count(*) FROM drizzle.__drizzle_migrations
      ) counts),
      'balances', (SELECT jsonb_agg(jsonb_build_array(a.id, a.opening_balance_minor + coalesce(e.amount, 0)) ORDER BY a.id)
        FROM accounts a LEFT JOIN (SELECT account_id, sum(amount_minor) amount FROM account_entries GROUP BY account_id) e ON e.account_id = a.id),
      'tableDefinitions', (SELECT jsonb_agg(jsonb_build_array(c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull) ORDER BY c.relname, a.attnum)
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(c.relname, con.conname, pg_get_constraintdef(con.oid)) ORDER BY c.relname, con.conname)
        FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid WHERE con.connamespace = 'public'::regnamespace),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(c.relname, t.tgname, pg_get_triggerdef(t.oid)) ORDER BY c.relname, t.tgname)
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace)
    );" 2>"$log_file"
}

source_snapshot="$(snapshot "$source_url")" || { printf 'Falha ao inspecionar base origem.\n' >&2; exit 1; }
if psql -X -q -t --no-psqlrc "$source_url" -v ON_ERROR_STOP=1 -c 'UPDATE account_entries SET amount_minor = amount_minor WHERE id = (SELECT id FROM account_entries LIMIT 1)' >"$log_file" 2>&1; then
  printf 'A fixture não criou entrada para validar a constraint append-only.\n' >&2; exit 1
fi
printf 'Criando dump e restaurando na segunda base...\n'
run_quiet 'pg_dump custom format' pg_dump --format=custom --no-owner --file="$temp_root/recovery.dump" "$source_url"
run_quiet 'criação da base destino' createdb --host=127.0.0.1 --port="$restore_port" --username="$(id -un)" marvin
run_quiet 'pg_restore' pg_restore --exit-on-error --no-owner --dbname="$restore_url" "$temp_root/recovery.dump"

export DATABASE_URL="$restore_url" RECOVERY_REPLAY=1
run_quiet 'replay idempotente após restore' bash -lc "cd '$repo_root/apps/web' && pnpm exec tsx '$fixture_file'"
restore_snapshot="$(snapshot "$restore_url")" || { printf 'Falha ao inspecionar base restaurada.\n' >&2; exit 1; }
[[ "$source_snapshot" == "$restore_snapshot" ]] || { printf 'Estrutura, constraints, gatilhos, contagens ou saldos diferem após restore/replay.\n' >&2; exit 1; }

printf 'OK: migrations, dump/restore, integridade agregada, saldos e replay idempotente validados.\n'

#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
pg_bin_dir="${PG_BIN_DIR:-/tmp/marvin-pg-runtime/usr/bin}"
pg_lib_dir="${PG_LIB_DIR:-/tmp/marvin-pg-runtime/usr/lib}"
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/marvin-test-postgres.XXXXXXXX")"
data_dir="$temp_root/data"
port=$((30000 + ($$ % 30000)))
started=0

cleanup() {
  if (( started )); then "$pg_bin_dir/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true; fi
  rm -rf -- "$temp_root"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

for binary in initdb pg_ctl postgres; do
  [[ -x "$pg_bin_dir/$binary" ]] || { printf 'Binário PostgreSQL ausente: %s/%s\n' "$pg_bin_dir" "$binary" >&2; exit 2; }
done
[[ "$("$pg_bin_dir/postgres" --version)" == *"18.6"* ]] || { printf 'O runtime esperado é PostgreSQL 18.6.\n' >&2; exit 2; }

export PATH="$pg_bin_dir:$PATH"
export LD_LIBRARY_PATH="$pg_lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$pg_bin_dir/initdb" -D "$data_dir" -U postgres --auth-local=trust --auth-host=trust --no-instructions >/dev/null
"$pg_bin_dir/pg_ctl" -D "$data_dir" -l "$temp_root/postgres.log" -o "-h 127.0.0.1 -k $temp_root -p $port -F" -w start >/dev/null
started=1
createdb --host=127.0.0.1 --port="$port" --username=postgres marvin_test
export DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:$port/marvin_test"

cd "$repo_root"
test_output="$temp_root/test-output.log"
if ! pnpm test >"$test_output" 2>&1; then
  cat "$test_output"
  exit 1
fi
cat "$test_output"
if rg -q 'skipped [1-9][0-9]*|# SKIP' "$test_output"; then
  printf 'A suíte passou com casos ignorados; o gate exige zero skips.\n' >&2
  exit 1
fi

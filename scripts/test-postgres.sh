#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
pg_bin_dir="${PG_BIN_DIR:-}"
pg_lib_dir="${PG_LIB_DIR:-}"
docker_container="marvin-test-postgres-$$"
docker_mode=0
if [[ -z "$pg_bin_dir" ]]; then
  if command -v initdb >/dev/null 2>&1; then pg_bin_dir="$(dirname "$(command -v initdb)")"
  elif [[ -x /tmp/marvin-pg-runtime/usr/bin/initdb ]]; then pg_bin_dir=/tmp/marvin-pg-runtime/usr/bin
  elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then docker_mode=1
  else printf 'PostgreSQL local não encontrado e Docker indisponível. Defina PG_BIN_DIR ou habilite Docker.\n' >&2; exit 2
  fi
fi
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/marvin-test-postgres.XXXXXXXX")"
data_dir="$temp_root/data"
port=$((30000 + ($$ % 30000)))
started=0

cleanup() {
  if (( started )); then "$pg_bin_dir/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true; fi
  if (( docker_mode )); then docker rm -f "$docker_container" >/dev/null 2>&1 || true; fi
  rm -rf -- "$temp_root"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if (( docker_mode )); then
  image="postgres:${POSTGRES_IMAGE_TAG:-17.11-alpine}"
  docker run -d --name "$docker_container" -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1::5432 "$image" >/dev/null
  port="$(docker port "$docker_container" 5432/tcp | sed 's/.*://')"
  for _ in $(seq 1 60); do
    if docker exec "$docker_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$docker_container" pg_isready -U postgres >/dev/null || { printf 'PostgreSQL Docker não ficou pronto.\n' >&2; exit 1; }
  export DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:$port/postgres"
else
  for binary in initdb pg_ctl postgres; do
    [[ -x "$pg_bin_dir/$binary" ]] || { printf 'Binário PostgreSQL ausente: %s/%s\n' "$pg_bin_dir" "$binary" >&2; exit 2; }
  done
  version="$("$pg_bin_dir/postgres" --version)"
  [[ "$version" == *" 17."* || "$version" == *" 18."* ]] || { printf 'Use PostgreSQL 17 ou 18 para corresponder às imagens suportadas do projeto.\n' >&2; exit 2; }
  export PATH="$pg_bin_dir:$PATH"
  if [[ -n "$pg_lib_dir" ]]; then export LD_LIBRARY_PATH="$pg_lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi
  "$pg_bin_dir/initdb" -D "$data_dir" -U postgres --auth-local=trust --auth-host=trust --no-instructions >/dev/null
  "$pg_bin_dir/pg_ctl" -D "$data_dir" -l "$temp_root/postgres.log" -o "-h 127.0.0.1 -k $temp_root -p $port -F" -w start >/dev/null
  started=1
  createdb --host=127.0.0.1 --port="$port" --username=postgres marvin_test
  export DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:$port/marvin_test"
fi

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

#!/usr/bin/env bash
set -Eeuo pipefail
source_dir=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/install" "$tmp/runtime"
cp "$source_dir/scripts/install-homelab.sh" "$tmp/install/"
cp "$source_dir/infra/compose.release.yml" "$tmp/install/compose.yml"
printf 'v0.1.0\n' > "$tmp/install/version"
cat > "$tmp/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TEST_LOG"
case "$*" in
  "volume ls --format {{.Name}}") if [[ ${TEST_EXISTING_VOLUME:-0} == 1 ]]; then printf '%s\n' marvin-project_postgres_data; fi ;;
  'ps -aq --filter label=com.docker.compose.project=marvin-project') exit 0 ;;
  *'run --rm --no-deps migrate') [[ ${FAIL_MIGRATION:-0} != 1 ]] ;;
  *'--credentials-file /run/marvin-role-credentials.json'*)
    while [[ $# -gt 0 ]]; do
      if [[ $1 == --volume ]]; then
        file=${2%%:/run/marvin-role-credentials.json:ro}
        [[ -f $file && $(stat -c %a "$file") == 600 ]]
        node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1])); const e=fs.readFileSync(".env","utf8"); const o=fs.readFileSync(".env.ops","utf8"); if (!e.includes(c.appPassword) || !o.includes(c.migrationPassword) || c.appPassword === c.migrationPassword) process.exit(1)' "$file"
        exit
      fi
      shift
    done
    exit 1 ;;
esac
MOCK
chmod +x "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH" TEST_LOG="$tmp/docker.log" XDG_RUNTIME_DIR="$tmp/runtime"
cd "$tmp/install"
printf 'https://marvin.example.lan\n' | script -q -e -c 'bash install-homelab.sh' /dev/null > "$tmp/output"
test "$(stat -c %a .env)" = 600
test "$(stat -c %a .env.ops)" = 600
test "$(cat .marvin/deployed-version)" = v0.1.0
test "$(find .marvin -name 'credentials.*' | wc -l)" -eq 0
rg -q 'pull db web mcp' "$TEST_LOG"
rg -q 'db:provision-owner' "$TEST_LOG"
rg -q 'db:bootstrap-categories' "$TEST_LOG"
node -e 'const fs=require("fs"); const e=fs.readFileSync(".env","utf8"); const o=fs.readFileSync(".env.ops","utf8"); const out=fs.readFileSync(process.argv[1],"utf8"); const vals=Object.fromEntries((e+"\n"+o).trim().split("\n").map(x=>x.split(/=(.*)/s).slice(0,2))); if(!out.includes(vals.MCP_HERMES_BEARER_TOKEN) || out.includes(vals.MCP_API_TOKEN) || out.includes(vals.POSTGRES_PASSWORD)) process.exit(1)' "$tmp/output"
: > "$TEST_LOG"
if printf 'https://marvin.example.lan\n' | script -q -e -c 'bash install-homelab.sh' /dev/null > "$tmp/existing-output"; then echo 'Existing config accepted' >&2; exit 1; fi
test ! -s "$TEST_LOG"
mkdir "$tmp/existing-volume"
cp install-homelab.sh compose.yml version "$tmp/existing-volume/"
cd "$tmp/existing-volume"
if printf 'https://marvin.example.lan\n' | TEST_EXISTING_VOLUME=1 script -q -e -c 'bash install-homelab.sh' /dev/null > "$tmp/volume-output"; then echo 'Existing volume accepted' >&2; exit 1; fi
test ! -e .env && test ! -e .env.ops
mkdir "$tmp/failed-install"
cp install-homelab.sh compose.yml version "$tmp/failed-install/"
cd "$tmp/failed-install"
: > "$TEST_LOG"
if printf 'https://marvin.example.lan\n' | FAIL_MIGRATION=1 script -q -e -c 'bash install-homelab.sh' /dev/null > "$tmp/failure-output"; then echo 'Migration failure was ignored' >&2; exit 1; fi
test -f .env && test -f .env.ops && test ! -e .marvin/deployed-version
test "$(find .marvin -name 'credentials.*' | wc -l)" -eq 0
if rg -q 'up -d --no-deps --wait web' "$TEST_LOG"; then echo 'Web started after failed migration' >&2; exit 1; fi
printf 'install-homelab: generated configuration, credentials and existing-data checks passed\n'

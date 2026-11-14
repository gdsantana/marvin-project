#!/usr/bin/env bash
set -Eeuo pipefail
source_dir=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/install" "$tmp/runtime"
printf 'source %q\ninstall_homelab "$PWD"\n' "$source_dir/scripts/install.sh" > "$tmp/install/install-homelab.sh"
cp "$source_dir/infra/compose.release.yml" "$tmp/install/compose.yml"
printf 'v0.1.0\n' > "$tmp/install/version"
cat > "$tmp/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TEST_LOG"
case "$*" in
  "volume ls --format {{.Name}}") if [[ ${TEST_EXISTING_VOLUME:-0} == 1 ]]; then printf '%s\n' marvin-project_postgres_data; fi ;;
  'ps -q --filter publish=4001') if [[ ${TEST_BUSY_PORT:-0} == 1 ]]; then echo busy-container; fi ;;
  'ps -aq --filter label=com.docker.compose.project=marvin-project') exit 0 ;;
  *'--input-type module'*)
    node -e 'const fs=require("fs"); const [user,password]=fs.readFileSync(0,"utf8").split("\0"); if(user !== "owner" || password !== "valid password") process.exit(1)'
    exit ;;
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
cat > "$tmp/bin/ss" <<'MOCK'
#!/usr/bin/env bash
if [[ ${TEST_BUSY_PORT:-0} == 1 && $* == *:3000 ]]; then echo 'LISTEN 0 128 127.0.0.1:3000'; fi
MOCK
chmod +x "$tmp/bin/docker" "$tmp/bin/ss"
export PATH="$tmp/bin:$PATH" TEST_LOG="$tmp/docker.log" XDG_RUNTIME_DIR="$tmp/runtime"
cd "$tmp/install"
printf 'marvin.homelab\nhttp://marvin.homelab\nhttps://marvin.example.lan\ninvalid\n65535\n4000\n8080\n!\nowner\nshort\nvalid password\nwrong password\nvalid password\nvalid password\n' | TEST_BUSY_PORT=1 script -q -e -c 'bash install-homelab.sh' /dev/null > "$tmp/output"
rg -q '^WEB_HOST_PORT=8080$' .env
rg -q '^MCP_HOST_PORT=8081$' .env
rg -q 'As senhas não coincidem' "$tmp/output"
rg -q 'A senha deve ter' "$tmp/output"
rg -q 'Use 3 a 64 caracteres' "$tmp/output"
rg -q 'Porta 4001 ocupada' "$tmp/output"
test "$(stat -c %a .env)" = 600
test "$(stat -c %a .env.ops)" = 600
test "$(cat .marvin/deployed-version)" = v0.1.0
test "$(find .marvin -name 'credentials.*' | wc -l)" -eq 0
rg -q 'pull db web mcp' "$TEST_LOG"
rg -q 'provisionOwner'  "$TEST_LOG"
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
rg -q '^WEB_HOST_PORT=3000$' .env
rg -q '^MCP_HOST_PORT=3001$' .env
test "$(find .marvin -name 'credentials.*' | wc -l)" -eq 0
if rg -q 'up -d --no-deps --wait web' "$TEST_LOG"; then echo 'Web started after failed migration' >&2; exit 1; fi
# Exercise the real entrypoint through a pipe against a legacy release bundle.
mkdir "$tmp/package"
cp "$tmp/install/compose.yml" "$tmp/install/version" "$tmp/package/"
touch "$tmp/package/update-homelab.sh" "$tmp/package/.env.example" "$tmp/package/.env.ops.example"
printf '#!/usr/bin/env bash\nexit 99\n' > "$tmp/package/install-homelab.sh"
tar -czf "$tmp/bundle.tar.gz" -C "$tmp/package" compose.yml version update-homelab.sh .env.example .env.ops.example install-homelab.sh
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
if [[ $* == *raw.githubusercontent.com* ]]; then
  cat "$TEST_INSTALLER"
else
  while [[ $# -gt 0 ]]; do
    if [[ $1 == -o ]]; then cp "$TEST_BUNDLE" "$2"; exit; fi
    shift
  done
  exit 1
fi
MOCK
chmod +x "$tmp/bin/curl"
export TEST_INSTALLER="$source_dir/scripts/install.sh" TEST_BUNDLE="$tmp/bundle.tar.gz"
printf 'https://marvin.example.lan\n4000\n8080\nowner\nshort\nvalid password\nwrong password\nvalid password\nvalid password\n' | TEST_BUSY_PORT=1 script -q -e -c "curl -fsSL https://raw.githubusercontent.com/example/main/scripts/install.sh | bash -s -- v0.1.0 '$tmp/full'" /dev/null > "$tmp/full-output"
rg -q '^WEB_HOST_PORT=8080$' "$tmp/full/.env"
rg -q '^MCP_HOST_PORT=8081$' "$tmp/full/.env"
test "$(cat "$tmp/full/.marvin/deployed-version")" = v0.1.0
test ! -e "$tmp/full/install-homelab.sh"
printf 'install-homelab: generated configuration, credentials and existing-data checks passed\n'

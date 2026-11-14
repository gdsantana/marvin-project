#!/usr/bin/env bash
set -Eeuo pipefail
source_dir=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/install" "$tmp/backups" "$tmp/bundle"
cp "$source_dir/scripts/update-homelab.sh" "$tmp/install/"
cp "$source_dir/infra/compose.release.yml" "$tmp/bundle/compose.yml"
tar -C "$tmp/bundle" -czf "$tmp/bundle.tar.gz" compose.yml
touch "$tmp/install/.env" "$tmp/install/.env.ops"
cat > "$tmp/bin/gh" <<'MOCK'
#!/usr/bin/env bash
case "$1 $2" in
  'release view') printf '%s\n' "${TEST_UNSTABLE:-false}" ;;
  'release download')
    [[ ${FAIL_DOWNLOAD:-0} != 1 ]] || exit 1
    while [[ $# -gt 0 ]]; do
      if [[ $1 == --dir ]]; then cp "$TEST_BUNDLE" "$2/marvin-deploy.tar.gz"; exit; fi
      shift
    done
    exit 1 ;;
  *) exit 1 ;;
esac
MOCK
cat > "$tmp/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TEST_LOG"
case "$*" in
  *'pull web mcp'*) [[ ${FAIL_PULL:-0} != 1 ]] ;;
  *pg_dump*) [[ ${FAIL_BACKUP:-0} != 1 ]] || exit 1; printf 'fake dump' ;;
  *'run --rm --no-deps migrate'*) [[ ${FAIL_MIGRATION:-0} != 1 ]] ;;
esac
MOCK
chmod +x "$tmp/bin/gh" "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH" TEST_LOG="$tmp/docker.log" MARVIN_BACKUP_DIR="$tmp/backups" TEST_BUNDLE="$tmp/bundle.tar.gz"
cd "$tmp/install"
printf 's\n' | bash update-homelab.sh v0.1.0 > "$tmp/success.log"
test "$(cat .marvin/deployed-version)" = v0.1.0
test "$(find "$tmp/backups" -name '*.dump' | wc -l)" -eq 1
rg -q 'pull web mcp' "$TEST_LOG"
rg -q 'run --rm --no-deps migrate' "$TEST_LOG"
rg -q 'up -d --no-deps --wait web' "$TEST_LOG"
rg -q 'up -d --no-deps --wait mcp' "$TEST_LOG"
if rg -q 'up .* db|pull .* db' "$TEST_LOG"; then echo 'DB must not be updated' >&2; exit 1; fi
rm .marvin/deployed-version
: > "$TEST_LOG"
if printf 's\n' | FAIL_MIGRATION=1 bash update-homelab.sh v0.1.0 > "$tmp/failure.log" 2>&1; then
  echo 'Migration failure was ignored' >&2; exit 1
fi
test ! -e .marvin/deployed-version
if rg -q 'up -d --no-deps --wait' "$TEST_LOG"; then echo 'Apps started after migration failure' >&2; exit 1; fi
: > "$TEST_LOG"
if bash update-homelab.sh v0.2.0-rc.1 > "$tmp/prerelease.log" 2>&1; then echo 'Pre-release was accepted' >&2; exit 1; fi
test ! -s "$TEST_LOG"
if FAIL_DOWNLOAD=1 bash update-homelab.sh v0.1.0 > "$tmp/download.log" 2>&1; then echo 'Missing bundle was accepted' >&2; exit 1; fi
test ! -s "$TEST_LOG"
if FAIL_PULL=1 bash update-homelab.sh v0.1.0 > "$tmp/pull.log" 2>&1; then echo 'Image pull failure was ignored' >&2; exit 1; fi
if rg -q 'stop mcp web' "$TEST_LOG"; then echo 'Services stopped after image pull failure' >&2; exit 1; fi
: > "$TEST_LOG"
if printf 's\n' | FAIL_BACKUP=1 bash update-homelab.sh v0.1.0 > "$tmp/backup-failure.log" 2>&1; then echo 'Backup failure was ignored' >&2; exit 1; fi
if rg -q 'run --rm --no-deps migrate|up -d --no-deps --wait' "$TEST_LOG"; then echo 'Update continued after backup failure' >&2; exit 1; fi
printf 'update-homelab: success and failure paths passed\n'

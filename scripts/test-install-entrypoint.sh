#!/usr/bin/env bash
set -Eeuo pipefail
source_dir=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/bundle"
printf 'v0.1.0\n' > "$tmp/bundle/version"
touch "$tmp/bundle/compose.yml" "$tmp/bundle/update-homelab.sh" "$tmp/bundle/.env.example" "$tmp/bundle/.env.ops.example"
cat > "$tmp/bundle/install-homelab.sh" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' started > "$TEST_MARKER"
MOCK
tar -C "$tmp/bundle" -czf "$tmp/archive.tar.gz" compose.yml install-homelab.sh update-homelab.sh version .env.example .env.ops.example
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
if [[ ${TEST_PRIVATE:-0} == 1 ]]; then exit 22; fi
out=''
while [[ $# -gt 0 ]]; do
  case $1 in
    -o) out=$2; shift 2 ;;
    -w) shift 2 ;;
    *) url=$1; shift ;;
  esac
done
if [[ $url == */releases/latest ]]; then printf 'https://github.com/gdsantana/marvin-project/releases/tag/v0.1.0'; else cp "$TEST_ARCHIVE" "$out"; fi
MOCK
cat > "$tmp/bin/gh" <<'MOCK'
#!/usr/bin/env bash
case "$1 $2" in
  'release view') printf '%s\n' v0.1.0 ;;
  'release download') while [[ $# -gt 0 ]]; do if [[ $1 == --dir ]]; then cp "$TEST_ARCHIVE" "$2/marvin-deploy.tar.gz"; exit; fi; shift; done; exit 1 ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH" TEST_ARCHIVE="$tmp/archive.tar.gz" TEST_MARKER="$tmp/started" HOME="$tmp/home"
mkdir -p "$HOME"
script -q -e -c "bash '$source_dir/scripts/install.sh'" /dev/null > "$tmp/public.log"
test -f "$TEST_MARKER" && test -f "$HOME/marvin/version"
rm "$TEST_MARKER"
mkdir -p "$tmp/existing"
printf 'keep\n' > "$tmp/existing/user-file"
if script -q -e -c "bash '$source_dir/scripts/install.sh' v0.1.0 '$tmp/existing'" /dev/null > "$tmp/existing.log"; then echo 'Existing directory was accepted' >&2; exit 1; fi
test "$(cat "$tmp/existing/user-file")" = keep && test ! -e "$TEST_MARKER"
TEST_PRIVATE=1 script -q -e -c "bash '$source_dir/scripts/install.sh' v0.1.0 '$tmp/private'" /dev/null > "$tmp/private.log"
test -f "$TEST_MARKER"
rm "$TEST_MARKER"
if script -q -e -c "bash '$source_dir/scripts/install.sh' v0.2.0 '$tmp/wrong'" /dev/null > "$tmp/wrong.log"; then echo 'Mismatched bundle was accepted' >&2; exit 1; fi
test ! -e "$TEST_MARKER" && test ! -e "$tmp/wrong"
printf 'install.sh: public, private, existing-data and version checks passed\n'

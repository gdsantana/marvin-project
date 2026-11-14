#!/usr/bin/env bash
set -Eeuo pipefail
source_dir=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/package" "$tmp/work"
cp "$source_dir/scripts/install.sh" "$tmp/work/install.sh"
printf 'v0.1.0\n' > "$tmp/package/version"
for file in compose.yml update-homelab.sh .env.example .env.ops.example; do touch "$tmp/package/$file"; done
cat > "$tmp/package/install-homelab.sh" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ -t 0 ]]
read -r answer
[[ $answer == https://marvin.example.lan ]]
printf 'terminal input received\n'
MOCK
tar -czf "$tmp/bundle.tar.gz" -C "$tmp/package" compose.yml install-homelab.sh update-homelab.sh version .env.example .env.ops.example
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
if [[ $* == *latest/download/install.sh* ]]; then
  cat "$TEST_SOURCE"
else
  while [[ $# -gt 0 ]]; do
    if [[ $1 == -o ]]; then cp "$TEST_BUNDLE" "$2"; exit; fi
    shift
  done
  exit 1
fi
MOCK
chmod +x "$tmp/bin/curl"
export PATH="$tmp/bin:$PATH" TEST_SOURCE="$tmp/work/install.sh" TEST_BUNDLE="$tmp/bundle.tar.gz"
cd "$tmp/work"
for mode in pipe file; do
  if [[ $mode == pipe ]]; then
    command="curl -fsSL https://example.test/latest/download/install.sh | bash -s -- v0.1.0 '$tmp/$mode'"
  else
    command="bash install.sh v0.1.0 '$tmp/$mode'"
  fi
  printf 'https://marvin.example.lan\n' | script -q -e -c "$command" /dev/null > "$tmp/$mode.log"
  rg -q 'terminal input received' "$tmp/$mode.log"
  test -f "$tmp/$mode/version"
done
if setsid bash install.sh v0.1.0 "$tmp/no-terminal" </dev/null >"$tmp/no-terminal.log" 2>&1; then
  echo 'Installation accepted without a terminal' >&2; exit 1
fi
rg -q 'terminal interativo' "$tmp/no-terminal.log"
test ! -e "$tmp/no-terminal"
printf 'install-bootstrap: pipe, file and missing-terminal checks passed\n'

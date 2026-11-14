#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "Atualização interrompida. Confira serviços, imagens e banco antes de retomá-los; não reverta imagens sem verificar a migration." >&2' ERR

for command in gh docker flock sha256sum tar; do
  command -v "$command" >/dev/null || { echo "Comando ausente: $command" >&2; exit 1; }
done
[[ $# == 1 && $1 =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Uso: ./update-homelab.sh vX.Y.Z' >&2; exit 1; }
tag=$1
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$root"
[[ -f .env && -f .env.ops ]] || { echo 'Configure .env e .env.ops no diretório de instalação.' >&2; exit 1; }
mkdir -p .marvin
exec 9>.marvin/update.lock
flock -n 9 || { echo 'Outra atualização está em andamento.' >&2; exit 1; }
repo=gdsantana/marvin-project
stable=$(gh release view "$tag" --repo "$repo" --json isDraft,isPrerelease --jq '[.isDraft,.isPrerelease] | any')
[[ $stable == false ]] || { echo 'Selecione uma release estável publicada.' >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
gh release download "$tag" --repo "$repo" --pattern marvin-deploy.tar.gz --dir "$work"
tar -xzf "$work/marvin-deploy.tar.gz" -C "$work" compose.yml
[[ -f $work/compose.yml && ! -L $work/compose.yml ]] || { echo 'Compose ausente ou inválido.' >&2; exit 1; }
mkdir -p ".marvin/releases/$tag"
cp "$work/compose.yml" ".marvin/releases/$tag/compose.yml"
export MARVIN_VERSION=$tag
compose=(docker compose --project-directory "$root" --env-file "$root/.env" --env-file "$root/.env.ops" -f "$root/.marvin/releases/$tag/compose.yml")
"${compose[@]}" config --quiet
"${compose[@]}" pull web mcp
"${compose[@]}" exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
printf 'Destino: %s\n' "$tag"
if [[ -f .marvin/deployed-version ]]; then printf 'Última versão concluída: %s\n' "$(cat .marvin/deployed-version)"; fi
while true; do
  printf 'Revise a release e bloqueie o acesso pelo proxy e Hermes. Continuar? [s/N] '
  if ! read -r answer; then echo 'Atualização cancelada.'; exit 1; fi
  case "$answer" in
    s|S) break ;;
    n|N|'') echo 'Atualização cancelada.'; exit 1 ;;
    *) echo 'Responda s para continuar ou n para cancelar.' >&2 ;;
  esac
done
"${compose[@]}" stop mcp web

backup_dir=${MARVIN_BACKUP_DIR:-/srv/backups/marvin}
umask 077
mkdir -p "$backup_dir"
backup=$(mktemp "$backup_dir/marvin-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX.dump.partial")
final=${backup%.partial}
echo "Criando backup em $final"
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
test -s "$backup"
"${compose[@]}" exec -T db pg_restore --list < "$backup" > /dev/null
mv "$backup" "$final"
sha256sum "$final" > "$final.sha256"

"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" up -d --no-deps --wait web
"${compose[@]}" up -d --no-deps --wait mcp
"${compose[@]}" ps
printf '%s\n' "$tag" > .marvin/deployed-version
printf 'Atualização concluída. Backup: %s\nVerifique login, leitura e MCP antes de liberar o acesso.\n' "$final"

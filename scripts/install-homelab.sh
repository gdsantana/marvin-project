#!/usr/bin/env bash
set +x
set -Eeuo pipefail
trap 'echo "Instalação interrompida. Os arquivos e recursos já criados foram preservados; consulte o guia antes de tentar novamente." >&2' ERR
for command in docker openssl flock ss; do
  command -v "$command" >/dev/null || { echo "Comando ausente: $command" >&2; exit 1; }
done
[[ -t 0 ]] || { echo 'Execute a instalação em um terminal interativo.' >&2; exit 1; }
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$root"
[[ -f version && -f compose.yml ]] || { echo 'Use o pacote de deploy extraído de uma release.' >&2; exit 1; }
tag=$(cat version)
[[ $tag =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Versão do pacote inválida.' >&2; exit 1; }
for path in .env .env.ops .marvin; do
  [[ ! -e $path && ! -L $path ]] || { echo "Já existe $path; esta instalação não altera ambientes existentes." >&2; exit 1; }
done
lock_dir=${XDG_RUNTIME_DIR:-$HOME/.cache}/marvin
mkdir -p "$lock_dir"
exec 9>"$lock_dir/install.lock"
flock -n 9 || { echo 'Outra instalação está em andamento.' >&2; exit 1; }
docker info >/dev/null
volumes=$(docker volume ls --format '{{.Name}}')
while IFS= read -r volume; do
  if [[ $volume == marvin-project_postgres_data ]]; then
    echo 'Já existe um volume PostgreSQL do Marvin. Use o procedimento de atualização ou recuperação.' >&2; exit 1
  fi
done <<< "$volumes"
existing=$(docker ps -aq --filter label=com.docker.compose.project=marvin-project)
[[ -z $existing ]] || { echo 'Já existem containers do projeto Marvin; instalação cancelada.' >&2; exit 1; }
while true; do
  printf 'Endereço HTTPS da interface, incluindo https://, por exemplo https://marvin.example.lan: '
  if ! read -r origin; then
    echo 'Entrada do terminal encerrada; instalação cancelada.' >&2
    exit 1
  fi
  [[ $origin =~ ^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$ ]] && break
  echo 'Inclua https:// e informe somente o domínio e a porta opcional, sem caminho, espaços ou barra final. Tente novamente.' >&2
done
web_port=3000
while true; do
  mcp_port=$((web_port + 1))
  ports_available=true
  for port in "$web_port" "$mcp_port"; do
    listeners=$(ss -H -ltn "sport = :$port")
    published=$(docker ps -q --filter "publish=$port")
    if [[ -n $listeners || -n $published ]]; then
      printf 'Porta %s ocupada.\n' "$port"
      ports_available=false
    fi
  done
  if [[ $ports_available == true ]]; then break; fi
  while true; do
    printf 'Informe outra porta para a interface, de 1024 a 65534: '
    if ! read -r candidate; then echo 'Entrada do terminal encerrada; instalação cancelada.' >&2; exit 1; fi
    if [[ $candidate =~ ^[1-9][0-9]{3,4}$ ]] && (( candidate >= 1024 && candidate <= 65534 )); then
      web_port=$candidate
      break
    fi
    echo 'Porta inválida. Use um número de 1024 a 65534.' >&2
  done
done
printf 'Portas no host: Web %s, MCP %s.\n' "$web_port" "$mcp_port"
umask 077
admin_password=$(openssl rand -hex 32)
app_password=$(openssl rand -hex 32)
migration_password=$(openssl rand -hex 32)
api_token=$(openssl rand -hex 32)
hermes_token=$(openssl rand -hex 32)
set -o noclobber
cat > .env <<ENV
POSTGRES_IMAGE_TAG=17.11-alpine
POSTGRES_DB=marvin
POSTGRES_USER=marvin_admin
DATABASE_URL=postgresql://marvin_app:${app_password}@db:5432/marvin
APP_ORIGIN=${origin}
MCP_API_TOKEN=${api_token}
MCP_HERMES_BEARER_TOKEN=${hermes_token}
MCP_API_URL=http://web:3000/api/
WEB_BIND_ADDRESS=127.0.0.1
WEB_HOST_PORT=${web_port}
MCP_BIND_ADDRESS=127.0.0.1
MCP_HOST_PORT=${mcp_port}
ENV
cat > .env.ops <<ENV
POSTGRES_PASSWORD=${admin_password}
DATABASE_ADMIN_URL=postgresql://marvin_admin:${admin_password}@db:5432/marvin
MIGRATION_DATABASE_URL=postgresql://marvin_migrator:${migration_password}@db:5432/marvin
ENV
set +o noclobber
mkdir -p ".marvin/releases/$tag"
cp compose.yml ".marvin/releases/$tag/compose.yml"
credentials=$(mktemp "$root/.marvin/credentials.XXXXXXXX")
trap 'rm -f "$credentials"' EXIT
printf '{"appPassword":"%s","migrationPassword":"%s"}\n' "$app_password" "$migration_password" > "$credentials"
export MARVIN_VERSION=$tag
compose=(docker compose --project-directory "$root" --env-file "$root/.env" --env-file "$root/.env.ops" -f "$root/.marvin/releases/$tag/compose.yml")
"${compose[@]}" config --quiet
"${compose[@]}" pull db web mcp
"${compose[@]}" up -d --wait db
"${compose[@]}" --profile ops run --rm -T --no-deps --volume "$credentials:/run/marvin-role-credentials.json:ro" provision-roles pnpm db:provision-roles --credentials-file /run/marvin-role-credentials.json
rm -f "$credentials"
"${compose[@]}" run --rm --no-deps migrate
printf '\nCrie agora o usuário e a senha de acesso à interface.\n'
"${compose[@]}" --profile ops run --rm --no-deps migrate pnpm db:provision-owner
"${compose[@]}" run --rm --no-deps migrate pnpm --filter @finance/db db:bootstrap-categories
"${compose[@]}" up -d --no-deps --wait web
"${compose[@]}" up -d --no-deps --wait mcp
printf '%s\n' "$tag" > .marvin/deployed-version
printf '\nInstalação concluída. Configure o proxy privado e verifique login e MCP antes de usar.\n'
printf 'Token bearer para conectar o agente ao servidor MCP (proteja este valor):\n%s\n' "$hermes_token"
printf 'O token também está em MCP_HERMES_BEARER_TOKEN no arquivo .env protegido.\n'

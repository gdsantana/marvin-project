#!/usr/bin/env bash
set -Eeuo pipefail
set +x

install_homelab() (
trap 'echo "Instalação interrompida. Os arquivos e recursos já criados foram preservados; consulte o guia antes de tentar novamente." >&2' ERR
for command in docker openssl flock ss; do
  command -v "$command" >/dev/null || { echo "Comando ausente: $command" >&2; exit 1; }
done
[[ -t 0 ]] || { echo 'Execute a instalação em um terminal interativo.' >&2; exit 1; }
root=$(cd "$1" && pwd)
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
while true; do
  printf 'Usuário: '
  if ! read -r username; then echo 'Entrada do terminal encerrada; instalação cancelada.' >&2; exit 1; fi
  username=${username,,}
  [[ $username =~ ^[a-z0-9][a-z0-9_.-]{2,63}$ ]] && break
  echo 'Use 3 a 64 caracteres: letras, números, ponto, sublinhado ou hífen, começando por letra ou número. Tente novamente.' >&2
done
while true; do
  printf 'Senha com 12 a 1024 caracteres: '
  if ! IFS= read -rs password; then printf '\nEntrada do terminal encerrada; instalação cancelada.\n' >&2; exit 1; fi
  printf '\n'
  if (( ${#password} < 12 || ${#password} > 1024 )); then
    echo 'A senha deve ter de 12 a 1024 caracteres. Tente novamente.' >&2
    continue
  fi
  printf 'Confirme a senha: '
  if ! IFS= read -rs confirmation; then printf '\nEntrada do terminal encerrada; instalação cancelada.\n' >&2; exit 1; fi
  printf '\n'
  [[ $password == "$confirmation" ]] && break
  echo 'As senhas não coincidem. Tente novamente.' >&2
done
# Pass credentials only through stdin; retain the image's domain and persistence rules.
printf '%s\0%s\0' "$username" "$password" | "${compose[@]}" --profile ops run --rm -T --no-deps migrate \
  pnpm --filter @finance/db exec node --import tsx --input-type module -e '
import { createDatabase } from "./src/client.ts";
import { provisionOwner } from "./src/auth.ts";
import { ownerDatabaseUrl, ownerProvisionErrorMessage } from "./src/provision-config.ts";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const [username, password] = Buffer.concat(chunks).toString("utf8").split("\0");
let pool;
try {
  const connection = createDatabase(ownerDatabaseUrl(), { connectionTimeoutMillis: 5000 });
  pool = connection.pool;
  await provisionOwner(connection.db, username, password);
  console.log("Conta proprietária configurada. Entre com usuário e senha.");
} catch (error) {
  console.error(`Não foi possível configurar a conta. ${ownerProvisionErrorMessage(error)}`);
  process.exitCode = 1;
} finally { await pool?.end(); }
'
unset password confirmation
"${compose[@]}" run --rm --no-deps migrate pnpm --filter @finance/db db:bootstrap-categories
"${compose[@]}" up -d --no-deps --wait web
"${compose[@]}" up -d --no-deps --wait mcp
printf '%s\n' "$tag" > .marvin/deployed-version
printf '\nInstalação concluída. Configure o proxy privado e verifique login e MCP antes de usar.\n'
printf 'Token bearer para conectar o agente ao servidor MCP (proteja este valor):\n%s\n' "$hermes_token"
printf 'O token também está em MCP_HERMES_BEARER_TOKEN no arquivo .env protegido.\n'
)

main() {
for command in curl tar; do
  command -v "$command" >/dev/null || { echo "Comando ausente: $command" >&2; exit 1; }
done
[[ $# -le 2 ]] || { echo 'Uso: bash install.sh [vX.Y.Z] [diretório]' >&2; exit 1; }
# Keep script input separate from the terminal used by installation prompts.
if ! { exec 3</dev/tty; } 2>/dev/null; then
  echo 'Execute o instalador em um terminal interativo.' >&2; exit 1
fi
[[ -t 3 ]] || { echo 'Execute o instalador em um terminal interativo.' >&2; exit 1; }
repo=gdsantana/marvin-project
url="https://github.com/$repo"
tag=${1:-}
if [[ -z $tag ]]; then
  latest=$(curl -fsSL -o /dev/null -w '%{url_effective}' "$url/releases/latest") || latest=''
  if [[ $latest == "$url/releases/tag/"* ]]; then
    tag=${latest##*/}
  elif command -v gh >/dev/null; then
    tag=$(gh release view --repo "$repo" --json tagName --jq .tagName)
  fi
fi
[[ $tag =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Informe uma tag estável no formato vX.Y.Z.' >&2; exit 1; }
install_dir=${2:-$HOME/marvin}
[[ ! -L $install_dir ]] || { echo 'O diretório de instalação não pode ser um link simbólico.' >&2; exit 1; }
if [[ -e $install_dir ]]; then
  [[ -d $install_dir && -z $(find "$install_dir" -mindepth 1 -maxdepth 1 -print -quit) ]] || { echo 'Escolha um diretório de instalação vazio.' >&2; exit 1; }
fi
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
bundle="$work/marvin-deploy.tar.gz"
if ! curl -fsSL -o "$bundle" "$url/releases/download/$tag/marvin-deploy.tar.gz"; then
  rm -f "$bundle"
  if command -v gh >/dev/null; then
    gh release download "$tag" --repo "$repo" --pattern marvin-deploy.tar.gz --dir "$work"
  else
    echo 'Pacote indisponível. Aguarde a publicação ou autentique o GitHub CLI para uma release privada.' >&2; exit 1
  fi
fi
tar -xzf "$bundle" -C "$work" compose.yml update-homelab.sh version .env.example .env.ops.example
for file in compose.yml update-homelab.sh version .env.example .env.ops.example; do
  [[ -f $work/$file && ! -L $work/$file ]] || { echo 'Pacote de deploy inválido.' >&2; exit 1; }
done
[[ $(cat "$work/version") == "$tag" ]] || { echo 'A versão do pacote não corresponde à release.' >&2; exit 1; }
mkdir -p "$install_dir"
[[ -z $(find "$install_dir" -mindepth 1 -maxdepth 1 -print -quit) ]] || { echo 'O diretório de instalação deixou de estar vazio.' >&2; exit 1; }
cp -n "$work/compose.yml" "$work/update-homelab.sh" "$work/version" "$work/.env.example" "$work/.env.ops.example" "$install_dir/"
for file in compose.yml update-homelab.sh version .env.example .env.ops.example; do
  [[ -f $install_dir/$file && ! -L $install_dir/$file ]] && cmp -s "$work/$file" "$install_dir/$file" || { echo 'Conflito no diretório de instalação; arquivos existentes foram preservados.' >&2; exit 1; }
done
printf 'Iniciando instalação da release %s em %s.\n' "$tag" "$install_dir"
install_homelab "$install_dir" <&3
}

# Parse all functions before reading prompts when invoked through curl | bash.
if [[ -z ${BASH_SOURCE[0]:-} || ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi

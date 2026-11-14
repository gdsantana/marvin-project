#!/usr/bin/env bash
set -Eeuo pipefail
set +x

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
tar -xzf "$bundle" -C "$work" compose.yml install-homelab.sh update-homelab.sh version .env.example .env.ops.example
for file in compose.yml install-homelab.sh update-homelab.sh version .env.example .env.ops.example; do
  [[ -f $work/$file && ! -L $work/$file ]] || { echo 'Pacote de deploy inválido.' >&2; exit 1; }
done
[[ $(cat "$work/version") == "$tag" ]] || { echo 'A versão do pacote não corresponde à release.' >&2; exit 1; }
mkdir -p "$install_dir"
[[ -z $(find "$install_dir" -mindepth 1 -maxdepth 1 -print -quit) ]] || { echo 'O diretório de instalação deixou de estar vazio.' >&2; exit 1; }
cp -n "$work/compose.yml" "$work/install-homelab.sh" "$work/update-homelab.sh" "$work/version" "$work/.env.example" "$work/.env.ops.example" "$install_dir/"
for file in compose.yml install-homelab.sh update-homelab.sh version .env.example .env.ops.example; do
  [[ -f $install_dir/$file && ! -L $install_dir/$file ]] && cmp -s "$work/$file" "$install_dir/$file" || { echo 'Conflito no diretório de instalação; arquivos existentes foram preservados.' >&2; exit 1; }
done
printf 'Iniciando instalação da release %s em %s.\n' "$tag" "$install_dir"
bash "$install_dir/install-homelab.sh" <&3
}

# Parse the complete installer before executing it when stdin is a curl pipe.
main "$@"

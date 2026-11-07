# Deploy no homelab

Deploy via Docker Compose em uma VM. Esta infraestrutura implementa os serviços e comandos abaixo; o deploy e a restauração de um backup real ainda não foram validados no homelab. Existe um ensaio descartável descrito em [recovery-validation.md](recovery-validation.md).

## Topologia

- `web`: Next.js, único serviço permanente com acesso à rede PostgreSQL.
- `mcp`: MCP HTTP Streamable, rede de aplicação e API HTTP autenticada; não recebe `DATABASE_URL` nem participa da rede DB.
- `db`: PostgreSQL com volume persistente, sem porta publicada.
- `migrate`: serviço temporário no profile `ops`, criado somente ao executar a migration explicitamente.

O Compose cria uma rede `application` para web/MCP e outra rede interna `database` para web/DB. Web e MCP publicam portas no loopback do host por padrão; um reverse proxy privado instalado no host pode encaminhá-las. Para outro proxy dentro de container, configure os endereços de bind e a rede privada do proxy de modo explícito. Não exponha as portas à internet.

## Pré-requisitos e preparação

- VM Linux no Proxmox com Docker Engine e plugin Docker Compose, Git e acesso ao repositório privado e aos registries usados pelos Dockerfiles.
- Disco persistente para o volume `postgres_data`, espaço para builds e dumps e destino de backup fora da VM. Dimensione CPU, memória e disco conforme o uso; o projeto não tem capacidade mínima medida.
- DNS privado e reverse proxy com HTTPS confiável pelo navegador e pelo Hermes, acessíveis somente pela LAN/VPN. No host da VM, o proxy pode usar os binds loopback padrão. Um proxy em outra máquina precisa de binds no IP privado da VM e firewall restrito aos clientes/proxy autorizados.
- Acesso administrativo ao Docker e ao diretório de backup. Node.js 24 e pnpm 12.15.0 no host são necessários apenas se executar os scripts pnpm fora dos containers; os builds Docker já incluem o runtime.

Escolha uma revisão aprovada do código e registre `git rev-parse HEAD`, a tag PostgreSQL e o destino do backup no registro privado da implantação. Execute os comandos deste guia na raiz desse checkout. Não aplique `infra/compose.dev.yml` em produção.

Antes da primeira implantação, defina o destino externo, a frequência e retenção dos backups e a perda de dados/tempo de recuperação aceitáveis. Não há agendamento automático no repositório. Snapshot da VM e volume persistente não substituem dump restaurável.

## Configuração e primeira subida

Requer Docker com Compose plugin. No diretório raiz do repositório:

```bash
cp .env.example .env
```

Edite `.env` no host, substitua todos os placeholders e restrinja suas permissões (`chmod 600 .env`). Gere valores aleatórios distintos para `SESSION_SECRET`, `MCP_API_TOKEN`, `MCP_HERMES_BEARER_TOKEN` e `POSTGRES_PASSWORD`; não use o mesmo segredo entre serviços. `WEB_PASSWORD_HASH` deve seguir o formato `scrypt$<salt>$<128 caracteres hex>` usado pelo login web. `DATABASE_URL` deve usar o mesmo usuário/senha/base configurado por `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`; o exemplo usa a senha URL-safe definida no arquivo.

`APP_ORIGIN` deve ser a origem HTTPS usada pelo navegador e definida na configuração do proxy confiável. Preserve os nomes de variáveis consumidos pelo web (`SESSION_SECRET`, `WEB_PASSWORD_HASH`, `MCP_API_TOKEN`, `DATABASE_URL`). `MCP_API_TOKEN` aparece nos ambientes de web e MCP e os valores devem ser idênticos; `MCP_HERMES_BEARER_TOKEN` só é entregue ao MCP. Variáveis do banco são entregues somente ao serviço `db` e o comando temporário `migrate` recebe apenas `DATABASE_URL`.

Para gerar o hash, use o helper existente em um checkout com dependências instaladas. Em Bash, a senha é lida sem eco e não entra no histórico nem nos argumentos do processo:

```bash
read -r -s -p 'Senha web: ' MARVIN_WEB_PASSWORD
printf '\n'
export MARVIN_WEB_PASSWORD
pnpm --filter @finance/web exec tsx -e 'import { hashPassword } from "./src/server/auth.ts"; hashPassword(process.env.MARVIN_WEB_PASSWORD!).then(console.log)'
unset MARVIN_WEB_PASSWORD
```

Copie o resultado para `WEB_PASSWORD_HASH` usando aspas simples no `.env`, por exemplo `WEB_PASSWORD_HASH='scrypt$...'`, para preservar os caracteres `$` na interpolação do Compose. Não use o exemplo abreviado como hash real. Gere os demais secrets com `openssl rand -hex 32`, separadamente, e armazene-os apenas em local protegido. Para uma senha de banco com caracteres reservados, faça percent-encoding na URL; uma senha hexadecimal evita essa ambiguidade.

Depois de preencher o `.env`, valide sem imprimir a configuração resolvida, pois ela contém secrets:

```bash
docker compose --env-file .env -f infra/compose.yml config --quiet
docker compose --env-file .env -f infra/compose.yml build web mcp migrate
docker compose --env-file .env -f infra/compose.yml up -d db
docker compose --env-file .env -f infra/compose.yml run --rm migrate
docker compose --env-file .env -f infra/compose.yml run --rm migrate pnpm --filter @finance/db db:bootstrap-categories
docker compose --env-file .env -f infra/compose.yml up -d web mcp
docker compose --env-file .env -f infra/compose.yml ps
```

O serviço `migrate` é uma execução única sob demanda, não é iniciado em `up`. Execute-o após o backup e antes de atualizar web/MCP. A migration usa o `DATABASE_URL` e os arquivos versionados de `packages/db`. Não prossiga se ela falhar; revise logs sem copiar valores sensíveis.

Após as migrations, `db:bootstrap-categories` cadastra 10 categorias de despesa e 3 de receita, sem contas ou lançamentos fictícios. Pode ser repetido: insere somente categorias raiz ausentes por nome e tipo, comparando nomes sem diferença de maiúsculas/minúsculas e espaços externos. Categorias existentes, inclusive arquivadas, não são alteradas. A carga é atômica e bloqueia escritas na tabela de categorias brevemente para serializar execuções concorrentes. Não execute `db:seed` em produção: ele limpa dados e cria uma carga fictícia.

Health checks consultam `pg_isready`, `/api/health` e `/healthz`, sem retornar dados privados. `unhealthy` não reinicia container por si só; `unless-stopped` reinicia processos que saírem. Web depende de DB saudável e MCP depende de web saudável.

## Verificação e operação diária

Com os binds e portas padrão, verifique no host:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
curl --fail --silent --show-error http://127.0.0.1:3001/healthz
docker compose --env-file .env -f infra/compose.yml ps
docker compose --env-file .env -f infra/compose.yml logs --tail=100 web mcp
```

Adapte as URLs se alterar os binds/portas. O health check web comprova resposta HTTP, não consulta o banco. Pelo endereço HTTPS do proxy, faça login e consulte contas/categorias para verificar autenticação e persistência. Em produção o cookie é `Secure`; o login pelo endereço HTTP local não substitui esse teste. Não crie lançamentos fictícios para validar um banco real.

Configure o Hermes para usar `https://<endereco-privado-mcp>/mcp` com bearer `MCP_HERMES_BEARER_TOKEN`, e teste uma consulta de leitura. O proxy deve preservar `Authorization`, permitir POST/GET/DELETE usados pelo transporte Streamable HTTP e encaminhar streaming sem buffering que interrompa respostas. `http://web:3000/api/` é exclusivo do cliente MCP dentro do Compose, não é o endereço do Hermes. Ver [mcp.md](mcp.md).

Se houver erro, confira `ps`, logs restritos, DNS/TLS do proxy, correspondência de `APP_ORIGIN`, tokens e conexão com DB. Não compartilhe saída de `docker compose config`, `docker inspect` ou logs com credenciais/dados privados. Não use `down -v`: ele remove o volume de dados. Após reiniciar a VM, confira novamente saúde e acesso; containers parados explicitamente podem exigir `up -d`.

## Atualização

Registre a revisão atual e escolha a revisão aprovada de destino em um checkout limpo. Revise migrations, contratos e notas de compatibilidade; imagens web/MCP/migrate são construídas do código local, sem tags de release próprias. Não faça upgrade major do PostgreSQL apenas alterando `POSTGRES_IMAGE_TAG`: isso exige um procedimento separado de migração de dados e restauração ensaiada.

Construa as imagens da revisão de destino antes da janela de manutenção. Inclua `migrate` explicitamente, pois tem build próprio e não deve usar uma imagem antiga:

```bash
docker compose --env-file .env -f infra/compose.yml config --quiet
docker compose --env-file .env -f infra/compose.yml build web mcp migrate
```

Pause o acesso pelo proxy e o Hermes; pare os dois processos para interromper também o timer de fechamento de faturas. Faça o backup da seção seguinte **após** a parada e só prossiga se o dump terminar e passar pela inspeção. Guarde também a revisão e uma cópia protegida do `.env` e da configuração do proxy, fora do repositório.

```bash
docker compose --env-file .env -f infra/compose.yml stop mcp web
```

Com backup confirmado, mantenha DB disponível, aplique migrations uma única vez e recrie aplicações:

```bash
docker compose --env-file .env -f infra/compose.yml up -d db
docker compose --env-file .env -f infra/compose.yml run --rm migrate
docker compose --env-file .env -f infra/compose.yml up -d web mcp
docker compose --env-file .env -f infra/compose.yml ps
```

Execute cada etapa apenas se a anterior tiver sucesso. Se a migration falhar, mantenha web/MCP parados e revise o erro; não retome a versão antiga sem conferir o estado do schema. Após sucesso, repita as verificações de login, leitura e MCP antes de liberar o proxy/Hermes. A janela de manutenção abrange backup, migration e verificações.

Não use atualização automática irrestrita. Voltar a uma imagem antiga não desfaz migration aplicada; restauração é um procedimento controlado, que pode descartar gravações posteriores.

## Backup PostgreSQL

Salve o dump fora do volume PostgreSQL e do repositório, em armazenamento com acesso restrito. O exemplo cria dump custom-format em um caminho de backup no host:

```bash
umask 077
mkdir -p /srv/backups/marvin
chmod 700 /srv/backups/marvin
MARVIN_BACKUP="/srv/backups/marvin/marvin-$(date -u +%Y%m%dT%H%M%SZ).dump"
if docker compose --env-file .env -f infra/compose.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$MARVIN_BACKUP.partial"; then
  if docker compose --env-file .env -f infra/compose.yml exec -T db pg_restore --list < "$MARVIN_BACKUP.partial" > /dev/null; then
    mv "$MARVIN_BACKUP.partial" "$MARVIN_BACKUP"
  fi
fi
```

Confirme que o arquivo final existe e não está vazio (`test -s "$MARVIN_BACKUP"`). Qualquer erro interrompe a atualização: um `.partial` não é backup válido. A listagem valida o catálogo do dump, mas somente uma restauração confirma sua recuperabilidade. O usuário do host precisa de permissão em `/srv/backups/marvin`; provisione o diretório antes, se necessário.

```bash
sha256sum "$MARVIN_BACKUP" > "$MARVIN_BACKUP.sha256"
```

Copie o dump e seu checksum para outro destino/host e aplique a política de retenção aprovada. Dumps contêm dados financeiros: não os envie a Git, logs ou serviços sem proteção. O projeto ainda não agenda backups nem define retenção.

## Restauração isolada

Faça primeiro um restore em base nova para validar o arquivo, sem sobrescrever a base em uso. Abaixo, substitua o caminho pelo dump desejado; `marvin_restore` deve ainda não existir:

```bash
docker compose --env-file .env -f infra/compose.yml exec -T db sh -c 'createdb -U "$POSTGRES_USER" marvin_restore && pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d marvin_restore' < /srv/backups/marvin/arquivo.dump
docker compose --env-file .env -f infra/compose.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d marvin_restore -c "select count(*) from accounts"'
```

A base nova está separada logicamente, mas compartilha o servidor/volume: não execute o ensaio sob carga sem avaliar recursos. Se o restore falhar, não use a base parcial; preserve-a para diagnóstico e repita em outra base nova.

O segundo comando depende da tabela `accounts` existir após a migration incluída no dump. Confirme integridade adicional antes de qualquer recuperação. Compare também contas, saldos, faturas, histórico e integridade com os registros anteriores ao incidente; uma contagem isolada não basta.

Para ativar a recuperação:

1. Bloqueie o proxy/Hermes e execute `docker compose --env-file .env -f infra/compose.yml stop mcp web` antes da troca. Registre quais escritas posteriores ao dump serão perdidas e confirme essa perda antes de prosseguir.
2. Use código/imagens da revisão compatível com o dump. Altere somente o nome da base em `DATABASE_URL` no `.env` para `marvin_restore`, preservando a conexão anterior em registro protegido. Não altere `POSTGRES_DB`: ele inicializa volumes vazios e não renomeia bases existentes.
3. Execute `docker compose --env-file .env -f infra/compose.yml up -d --force-recreate web mcp`. Um simples `restart` não aplica variáveis alteradas. Não aplique migrations novas ao dump sem revisar a compatibilidade.
4. Repita as verificações de saúde, login e consultas web/MCP antes de liberar acesso. Preserve a base anterior até concluir a revisão. Se precisar voltar e ainda não houver novas escritas, restaure a URL e a revisão compatível anteriores e recrie os serviços; com novas escritas, planeje reconciliação antes da troca.

Em perda da VM, provisione outra com os mesmos pré-requisitos, recupere o checkout da revisão registrada, `.env` e proxy protegidos, construa imagens e suba somente DB. Copie e confira o checksum do dump, restaure na base nova e siga a ativação acima antes de iniciar aplicações. O dump inclui schema e histórico de migrations, mas não secrets, configuração do host/proxy nem roles globais; o usuário definido pelo Compose deve existir no destino. Este procedimento precisa de ensaio no homelab antes de dados reais.

### Ensaio descartável de recuperação

Para validar migrations, dump/restauração e replay idempotente sem tocar no banco persistente, execute na raiz do repositório:

```bash
bash scripts/validate-recovery.sh
```

O script usa dois clusters temporários PostgreSQL 18.6 em loopback, uma fixture criada pelo domínio e remove apenas seus próprios processos/diretório no encerramento. Requisitos e limites estão em [Validação de backup e restauração](recovery-validation.md). Esse ensaio não substitui o restore periódico do dump real em ambiente isolado.

## Fechamento automático de faturas

O `apps/web` inicia um timer no runtime Node do Next.js. Ele executa catch-up ao iniciar e tenta novamente periodicamente; se o web estiver parado, não há execução até a próxima inicialização. Cada cartão usa seu `billingTimezone`, e ciclos abertos com `closingOn` na data local ou anterior são fechados. Somente cartões configurados como `automatic` participam; o padrão continua `manual`. A rotina não cria lançamentos nem altera faturas encerradas. Detalhes em [ADR 0007](adr/0007-automatic-statement-closing.md).

## Variáveis

| Variável | Consumidor | Finalidade |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `db` | Inicialização do PostgreSQL |
| `DATABASE_URL` | `web`, execução `migrate` | Conexão de aplicação/migration |
| `SESSION_SECRET`, `WEB_PASSWORD_HASH` | `web` | Sessão e login local |
| `APP_ORIGIN` | `web` | Origem confiável configurada para o proxy |
| `MCP_API_TOKEN` | `web`, `mcp` | Autenticação MCP → API web |
| `MCP_HERMES_BEARER_TOKEN` | `mcp` | Autenticação Hermes → MCP |
| `MCP_API_URL` | `mcp` | Base da API HTTP interna |
| `WEB_BIND_ADDRESS`, `WEB_HOST_PORT` | Compose | Bind local da porta web |
| `MCP_BIND_ADDRESS`, `MCP_HOST_PORT` | Compose | Bind local da porta MCP |
| `POSTGRES_IMAGE_TAG` | Compose | Tag da imagem PostgreSQL |

Não passe secrets como argumentos de build. O `.env` é carregado pelo Compose em runtime, não copiado para imagens. Mantenha o arquivo fora do controle de versão e use canal protegido para provisioná-lo no host.

## Limites pendentes

O deploy, proxy, rotação de credenciais, política de retenção e teste periódico de restore não foram validados no homelab. A entrega de secrets por Compose environment também depende da segurança do host; usar Docker secrets/file mounts poderá ser apropriado conforme o ambiente.

## PostgreSQL para desenvolvimento local

Para executar scripts pnpm do host usando o banco Docker existente, execute `pnpm db:up`. Esse comando aplica também `infra/compose.dev.yml`, publica a porta apenas em `127.0.0.1` e mantém o volume. A configuração é exclusiva do desenvolvimento; os comandos de deploy acima continuam usando apenas `infra/compose.yml`.

Configure `DEVELOPMENT_DATABASE_URL` com credenciais literais e host `127.0.0.1`, porta `DEV_DB_HOST_PORT` ou 5432. Seed e limpeza preferem essa URL. Mantenha `DATABASE_URL` no `.env` da raiz com host `db` para o Compose; para executar Next.js no host, configure a URL local como `DATABASE_URL` em `apps/web/.env.local`. Para migrations locais, passe a URL local explicitamente como `DATABASE_URL`. Os arquivos `.env` são excluídos do contexto de build e não são copiados às imagens. Instruções e efeitos da limpeza estão no README; decisão em [ADR 0009](adr/0009-local-development-database.md).

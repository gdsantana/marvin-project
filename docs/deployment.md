# Deploy no homelab

Deploy via Docker Compose em uma VM. Esta infraestrutura implementa os serviços e comandos abaixo; ainda não houve deploy no homelab nem restauração de backup validada.

## Topologia

- `web`: Next.js, único serviço permanente com acesso à rede PostgreSQL.
- `mcp`: MCP HTTP Streamable, rede de aplicação e API HTTP autenticada; não recebe `DATABASE_URL` nem participa da rede DB.
- `db`: PostgreSQL com volume persistente, sem porta publicada.
- `migrate`: serviço temporário no profile `ops`, criado somente ao executar a migration explicitamente.

O Compose cria uma rede `application` para web/MCP e outra rede interna `database` para web/DB. Web e MCP publicam portas no loopback do host por padrão; um reverse proxy privado instalado no host pode encaminhá-las. Para outro proxy dentro de container, configure os endereços de bind e a rede privada do proxy de modo explícito. Não exponha as portas à internet.

## Configuração e primeira subida

Requer Docker com Compose plugin. No diretório raiz do repositório:

```bash
cp .env.example .env
```

Edite `.env` no host, substitua todos os placeholders e restrinja suas permissões (`chmod 600 .env`). Gere valores aleatórios distintos para `SESSION_SECRET`, `MCP_API_TOKEN`, `MCP_HERMES_BEARER_TOKEN` e `POSTGRES_PASSWORD`; não use o mesmo segredo entre serviços. `WEB_PASSWORD_HASH` deve seguir o formato `scrypt$<salt>$<128 caracteres hex>` usado pelo login web. `DATABASE_URL` deve usar o mesmo usuário/senha/base configurado por `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`; o exemplo usa a senha URL-safe definida no arquivo.

`APP_ORIGIN` deve ser a origem HTTPS usada pelo navegador e definida na configuração do proxy confiável. Preserve os nomes de variáveis consumidos pelo web (`SESSION_SECRET`, `WEB_PASSWORD_HASH`, `MCP_API_TOKEN`, `DATABASE_URL`). `MCP_API_TOKEN` aparece nos ambientes de web e MCP e os valores devem ser idênticos; `MCP_HERMES_BEARER_TOKEN` só é entregue ao MCP. Variáveis do banco são entregues somente ao serviço `db` e o comando temporário `migrate` recebe apenas `DATABASE_URL`.

Depois de preencher o `.env`:

```bash
docker compose --env-file .env -f infra/compose.yml config
docker compose --env-file .env -f infra/compose.yml build web mcp
docker compose --env-file .env -f infra/compose.yml up -d db
docker compose --env-file .env -f infra/compose.yml run --rm migrate
docker compose --env-file .env -f infra/compose.yml up -d web mcp
docker compose --env-file .env -f infra/compose.yml ps
```

O serviço `migrate` é uma execução única sob demanda, não é iniciado em `up`. Execute-o após o backup e antes de atualizar web/MCP. A migration usa o `DATABASE_URL` e os arquivos versionados de `packages/db`. Não prossiga se ela falhar; revise logs sem copiar valores sensíveis.

Health checks consultam `pg_isready`, `/api/health` e `/healthz`, sem retornar dados privados. `unhealthy` não reinicia container por si só; `unless-stopped` reinicia processos que saírem. Web depende de DB saudável e MCP depende de web saudável.

## Atualização

Faça backup antes de atualizar schema ou imagem. Revise tags de imagem e compatibilidade; imagens web/MCP são construídas do código local. Em seguida, suba DB, execute migration e atualize aplicações:

```bash
docker compose --env-file .env -f infra/compose.yml build web mcp
docker compose --env-file .env -f infra/compose.yml up -d db
docker compose --env-file .env -f infra/compose.yml run --rm migrate
docker compose --env-file .env -f infra/compose.yml up -d web mcp
docker compose --env-file .env -f infra/compose.yml ps
```

Não use atualização automática irrestrita. Voltar a uma imagem antiga não desfaz migration aplicada; restauração é um procedimento controlado, que pode descartar gravações posteriores.

## Backup PostgreSQL

Salve o dump fora do volume PostgreSQL e do repositório, em armazenamento com acesso restrito. O exemplo cria dump custom-format em um caminho de backup no host:

```bash
mkdir -p /srv/backups/marvin
chmod 700 /srv/backups/marvin
docker compose --env-file .env -f infra/compose.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "/srv/backups/marvin/marvin-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Copie o arquivo para outro destino/host e aplique a política de retenção aprovada. Dumps contêm dados financeiros: não os envie a Git, logs ou serviços sem proteção. O projeto ainda não agenda backups nem define retenção.

## Restauração isolada

Faça primeiro um restore em base nova para validar o arquivo, sem sobrescrever a base em uso. Abaixo, substitua o caminho pelo dump desejado; `marvin_restore` deve ainda não existir:

```bash
cat /srv/backups/marvin/arquivo.dump | docker compose --env-file .env -f infra/compose.yml exec -T db sh -c 'createdb -U "$POSTGRES_USER" marvin_restore && pg_restore --no-owner -U "$POSTGRES_USER" -d marvin_restore'
docker compose --env-file .env -f infra/compose.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d marvin_restore -c "select count(*) from accounts"'
```

O segundo comando depende da tabela `accounts` existir após a migration incluída no dump. Confirme integridade adicional antes de qualquer recuperação. Para usar o restore, pare escritas, altere `DATABASE_URL` para `marvin_restore`, suba o web e confira o sistema pelo proxy; preserve a base anterior até a revisão terminar. Este procedimento precisa de ensaio no homelab antes de dados reais.

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

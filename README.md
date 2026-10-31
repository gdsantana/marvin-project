# marvin-project — Controle Financeiro Pessoal

Aplicação pessoal de finanças em reais brasileiros, com UI web em pt-BR, API HTTP e servidor MCP separado para Hermes. O monorepo pnpm contém domínio, persistência PostgreSQL, UI, API, MCP, migrations e Compose. As decisões atuais estão no [ADR 0010](docs/adr/0010-platform-consistency-and-brl.md); comandos executados, resultados datados e limites operacionais ficam na [matriz de verificação](docs/verification.md).

O modelo financeiro e seus invariantes estão em [docs/data-model.md](docs/data-model.md). As decisões aceitas de acesso e comportamento do MVP estão em [ADR 0004](docs/adr/0004-mvp-behavior-and-access.md); decisões operacionais implementadas estão em [ADR 0005](docs/adr/0005-mvp-operational-behavior.md).

## O que existe hoje

- Workspaces pnpm: `apps/web`, `apps/mcp`, `packages/contracts`, `packages/domain` e `packages/db`.
- UI responsiva inicial, login por senha local e sessão, API HTTP autenticada para sessão web ou token de serviço MCP.
- Domínio com dinheiro em `bigint`, validação Zod nos contratos, receitas, despesas, transferências, compras parceladas, cashback, estornos, pagamentos/fechamento de faturas, previsões, revisões, reversões, relatórios e idempotência.
- Schema Drizzle e migration PostgreSQL versionada, com constraints e append-only para entradas de conta, itens de fatura e pagamentos.
- MCP HTTP Streamable autenticado, com ferramentas de consulta, preview e escrita — incluindo previsão, correção e reversão — que encaminham operações à API web.
- Compose para `web`, `mcp`, `db` e um serviço temporário de migration.

Isso descreve funcionalidades implementadas; E2E dev e produção passaram pelos fluxos HTTP/MCP registrados no harness. Evidências por requisito e limitações operacionais estão em [docs/verification.md](docs/verification.md). Investimentos permanecem fora do MVP, conforme [§17 do modelo](docs/data-model.md#17-investimentos--proposta-futura) e [ADR 0001](docs/adr/0001-investment-accounting.md).

## UI

A interface em pt-BR usa exclusivamente tema escuro, tokens CSS semânticos, shadcn/ui `base-nova` com Base UI e fontes locais Geist e JetBrains Mono via `@fontsource-variable` (SIL OFL 1.1). A navegação e os formulários têm apresentação separada, preservando os fluxos existentes; funcionalidades do Figma sem suporte real são omitidas. Tema claro e seletor de aparência ficam para uma entrega futura. Veja o [ADR 0008](docs/adr/0008-web-visual-system.md) e a [arquitetura §6](ARCHITECTURE.md#6-ui).

Evidências e limites de validação estão em [docs/verification.md](docs/verification.md) e [docs/ui-validation.md](docs/ui-validation.md).

## Estrutura

```text
apps/web       Next.js: UI e API HTTP
apps/mcp       Adaptador MCP → API web autenticada
packages/contracts  Schemas Zod e contratos públicos
packages/domain     Regras financeiras e porta de persistência
packages/db         Drizzle, PostgreSQL, migration e repositório
infra               Dockerfiles e Compose
docs                Modelo, decisões e operação
```

Ver [ARCHITECTURE.md](ARCHITECTURE.md) para dependências e [docs/deployment.md](docs/deployment.md) para topologia e comandos de operação.

## Desenvolvimento

Requer Node.js, pnpm 12 e, para os fluxos da aplicação, PostgreSQL. Scripts e nomes de comandos abaixo correspondem aos `package.json` atuais:

```bash
pnpm install
pnpm dev:web
pnpm dev:mcp
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Para executar a aplicação no host, mantenha as conexões separadas: `.env` na raiz configura o Compose (`DATABASE_URL` usa o host interno `db`), enquanto `apps/web/.env.local` configura o Next.js local com a URL publicada em `127.0.0.1`. Crie o banco com `pnpm db:up` e coloque a URL local também em `DEVELOPMENT_DATABASE_URL` no `.env` para seed e limpeza. Use credenciais literais; arquivos `.env` não são copiados para as imagens.

```bash
cp .env.example .env
pnpm db:up
printf '%s\n' 'DATABASE_URL=postgresql://marvin:SUA_SENHA@127.0.0.1:5432/marvin' > apps/web/.env.local
```

Substitua `SUA_SENHA` pela senha local configurada no `.env`; não compartilhe nem versione esses arquivos. Se a porta publicada for diferente de 5432, use `DEV_DB_HOST_PORT` no endereço.

`pnpm test` percorre os workspaces configurados; integrações PostgreSQL exigem uma base descartável. `bash scripts/test-postgres.sh` prepara um cluster local ou container temporário e exige zero skips. Consulte [docs/verification.md](docs/verification.md) para resultados de testes, build e E2E. Execute E2E dev antes do build e E2E de produção depois dele, pois Next dev substitui `.next`.

Para popular um banco **exclusivo de desenvolvimento**, aplique primeiro as migrations e execute a carga fictícia com a URL desse banco:

```bash
DATABASE_URL='postgresql://usuario:senha@localhost:5432/marvin_dev' pnpm db:migrate
DEVELOPMENT_DATABASE_URL='postgresql://usuario:senha@localhost:5432/marvin_dev' SEED_DEVELOPMENT=true pnpm db:seed
```

O seed carrega automaticamente o `.env` da raiz, se existir. Com `DEVELOPMENT_DATABASE_URL` ou `DATABASE_URL` local já configurada nesse arquivo, execute `SEED_DEVELOPMENT=true pnpm db:seed`. Variáveis exportadas no terminal têm prioridade sobre o arquivo. O comando continua bloqueado quando `NODE_ENV=production`; não altere essa proteção para carregar dados fictícios em produção.

**O seed limpa todos os dados da aplicação antes de inserir a carga**, inclusive registros manuais e chaves de idempotência. O schema e o histórico de migrations são preservados. Para executar somente a limpeza:

```bash
SEED_DEVELOPMENT=true pnpm db:clean
```

Os dois comandos carregam o `.env` da raiz e exigem `SEED_DEVELOPMENT=true`, `NODE_ENV` diferente de `production` e uma URL PostgreSQL local com host `localhost`, `127.0.0.1` ou `[::1]`. Não aceitam sobrescrita de host por parâmetros da URL. Para um PostgreSQL em Docker, execute o comando no host usando a porta local publicada. Essas proteções não distinguem dados reais de fictícios: use exclusivamente um banco de desenvolvimento e pare a aplicação durante a limpeza/carga.

Para usar o PostgreSQL Docker do projeto no desenvolvimento:

```bash
pnpm db:up
SEED_DEVELOPMENT=true pnpm db:clean
SEED_DEVELOPMENT=true pnpm db:seed
```

`pnpm db:up` aplica `infra/compose.dev.yml`, publica o banco apenas em `127.0.0.1:${DEV_DB_HOST_PORT:-5432}` e preserva o volume existente. O override adiciona uma rede bridge somente ao banco para permitir a publicação da porta, mantendo a rede interna. A primeira aplicação pode interromper conexões brevemente ao recriar o container. O Compose de deploy continua sem publicar PostgreSQL.

Configure `DEVELOPMENT_DATABASE_URL` no `.env` com usuário, senha e nome do banco Docker, mas host `127.0.0.1` e a porta local publicada. Use credenciais literais: o carregamento de `.env` pelo Node não expande `${POSTGRES_PASSWORD}`. Os comandos de seed e limpeza preferem essa variável; `DATABASE_URL` continua sendo a conexão interna usada pelos containers e o fallback dos scripts quando a variável de desenvolvimento não está definida.

```bash
DEVELOPMENT_DATABASE_URL='postgresql://usuario:senha@127.0.0.1:5432/marvin_dev' SEED_DEVELOPMENT=true pnpm db:clean
```

As falhas de configuração, conexão, autenticação, permissões e tabelas ausentes têm mensagens específicas, sem imprimir a URL nem credenciais. Para migrations no terminal do host, passe a conexão local como `DATABASE_URL`; o comando `db:migrate` não usa `DEVELOPMENT_DATABASE_URL`.

A carga cobre o mês atual e os dois anteriores, pela data civil em `America/Sao_Paulo`. Por exemplo, em outubro cria agosto, setembro e outubro. Preserva as 13 categorias, Nubank e Itaú, duas contas correntes com saldo positivo e dois cartões; cria salários, rendimentos, despesas via Pix e compras no crédito nos três meses, com valores variados para análise. Compras em três parcelas começam no mês mais antigo e terminam no atual, com soma exata dos centavos. As quatro faturas anteriores são fechadas e pagas pelas contas correspondentes; as duas atuais ficam abertas e sem pagamento. Pagamento de fatura é transferência, sem duplicar despesas nos relatórios.

Não há transações futuras: datas do mês atual são antecipadas para o dia da execução quando necessário. As compras ocorrem antes do fechamento no dia 20; os cartões usam modo manual para manter a fatura atual aberta mesmo se o seed rodar após esse dia. A carga contém 34 transações e seis faturas. Cada operação financeira e a limpeza são atômicas individualmente; a carga completa não é uma única transação. Em caso de falha, execute o seed novamente para limpar a carga parcial e recriar os dados.

Variáveis para Compose estão exemplificadas em [.env.example](.env.example), incluindo `APP_ORIGIN` e `WEB_PASSWORD_HASH` consumidos pelo login. Nunca comite `.env`, segredos ou dumps.

## Invariantes principais

- Dinheiro é inteiro em unidades mínimas; saldo deriva do saldo inicial e de `account_entries`.
- Transferências próprias e pagamento de fatura não são despesas novas.
- Compra parcelada cria uma dívida integral e parcelas de fatura que somam exatamente o total.
- Receitas, despesas, projeções e saldos usam exclusivamente BRL; não há câmbio.
- MCP não acessa PostgreSQL nem mantém regras contábeis próprias.

O conjunto exigido de cenários está em [docs/data-model.md §11](docs/data-model.md#11-testes-de-aceitação-de-domínio--obrigatórios-antes-de-produção); evidências e lacunas estão em [docs/verification.md](docs/verification.md).

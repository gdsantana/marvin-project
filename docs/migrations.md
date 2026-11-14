# PostgreSQL e migrations

O workspace `@finance/db` guarda o schema Drizzle, o adapter de `FinanceRepository` e migrations SQL versionadas. As migrations iniciais cobrem as entidades monetárias, cartões, previsões de despesa e revisões de transação do MVP descritas em `docs/data-model.md` §§4–11. Investimentos não fazem parte delas.

## Configuração e comandos

Use PostgreSQL real e configure `DATABASE_ADMIN_URL` e `MIGRATION_DATABASE_URL` no arquivo operacional `.env.ops`, seguindo o guia de deploy. Não há banco em memória nem URL padrão de fallback.

```bash
pnpm db:provision-roles # ambiente administrativo de .env.ops, terminal interativo
pnpm db:migrate # MIGRATION_DATABASE_URL de marvin_migrator em .env.ops
```

`db:migrate` aplica migrations pendentes pelo migrator Drizzle ORM com o mesmo diretório/journal, exige `marvin_migrator` e reaplica os grants explícitos de runtime. Veja o [ADR 0012](adr/0012-database-runtime-and-migration-roles.md); não há fallback para a conexão Web. Drizzle Kit permanece para geração de migrations. As migrations `0000_mvp_financial_schema.sql` e `0001_forecasts_revisions.sql` são SQL versionado, registradas em `migrations/meta/_journal.json` na ordem correspondente. Migrations já aplicadas não devem ser reescritas.

Para uma mudança de schema, crie uma nova migration SQL incremental, atribua a próxima versão e mantenha o journal consistente. Revise e teste o upgrade em PostgreSQL de desenvolvimento e a aplicação em uma base/schema vazio antes de qualquer deploy. Não gere nem aplique uma migration cegamente: o diretório `migrations/meta` contém apenas `_journal.json`, sem snapshots Drizzle. Embora o script `db:generate` exista, seu uso requer preparar e revisar os snapshots/baseline adequados primeiro; sem isso, a geração pode propor recriar o schema inicial. Esse fluxo de geração não foi validado neste gate. A suíte de integração aplica as migrations a um schema descartável; não houve migration em banco persistente nem implantação.

## Integridade e concorrência

- Todas as FKs financeiras usam `ON DELETE RESTRICT`; histórico não é apagado em cascata.
- Valores monetários usam `BIGINT`; o adapter os entrega como `bigint` JavaScript.
- Cada valor persistido continua limitado ao `BIGINT` assinado. Agregações SQL usam `SUM(BIGINT)` sem cast de volta a `BIGINT` (PostgreSQL retorna `numeric` para essa soma); derivados no domínio e DTOs de leitura aceitam inteiros maiores como strings. Isso cobre saldos, crédito disponível, relatórios e totais de cobrança/pagamento sem ampliar valores graváveis.
- Entradas de conta, itens de fatura, pagamentos, transações, alocações e revisões são append-only. Correções financeiras exigem revisões ou lançamentos compensatórios rastreáveis.
- Cada operação de domínio roda em transação PostgreSQL `SERIALIZABLE`, com retry limitado para `serialization_failure` e deadlock.
- A tabela `idempotency_claims` reserva a chave dentro da mesma transação que grava os resultados. Guarda hash SHA-256 de payload canônico e o resultado serializado, não o payload original. Repetições iguais recebem o resultado persistido; payloads divergentes retornam `IDEMPOTENCY_CONFLICT`.
- Pagamentos bloqueiam a transferência e a fatura antes de somar alocações existentes. Reembolsos bloqueiam a despesa original antes de somar créditos existentes.
- Ciclos de fatura bloqueiam a linha do cartão antes de verificar sobreposição. A constraint de vencimento exige `due_on >= closing_on`.

Constraints entre tabelas e triggers também protegem escritas SQL diretas para pagamentos, reembolsos, ciclos sobrepostos, tipo/moeda de previsão, realização coerente, reversão única e transições de previsão. Previsões preservam valor/datas, não podem ser apagadas e só saem de `projected` para `realized` ou `cancelled`. Escritas financeiras pela aplicação devem usar `FinanceRepository.transaction`; clientes SQL diretos não substituem validações do domínio. A migration não provisiona a base nem executa automaticamente em deploy.

## Testes

```bash
DATABASE_URL_TEST='postgresql://<user>:<password>@<host>:5432/<database_descartavel>' pnpm --filter @finance/db test
```

O teste exige uma base PostgreSQL descartável com permissão para criar e remover schemas. Cria um schema aleatório isolado, aplica todas as migrations SQL em ordem (sem reescrever `0000`, já aplicada em ambientes anteriores) e o remove ao terminar. Exercita o `FinanceService` real, concorrência de realizações/reversões, ordenação de revisões, migração sequencial e triggers append-only de lançamentos/alocações/previsões. Não configure `DATABASE_URL_TEST` para uma base com dados de usuário. Sem essa variável, o teste de integração é marcado como skipped.

Validação executada neste checkpoint: PostgreSQL 18.6 descartável sob `/tmp`, acessível somente por loopback, e teste de integração aplicado a schema isolado, removido ao fim. `DATABASE_URL_TEST=... pnpm --filter @finance/db test` passou com 1 integração e 0 skipped. Nenhuma base de usuário foi usada. Nenhuma migration foi aplicada a banco persistente; deploy não foi validado aqui. O ensaio descartável de backup/restore passou, conforme [docs/recovery-validation.md](recovery-validation.md); backup/restore em produção ou no homelab continuam não validados.

## Migration 0002 — BRL-only

A migration `0002_brl_only.sql` estabelece BRL como a única moeda suportada para contas e previsões. Antes de adicionar as constraints, executa um preflight; se existir qualquer registro com outra moeda (por exemplo, EUR), aborta com `BRL migration blocked`. Não converte nem remove dados. Resolva os registros explicitamente antes de aplicar a migration.

O preflight e a adição das constraints devem ser executados em uma transação para que uma falha preserve o esquema e os dados existentes. Esta documentação descreve o comportamento da migration versionada; não indica que ela foi aplicada em ambiente de produção.

## Carga inicial de categorias

Depois de aplicar as migrations, `pnpm db:bootstrap-categories` usa `DATABASE_URL` para cadastrar as 14 categorias básicas em uma transação. O comando pode rodar em produção e ser repetido; preserva registros existentes, incluindo categorias arquivadas, e não cria dados financeiros fictícios. A identificação considera nome sem diferença de caixa/espaços externos, tipo e categoria raiz. Um bloqueio da tabela serializa escritas durante a carga, sem nova constraint ou migration. Execução via Compose em [deployment.md](deployment.md). O teste de integração cobre replay concorrente, preservação de dados e rollback em PostgreSQL descartável.

### Categoria de ajuste de fatura

A migration `0004_statement_adjustment_category` inicializa a categoria raiz de
despesa `Ajuste de fatura`, preservando uma categoria existente de mesmo nome
normalizado e tipo. O bootstrap de categorias também a inclui para ambientes de
desenvolvimento que tenham limpado o catálogo. Esta migration cria somente a
categoria; o fluxo de lançamento usa a categoria ativa conforme ADR 0014.

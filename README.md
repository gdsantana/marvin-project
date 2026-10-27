# marvin-project — Controle Financeiro Pessoal

Aplicação pessoal de finanças, com UI web em pt-BR, API HTTP e servidor MCP separado para Hermes. O monorepo pnpm contém domínio, persistência PostgreSQL, UI, API, MCP, migrations e Compose. O gate local aprovou typecheck, lint, 35 testes sem skips, build, E2E dev/produção, recovery e validação visual. Docker build e deploy no homelab não foram executados porque o Docker socket está inacessível neste ambiente. Consulte a [auditoria do MVP](docs/verification.md).

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

A refatoração passou por typecheck, lint, build, 35 testes sem skips e integração de produção. Evidências e limites da validação de interface estão em [docs/ui-validation.md](docs/ui-validation.md).

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

Requer Node.js, pnpm 12 e, para os fluxos da aplicação, PostgreSQL configurado por `DATABASE_URL`. Scripts e nomes de comandos abaixo correspondem aos `package.json` atuais:

```bash
pnpm install
pnpm dev:web
pnpm dev:mcp
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` percorre os workspaces que têm script de teste. O gate atual executou `bash scripts/test-postgres.sh` (35 aprovados, 0 skips), `pnpm typecheck`, `pnpm lint`, `bash scripts/validate-recovery.sh`, E2E dev, build serial e E2E produção; todos passaram. A ordem E2E dev → build → produção é necessária porque Next dev substitui `.next`. Veja [docs/integration-validation.md](docs/integration-validation.md) e [docs/verification.md](docs/verification.md) para evidências e comandos.

Variáveis para Compose estão exemplificadas em [.env.example](.env.example), incluindo `APP_ORIGIN` e `WEB_PASSWORD_HASH` consumidos pelo login. Nunca comite `.env`, segredos ou dumps.

## Invariantes principais

- Dinheiro é inteiro em unidades mínimas; saldo deriva do saldo inicial e de `account_entries`.
- Transferências próprias e pagamento de fatura não são despesas novas.
- Compra parcelada cria uma dívida integral e parcelas de fatura que somam exatamente o total.
- Receitas, despesas, projeções de fatura e saldos são separados por moeda; não há câmbio.
- MCP não acessa PostgreSQL nem mantém regras contábeis próprias.

O conjunto exigido de cenários está em [docs/data-model.md §11](docs/data-model.md#11-testes-de-aceitação-de-domínio--obrigatórios-antes-de-produção); evidências e lacunas estão em [docs/verification.md](docs/verification.md).

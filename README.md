# marvin-project — Controle Financeiro Pessoal

Repositório remoto atual: [gdsantana/daiko-project](https://github.com/gdsantana/daiko-project). O nome local é `marvin-project`.

Aplicação web **self-hosted**, pessoal e mobile-first, com lançamentos manuais e integração com um **Hermes Agent** por meio de um servidor **MCP**. A interface web e o agente utilizam a mesma API e as mesmas regras financeiras.

> **Estado do projeto:** planejamento e preparação do monorepo. Este documento é o README inicial, **não uma afirmação de que a aplicação já está implementada**.

## Objetivos

- Controlar múltiplas instituições, contas correntes, poupanças e cartões de crédito.
- Registrar receitas (salário, rendimentos, cashback), despesas (Pix, débito, crédito), transferências e estornos.
- Controlar compras parceladas e faturas: fechamento, vencimento, créditos e pagamentos parciais.
- Oferecer orçamentos e relatórios por conta, categoria, período e moeda.
- Permitir operações estruturadas via Hermes/MCP, com validação, confirmação quando necessário e idempotência.
- Executar no homelab, com acesso restrito à rede local ou por VPN/Tailscale.

## Investimentos — evolução futura

Planejar contas de investimento, aplicações, posições, resgates, vencimentos, proventos e avaliações patrimoniais, com consultas e lançamentos via Hermes. **Não implementado e fora do bootstrap/MVP atual.** Aportes não são despesas; retorno do principal não é receita; caixa e posições são separados para evitar dupla contagem. Ver [modelagem, §17](docs/data-model.md#17-investimentos--proposta-futura) e [ADR](docs/adr/0001-investment-accounting.md).

## Stack definida (a implementar)

| Área | Tecnologia |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| Backend/API | Node.js, Next.js Route Handlers |
| UI | Tailwind CSS, shadcn/ui |
| Banco de dados | PostgreSQL |
| ORM e migrations | Drizzle ORM / Drizzle Kit |
| Integração de agentes | Servidor MCP em Node.js/TypeScript |
| Workspace | pnpm Workspaces |
| Hospedagem | Docker Compose no homelab |

**Não há necessidade inicial de Turborepo**, autenticação multiusuário, sincronização bancária automática ou dependências para investimentos. Essas decisões poderão mudar mediante ADR.

A decisão está registrada no [ADR 0002](docs/adr/0002-application-stack.md). Web e MCP utilizarão os mesmos contratos HTTP; as regras financeiras permanecerão no domínio compartilhado. A stack está definida, mas ainda não instalada.

## Deploy definido (a implementar)

Docker Compose no homelab, com três serviços permanentes em containers separados: `web` (frontend + API Next.js), `mcp` e `db` (PostgreSQL). Banco sem porta publicada, redes separadas, reverse proxy privado e volume persistente com backup externo. Migrations serão executadas uma vez por deploy, em etapa temporária. Ver [plano de deploy](docs/deployment.md) e [ADR 0003](docs/adr/0003-homelab-deployment.md). Configuração e deploy ainda não implementados.

## Organização do repositório (alvo)

```text
.
├── apps/
│   ├── web/                  # Next.js: UI + API HTTP
│   └── mcp/                  # Adaptador MCP → API HTTP
├── packages/
│   ├── contracts/            # Tipos/schemas de API compartilhados
│   ├── domain/               # Casos de uso e regras financeiras
│   └── db/                   # Drizzle, migrations e repositórios PostgreSQL
├── docs/
│   ├── data-model.md        # Handoff de modelagem financeira
│   ├── api.md               # Contratos da API (quando existirem)
│   ├── mcp.md               # Ferramentas MCP (quando existirem)
│   ├── deployment.md        # Plano de deploy e backup
│   ├── flows/               # Fluxos de negócio complexos
│   └── adr/                 # Architecture Decision Records
├── infra/
│   ├── compose.yml          # Serviços web, mcp e postgres
│   └── docker/
├── ARCHITECTURE.md
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

## Documentação

1. [ARCHITECTURE.md](./ARCHITECTURE.md): visão de execução, limites dos pacotes e decisões estruturais.
2. [AGENTS.md](./AGENTS.md): instruções para agentes de programação.
3. [docs/data-model.md](./docs/data-model.md): handoff de modelagem e fonte de verdade dos modelos e invariantes financeiros; revisar **antes da implementação das entidades**.
4. `docs/adr/`: motivos e consequências de decisões técnicas.

Os documentos específicos de API, MCP e deploy só devem descrever comportamentos efetivamente implementados, distinguindo claramente contratos **propostos** de contratos **ativos**.

## Como desenvolver (após o bootstrap)

O agente de bootstrap deverá fornecer scripts reais no `package.json`. Os comandos-alvo são:

```bash
pnpm install
pnpm dev:web
pnpm dev:mcp
pnpm typecheck
pnpm lint
pnpm build
```

O agente deverá revisar os nomes dos scripts e garantir que os comandos acima correspondam à configuração criada. Se uma etapa ainda for indisponível, documentar o motivo em vez de apresentar um comando que falha silenciosamente.

Criar `.env.example` com nomes de variáveis, **nunca credenciais reais**. Não versionar `.env`, tokens, senhas ou dumps financeiros.

## Regras financeiras resumidas

- Armazenar dinheiro em unidades mínimas inteiras (`BIGINT`), nunca `float`.
- Pix e débito na mesma conta bancária movimentam o mesmo saldo.
- Cartão de crédito é uma conta de passivo, com saldo assinado negativo quando existe dívida.
- Compra parcelada reconhece a dívida total **uma única vez** na compra; parcelas distribuem a cobrança por fatura, sem debitar o passivo novamente.
- Pagamento de fatura é **transferência entre contas**, não nova despesa.
- Receitas são separadas de reembolsos e transferências próprias.
- Orçamento mensal e posição patrimonial são perspectivas diferentes; não misturar somatórios de compras integrais e parcelas.
- O backend, e não o Hermes, determina os cálculos e validações finais.

Ver especificações completas no handoff de modelagem.

## Escopo da primeira etapa

O primeiro trabalho de um agente implementador é **criar o scaffolding do monorepo, instalar/configurar ferramentas de desenvolvimento, copiar a documentação e validar que os pacotes compilam**. Não criar migrations financeiras ou entregar o produto como funcional até que o modelo e as decisões abertas sejam revisados.

## Status de documentação

- [x] Visão e arquitetura propostas
- [x] Handoff de modelagem produzido separadamente
- [ ] Monorepo inicializado
- [ ] Migrations revisadas
- [ ] Interface web funcional
- [ ] MCP conectado ao Hermes
- [ ] Deploy validado no homelab

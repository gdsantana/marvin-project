# Prompt para agente — Bootstrap do monorepo marvin-project

Você é um engenheiro full-stack sênior responsável por **inicializar a estrutura de um monorepo TypeScript** para um aplicativo de controle financeiro pessoal self-hosted. Execute as alterações no repositório recebido.

## Contexto

O projeto terá:

- Aplicação Next.js responsiva (desktop/mobile), UI em pt-BR, Tailwind CSS e shadcn/ui.
- Servidor MCP Node.js/TypeScript integrado posteriormente a um Hermes Agent no homelab.
- API HTTP como **única porta de escrita** do domínio financeiro.
- PostgreSQL + Drizzle ORM e migrations versionadas.
- pnpm Workspaces; **não instalar Turborepo** nesta etapa.
- Deploy futuro em Docker Compose, acessível pela LAN/VPN/Tailscale.

Os arquivos `README.md`, `ARCHITECTURE.md` e `AGENTS.md` fornecidos são **documentação normativa** para este bootstrap. Também será fornecido um handoff de modelagem financeira que deve ser colocado em `docs/data-model.md`. Se esse handoff estiver ausente, não o invente; informe o bloqueio somente para atividades de modelagem, mas prossiga com scaffold neutro.

## Antes de criar

1. Inspecione o repositório, o estado do Git e os arquivos existentes.
2. Preserve alterações do usuário e não sobrescreva arquivos existentes incompatíveis sem perguntar.
3. Leia os três documentos de arquitetura/instruções e o handoff do banco (se presente).
4. Não execute comandos destrutivos nem faça deploy.

## Tarefa: criar organização de pastas

Monte a estrutura abaixo (com configurações reais mínimas, não apenas pastas vazias):

```text
apps/
  web/                 # Next.js App Router, TypeScript, Tailwind, shadcn base
  mcp/                 # Serviço MCP TypeScript, health check, sem escrita financeira
packages/
  contracts/           # DTOs/tipos compartilhados, sem dependências de apps
  domain/              # Interfaces/serviços puros em placeholders
  db/                  # Config Drizzle/PostgreSQL em placeholders, sem tabelas financeiras
infra/
  compose.yml          # Estrutura dev de web, mcp e postgres; envs externas
  docker/              # Dockerfiles pertinentes, se viável nesta fase
docs/
  data-model.md        # Copiar handoff fornecido, quando disponível
  api.md               # Marcar como contrato planejado
  mcp.md               # Marcar como contrato planejado
  deployment.md        # Processo local proposto
  flows/
  adr/
README.md
ARCHITECTURE.md
AGENTS.md
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
.env.example
.gitignore
```

## Configuração esperada

1. Configure `pnpm-workspace.yaml` com `apps/*` e `packages/*`.
2. Crie `package.json` por workspace, scripts da raiz (`dev:web`, `dev:mcp`, `build`, `typecheck`, `lint`) e configurações TypeScript consistentes.
3. Defina nomes como `@finance/contracts`, `@finance/domain`, `@finance/db` e referências workspace (`workspace:*`) conforme necessário.
4. Faça a aplicação Next.js inicial renderizar uma home de placeholder clara, sem inventar produtos financeiros já implementados.
5. Faça o serviço MCP iniciar de maneira verificável com endpoint de saúde ou tool **somente leitura** de demonstração; sem acessar banco.
6. Prepare Drizzle com conexão/configuração de ambiente, mas **não crie nem execute migrations de contas, transações ou faturas** até a modelagem ser revisada.
7. Configure Compose para infraestrutura de desenvolvimento, com PostgreSQL privado, volume persistente e variáveis em `.env.example`. Não inclua credenciais reais nem exponha porta de banco publicamente por padrão.
8. Adicione um ADR inicial para a escolha pnpm + monorepo, outro para MCP → API HTTP e outro para separação `domain`/`db`.
9. Atualize README com comandos que realmente existam; diferencie o que funciona do que será implementado futuramente.

## Restrições de arquitetura

- `apps/mcp` chama a API HTTP do `apps/web`; nunca importa `packages/db` nem escreve no PostgreSQL diretamente.
- `packages/domain` não importa Next.js, Drizzle nem código das apps; define interfaces de repositório.
- `packages/db` implementa persistência; `apps/web` compõe serviços do domínio e repositórios.
- `packages/contracts` pode ser utilizado na web e no MCP; não deve expor secrets ou objetos ORM.
- Não implemente fluxo de compra parcelada, pagamentos, salário, cashback, transferências ou saldo real nesta etapa.
- Não faça autenticação multiusuário, sincronização bancária, migrations financeiras, integrações externas ou deploy ao homelab agora.
- Preserve dados e arquivos existentes. Caso dependa de conexão à internet/instalação de pacotes, siga as permissões do ambiente e reporte falhas.

## Verificação e entrega

Depois de criar o scaffold:

1. Instale dependências usando pnpm, se autorizado pelo ambiente.
2. Execute scripts de `typecheck`, `lint` e `build`; corrija problemas de configuração.
3. Faça uma verificação segura de inicialização da web e do MCP, sem publicar serviços externamente.
4. Mostre a árvore final de diretórios com os arquivos relevantes.
5. Liste os comandos exatos para iniciar web, MCP e Postgres em desenvolvimento.
6. Relate o que foi criado, o que foi apenas preparado, verificações efetuadas e próximos passos.
7. Se faltar decisão substantiva ou documento de modelagem, pergunte em vez de presumir.

**Critério de sucesso:** monorepo consistente, workspaces resolvidos, scripts funcionais, documentação na posição correta e infraestrutura de desenvolvimento preparada — sem lógica financeira implementada prematuramente.

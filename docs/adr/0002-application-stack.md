# ADR 0002 — Stack da aplicação e contratos compartilhados

- Data: 2026-10-25
- Status: aceito; implementação pendente.

## Contexto

Aplicativo pessoal, privado e self-hosted, com interface responsiva em pt-BR e integração Hermes/MCP. A manutenção por uma pessoa favorece poucos serviços e uma linguagem compartilhada, com domínio financeiro independente de frameworks.

## Decisão

- Frontend: Next.js App Router, React e TypeScript; Tailwind CSS e shadcn/ui para componentes. Desenvolvimento mobile first obrigatório: classes Tailwind sem prefixo para a base mobile, com variantes responsivas para expandir a interface em telas maiores.
- Backend: Node.js com API HTTP em Next.js Route Handlers, dentro de `apps/web`; monólito modular, sem servidor de API separado inicialmente.
- Banco: PostgreSQL, com Drizzle ORM e Drizzle Kit; migrations SQL versionadas e revisadas.
- Integração: servidor MCP Node.js/TypeScript em `apps/mcp`, separado, chamando a API HTTP autenticada.
- Organização: pnpm Workspaces e Docker Compose, conforme arquitetura existente.

Navegador e MCP consumirão os mesmos contratos de entrada, saída e erros definidos em `packages/contracts`, com validação em runtime nos limites. A autenticação será específica de cada cliente: sessão web e credencial própria do MCP. Regras ficam em `packages/domain`; persistência em `packages/db`; composição em `apps/web`. Código de servidor do Next.js pode chamar os mesmos casos de uso diretamente, preservando validação, autorização e idempotência, sem uma chamada HTTP interna obrigatória.

shadcn/ui distribui código de componentes que passa a integrar o projeto. Adicionar apenas componentes necessários em `apps/web`, mantendo customizações, acessibilidade e dependências explícitas. Não criar pacote de UI compartilhado sem outro consumidor real. Referência: [documentação oficial](https://ui.shadcn.com/docs).

## Alternativas e motivos

- React/Vite com API independente: viável para dashboard privado, mas exige outro servidor de aplicação desde o início. Next.js reúne UI e HTTP no mesmo deploy.
- Vue/Nuxt: alternativa válida; manter React/Next.js preserva a direção já escolhida, sem requisito que justifique troca.
- Fastify/NestJS ou backend em outra linguagem: considerar se surgirem necessidades independentes; não adicionar fronteira operacional agora.
- SQLite: operação mais simples, mas PostgreSQL foi escolhido para relações, constraints e controle concorrente das escritas web/agente.
- MySQL/MariaDB: viáveis; sem vantagem específica identificada que justifique mudar PostgreSQL.
- Prisma ou SQL direto: viáveis; Drizzle mantém schema tipado e acesso próximo de SQL, com migrations revisáveis.

## Consequências e limites

Será necessário respeitar fronteiras servidor/cliente, configurar cache de dados financeiros conscientemente e manter os componentes incorporados do shadcn/ui. Drizzle não substitui regras de domínio, constraints ou controle transacional. Dinheiro permanece inteiro; quantidades e taxas futuras exigirão precisão decimal explícita, inclusive nos contratos.

Não adicionar serviços de fila, cache ou workers sem necessidade concreta. Processamentos demorados poderão ganhar worker separado quando seu escopo existir. Login web por senha local e sessão está definido no ADR 0004; autenticação MCP permanece separada, com detalhes adiados. Versões exatas e biblioteca de validação serão definidas na implementação; nenhuma dependência é instalada por este ADR. Esta decisão não autoriza funcionalidades financeiras ou migrations nesta etapa.

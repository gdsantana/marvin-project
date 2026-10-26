# Instruções para agentes de programação — marvin-project

Este arquivo governa contribuições de agentes neste monorepo. Aplica-se a toda a árvore, salvo instruções mais específicas explicitamente fornecidas pelo mantenedor.

## 1. Antes de alterar código

1. Inspecione o estado atual do repositório e preserve alterações existentes; não sobrescreva arquivos ou remova dados sem autorização.
2. Leia `README.md`, `ARCHITECTURE.md` e o documento de modelagem em `docs/data-model.md` **quando disponível**.
3. Leia os ADRs pertinentes antes de modificar stack, dependências, persistência ou fluxos financeiros.
4. Identifique se a tarefa é **documentação/scaffolding**, **implementação**, **revisão** ou **diagnóstico**; não amplie o escopo silenciosamente.
5. Se o handoff financeiro não tiver sido anexado ou copiado para `docs/data-model.md`, sinalize a ausência antes de implementar entidades financeiras.

## 2. Objetivo e premissas

- Projeto pessoal, privado e self-hosted no homelab.
- Interface Next.js responsiva e servidor MCP para Hermes em execução separada.
- TypeScript, pnpm Workspaces, PostgreSQL e Drizzle propostos.
- Uma pessoa usuária inicialmente; não implementar multi-tenant sem pedido.
- UX em pt-BR; código, campos e contratos preferencialmente em inglês.

## 3. Fronteiras arquiteturais obrigatórias

- `apps/web` concentra UI e API HTTP.
- `apps/mcp` expõe ferramentas MCP e chama API HTTP autenticada.
- `packages/contracts` define tipos/schemas públicos e erros tipados.
- `packages/domain` contém regras financeiras e declara interfaces de persistência.
- `packages/db` implementa repositórios, schema Drizzle e migrations.
- `packages/domain` **não** importa Drizzle, Next.js ou `apps/*`.
- `packages/db` implementa as portas do domínio; `apps/web` injeta implementações.
- `apps/mcp` **não pode** importar `packages/db`, executar SQL ou manter cálculos financeiros próprios.
- Código cliente do Next.js **não** acessa `db` nem secrets.
- Evite importações circulares, imports profundos entre pacotes e duplicação de regras.

## 4. Invariantes financeiros: nunca violar

1. Dinheiro sempre em inteiros de unidades mínimas; proibir cálculos financeiros com `float`.
2. Saldo atual deriva de saldo inicial e movimentações (`account_entries`), não de campo mutável duplicado.
3. Pix/débito movimentam a conta corrente correspondente; método de pagamento não é nova conta.
4. Cartão de crédito é passivo assinado: compras diminuem saldo, pagamentos e créditos aumentam.
5. Transferência entre contas próprias **não é** receita nem despesa.
6. Pagamento da fatura **não é** despesa nova.
7. Compra parcelada: **uma compra, uma entrada patrimonial negativa integral, N itens de fatura**; soma exata dos itens = total original.
8. Alocação mensal das parcelas não deve duplicar a alocação integral da compra.
9. Separar data da compra, data de postagem bancária, competência da fatura e data do pagamento.
10. Salários/rendimentos/cashback podem ser receita; reembolsos reduzem a categoria original; Pix recebido exige classificação pelo contexto.
11. Não agregar moedas diferentes sem taxa de câmbio explícita.
12. Todas as escritas multi-row financeiras devem ser atômicas e idempotentes quando disparadas por agentes.

## 5. Contratos, segurança e privacidade

- Não implementar MCP com acesso SQL genérico ou direto ao PostgreSQL.
- Não confiar em campos inferidos pelo LLM sem validação no backend.
- Não registrar credenciais, tokens, mensagens privadas ou payloads financeiros completos em logs por padrão.
- `.env.example` pode ser versionado; `.env` real, secrets, dumps e backups não.
- Ferramentas MCP de escrita exigem autenticação própria e chaves de idempotência.
- Confirme informações ambíguas antes de criar valores financeiros irrecuperáveis.
- Use validação em runtime nos limites HTTP/MCP, além da tipagem TypeScript.

## 6. Convenções do monorepo

- Use pnpm Workspaces; um lockfile na raiz.
- Sem Turborepo e sem novos frameworks a menos que justificados.
- Workspaces sugeridos: `@finance/contracts`, `@finance/domain`, `@finance/db`.
- Adicione arquivos apenas ao workspace responsável.
- Prefira dependências explícitas nos `package.json` dos workspaces.
- Não altere arquitetura de deploy, banco ou autenticação sem ADR e aprovação quando relevante.
- Nomes de funções/tipos claros; tipos de dinheiro e datas explícitos.

## 7. Procedimento para novas funcionalidades

1. Localize e cite a seção relevante em `docs/data-model.md` e `ARCHITECTURE.md`.
2. Defina contrato de entrada/saída em `packages/contracts`.
3. Desenvolva regra/serviço em `packages/domain` com validações.
4. Implemente persistência/migrations em `packages/db` se necessário.
5. Exponha endpoint no servidor `apps/web`.
6. Se houver necessidade de linguagem natural, exponha tool tipada em `apps/mcp` que chame a API.
7. Verifique cenários de saldo, fatura, transferência, arredondamento, duplicatas e concorrência aplicáveis.
8. Atualize documentação e o ADR pertinente.

## 8. Política de alteração do banco

- Não executar migrations destrutivas nem apagar dados de usuário sem autorização explícita.
- Usar migrations versionadas, constraints reais e índices adequados.
- Criar/adaptar migrations em ambiente de desenvolvimento antes de produção.
- Faturas encerradas/histórico financeiro não devem ser reescritos silenciosamente.
- Guardar valores inteiros e preservar moeda em cada conta.

## 9. Verificação mínima de mudanças

- Rodar typecheck, lint e build nos workspaces afetados quando configurados.
- Em alterações financeiras, validar ao menos casos de receita, despesa, transferência, crédito, parcelamento, pagamento parcial e idempotência.
- Não alegar que testes passaram se não foram executados.
- Não adicionar suite/framework pesado de testes sem necessidade; testes de invariantes financeiros são prioritários.
- Informar falhas, comandos executados e decisões pendentes na entrega.

## 10. Documentação e handoff

Atualize:

- `ARCHITECTURE.md` para limites, topologia e composição.
- `docs/data-model.md` para entidades/invariantes.
- `docs/api.md` para endpoints implementados.
- `docs/mcp.md` para ferramentas MCP implementadas.
- `docs/deployment.md` para containers, rede, backup e variáveis.
- `docs/adr/NNNN-*.md` para decisões arquiteturais duráveis.

**Não documente como implementado o que ainda é apenas proposto.** Ao terminar, resuma arquivos alterados, verificação, decisões abertas e próximo passo seguro.

## 11. Escopo especial: bootstrap do monorepo

Quando a solicitação for apenas **organizar diretórios e configurar o monorepo**:

- Crie scaffold dos workspaces, scripts e configurações de TypeScript/lint/build.
- Crie um Next.js inicial e um MCP mínimo com health check, sem ferramentas de escrita financeira reais.
- Coloque placeholders pequenos para domínio, banco e contratos, sem migrations financeiras prematuras.
- Disponibilize `.env.example`, `.gitignore`, Compose básico e README operacional.
- Preserve estes documentos e prepare `docs/` com referências e ADRs iniciais.
- **Não implemente lançamentos, faturas, integrações bancárias, login complexo ou deploy real nesta fase.**


## 12. Investimentos — regras para implementação futura

- Antes de alterar regras financeiras, consultar `docs/data-model.md`, incluindo §17, `ARCHITECTURE.md` §12 e o ADR `docs/adr/0001-investment-accounting.md`; resolver as decisões pertinentes antes de implementar.
- Aporte entre contas próprias não é despesa; resgate integral não é integralmente receita. Separar principal, resultado realizado, taxas e impostos.
- Compra de ativo converte caixa em posição; nunca somar o ativo novamente ao saldo disponível da conta `investment`.
- Preservar quantidade e custo de aquisição remanescentes em vendas/resgates parciais. Não escolher silenciosamente método de custo, valorização ou reconhecimento de rendimentos.
- Valorização não realizada não gera recebimento; rendimentos previamente reconhecidos não podem ser reconhecidos novamente no resgate.
- Preservar vínculos entre operações, lotes, transações e movimentações, com origem, datas, autoria e correções rastreáveis. Operações compostas devem ser atômicas, com idempotência e controle de concorrência.
- Classificação de ativos é independente das categorias de receitas/despesas; dinheiro permanece inteiro e quantidades/taxas usam precisão decimal explícita, nunca ponto flutuante binário.
- Hermes usa somente API HTTP autenticada via MCP; não inventar taxas, rendimentos ou vencimentos. Confirmar ambiguidades antes de escrever.
- Esta preparação documental não autoriza schema, migrations, endpoints, ferramentas MCP, UI, cotações, integrações ou cálculos automáticos de índices/tributos.

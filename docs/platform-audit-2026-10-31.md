# Auditoria da plataforma — 31/10/2026

> Diagnóstico histórico anterior às correções. Consulte [a entrega dos ajustes](platform-fixes-2026-10-31.md) e [a verificação atual](verification.md) para a situação posterior.

O projeto oferece controle financeiro pessoal via web e Hermes/MCP, com domínio compartilhado e persistência PostgreSQL. A análise assume uma pessoa usuária, com possibilidade de chamadas simultâneas da web, MCP e fechamento automático. Essa concorrência já importa mesmo sem múltiplos usuários.

Foram usados três subagentes `gpt-6-luna` para domínio/contratos, persistência e aplicações. O agente principal revisou as evidências, descartou falsos positivos, executou validações e consolidou este relatório. Nenhuma correção de implementação foi aplicada.

## Avaliação geral

A organização atual é adequada ao tamanho do projeto. MCP encaminha operações para a API, domínio não depende de Next/Drizzle e persistência implementa a porta do domínio. Dinheiro usa inteiros, parcelas somam o total, transferências/pagamentos não duplicam despesas e há histórico compensatório e idempotência transacional. Essas escolhas devem ser preservadas.

Os problemas mais relevantes estão na semântica temporal, na divergência entre preview e gravação e na composição das leituras. Há duplicação concreta dentro do domínio, embora as regras não estejam espalhadas por serviços independentes. A recomendação é corrigir esses pontos no monólito modular existente, sem novos frameworks ou serviços.

P1 significa corrigir antes de distribuir imagens ou confiar nos saldos históricos; P2 significa corrigir na próxima rodada de consistência; P3 significa melhoria de manutenção. Uma reprodução com adapter em memória comprova a lógica executada pelo serviço, mas não substitui uma integração PostgreSQL.

## Corrigir primeiro

### 1. P1 — O build Docker pode incorporar segredos e arquivos locais

**Evidência:** `infra/docker/web.Dockerfile:11` executa `COPY . .`; não há `.dockerignore` na raiz. O contexto é a raiz do repositório em `infra/compose.yml`. `.gitignore` não filtra o contexto Docker.

**Problema e cenário:** construir a imagem com `.env`, `.env.local`, `.git`, dependências ou backups locais presentes copia esses arquivos para a imagem/camadas. O build web desta auditoria detectou um arquivo de ambiente local; seu conteúdo não foi inspecionado. A inclusão indevida decorre do Dockerfile, sem afirmar que alguma imagem já tenha sido publicada ou vazada.

**Correção mínima:** adicionar `.dockerignore` para secrets, Git, dependências, builds e dados locais, e preferir cópia explícita dos diretórios necessários. Uma etapa final de runtime com apenas os artefatos necessários reduz também o tamanho e a superfície da imagem.

**Validação:** construir com um arquivo marcador fictício e verificar sua ausência no contexto/imagem, incluindo camadas. Não usar segredos reais nesse teste. Sem correção, qualquer pessoa com acesso à imagem poderá recuperar arquivos que entraram nela.

### 2. P1 — Relatórios anteriores à abertura incluem saldo inicial futuro

**Evidência:** `packages/domain/src/index.ts:390`, `:396`, `:467`; modelo §4.2. Os três caminhos somam `openingBalanceMinor` independentemente da data de corte.

**Problema e reprodução:** conta aberta em 01/10 com saldo inicial de 10.000 unidades mínimas retorna 10.000 ao consultar 30/09. Reproduzido no serviço com adapter mínimo. O endpoint de resumo aceita períodos históricos, portanto o patrimônio de setembro pode incluir dinheiro de uma conta ainda não aberta.

**Correção mínima:** centralizar o cálculo de saldo em uma função interna que só aplique saldo inicial e movimentos a partir de `openingDate`. Para corte anterior, retornar zero ou omitir a conta no agregado, documentando a decisão. Reutilizar a mesma regra em saldo individual, lista e agregado por moeda.

**Validação:** cortes antes, no dia e depois da abertura, com lançamentos posteriores; cobrir também o endpoint de resumo. Sem correção, comparações históricas de patrimônio ficam erradas.

## Corrigir a consistência das regras

### 3. P2 — Preview da compra mostra vencimento diferente da fatura efetiva

**Evidência:** `packages/domain/src/index.ts:581` calcula parcelas pelas configurações atuais; `:690` reutiliza a fatura persistida no commit.

**Problema e reprodução:** fatura aberta fecha em 20/10 e vence em 30/10; o cartão tem template de vencimento dia 28. Para compra em 10/10, o preview informa 28/10 e o commit usa a fatura de 30/10. Reproduzido em memória com `createStatement`, preview, compra e consulta da fatura.

**Correção mínima:** usar um resolvedor de ciclo que retorne a fatura existente com suas datas ou um plano para nova fatura. Preview e commit consomem esse resultado; a gravação continua revalidando dentro da transação. Não recalcular datas de faturas existentes.

**Validação:** preview/commit com fatura existente, mudança de configuração e parcelas em ciclos novos. Sem correção, a pessoa confirma um cronograma diferente do que será registrado.

### 4. P2 — Preview aprova estorno de despesa já revertida

**Evidência:** `createRefund` bloqueia despesa revertida em `packages/domain/src/index.ts:292`; o ramo de preview em `:607` não faz essa verificação.

**Problema e reprodução:** criar despesa avulsa, revertê-la e solicitar preview de estorno. O preview retorna movimentações válidas; a gravação falha com `INVALID_REFUND`. Reproduzido em memória. A gravação permanece protegida: o erro é de consistência da revisão apresentada.

**Correção mínima:** compartilhar a validação de elegibilidade e o plano do estorno entre preview e gravação, incluindo reversão anterior, valor remanescente e alocações efetivas.

**Validação:** a mesma entrada sobre despesa revertida deve ser recusada por ambos. Sem correção, web e Hermes podem apresentar uma operação impossível de confirmar.

### 5. P2 — Estorno no dia do fechamento pode entrar no ciclo anterior

**Evidência:** `packages/domain/src/index.ts:704` aceita fatura aberta com `closingOn >= statementDate`; `purchaseStatements` em `:683` desloca operações do dia do fechamento para o ciclo seguinte. O modelo §4.10 define fechamento como limite exclusivo.

**Problema e reprodução:** uma fatura manual continua aberta com fechamento em 20/10. Um estorno datado de 20/10 é direcionado a ela, enquanto uma compra nessa data pertence ao ciclo seguinte. Reproduzido em memória: o crédito foi associado à fatura com fechamento em 20/10.

**Correção mínima:** aplicar a mesma convenção de ciclo em compra e estorno, começando pela comparação estrita no limite de fechamento. Centralizar a seleção e distinguir uma eventual política explícita de crédito na próxima fatura disponível da regra de calendário.

**Validação:** estornos na véspera, no dia e após o fechamento, incluindo `postedOn` e modo manual. Sem correção, cobranças e créditos usam fronteiras diferentes para a mesma data.

### 6. P2 — Resumo mensal combina snapshots independentes

**Evidência:** `packages/domain/src/index.ts:544` executa `monthlyReport` e `balancesByCurrency` em paralelo; cada um abre sua própria transação.

**Problema e cenário:** uma receita é confirmada entre os dois snapshots. O saldo final pode incluí-la e o total de receitas não. Cada transação pode ser serializável isoladamente e ainda assim a resposta conjunta não representar uma única visão do banco. Achado por inspeção; não foi executado ensaio PostgreSQL concorrente nesta auditoria.

**Correção mínima:** calcular o resumo em uma única `repository.transaction`, passando o mesmo `tx` para funções internas de leitura. Evitar transações aninhadas ou novas transações nos helpers.

**Validação:** teste de integração com barreira entre leituras e uma escrita concorrente. Sem correção, o resumo pode exibir totais e saldos de instantes diferentes.

### 7. P2 — Contrato multimoeda e interface assumem escalas diferentes

**Evidência:** `packages/contracts/src/index.ts:3` aceita qualquer código com três letras; `apps/web/src/components/finance-format.ts:1` e `:9` convertem e formatam sempre com escala 100 e duas casas. Os formulários também usam rótulos fixos em R$.

**Problema e cenário:** uma conta JPY é aceita pela API, mas 100 unidades mínimas são exibidas como `JPY 1,00`; moedas com três casas também ficam incorretas. Até códigos sem moeda real passam pela validação de formato. É uma incompatibilidade do suporte prometido com a apresentação, não um erro de ponto flutuante.

**Correção mínima:** definir explicitamente as moedas suportadas e suas escalas em um catálogo compartilhado. A alternativa menor é restringir a moedas de duas casas já suportadas e ajustar os rótulos à conta selecionada. Não adicionar câmbio.

**Validação:** BRL, uma moeda sem casas e uma com três casas, ou sua rejeição explícita se fora do escopo. Sem correção, valores aceitos podem ser interpretados em outra magnitude na UI.

### 8. P2 — Status de fatura não é derivado da situação atual

**Evidência:** `packages/domain/src/index.ts:325`, `:362`, `:385`, `:445`. Fechamento grava `closed`, pagamento grava `paid/partially_paid`, e a leitura retorna o status persistido. Não há caminho que derive `overdue` pela data. Modelo §4.10 pede coerência entre status e pagamentos.

**Problema e cenário:** uma fatura vencida e não paga continua `closed`; uma parcialmente paga continua `partially_paid` mesmo após vencer. Uma fatura cuja cobrança foi zerada por crédito também é fechada como `closed`, ficando na lista de não pagas da UI. O caso de crédito líquido exige decisão de apresentação e carregamento do crédito; não se deve inventar transferência automática.

**Correção mínima:** separar estado operacional de fechamento da situação derivada de cobrança/pagamento/vencimento. Um helper de leitura pode produzir a situação efetiva sem reescrever histórico. Definir explicitamente como exibir faturas sem valor a pagar.

**Validação:** aberta, fechada antes/depois do vencimento, parcialmente paga antes/depois, quitada, zerada e com crédito líquido. Sem correção, o usuário não identifica atraso corretamente pelo status.

## Simplificar e fortalecer a fonte única

### 9. P2 — Relatórios repetem regra contábil e fazem consultas por lançamento

**Evidência:** `packages/domain/src/index.ts:490` e `:513` repetem seleção de operações efetivas, exclusão de reversões, resolução de moeda, última revisão e sinais. Cada lançamento consulta entradas, contas, revisões e alocações. `apps/web/src/components/workspace.tsx:153` solicita seis ou doze resumos, além da distribuição por categoria.

**Problema e cenário:** ao abrir o relatório anual, o mesmo histórico é carregado repetidamente; a busca de reversão usa `allTransactions.some` para cada operação. Com o histórico de vários anos, o volume de consultas cresce muito mesmo com apenas uma pessoa. Alterar o tratamento de reversões ou créditos em somente um dos dois relatórios também os faria discordar.

**Correção mínima:** extrair uma projeção interna comum de operações econômicas efetivas e agregar por moeda, mês e categoria a partir dela. Buscar relações em lote e usar um conjunto de IDs revertidos. Expor série mensal em uma consulta de período para evitar doze reconstruções completas. Manter a regra de sinais no domínio; o banco pode buscar/agrupar dados sem criar outra interpretação contábil.

**Validação:** resumo e categorias devem reconciliar por moeda; parcelas contam uma vez; reembolsos/revisões/reversões preservam o resultado. Medir quantidade de consultas com histórico representativo antes de introduzir cache. Sem correção, a manutenção duplica trabalho e relatórios ficam progressivamente mais lentos.

### 10. P2 — A UI usa calendários e janelas de histórico inconsistentes

**Evidência:** `apps/web/src/components/workspace.tsx:30` usa data local para períodos; `:102` usa UTC para “hoje”; `:103` até `:106` limitam janelas de carregamento. O formulário usa `todayLocal` em `action-dialog.tsx:17`.

**Problema e cenário:** às 21h30 em São Paulo, o filtro UTC de transações já inclui amanhã, enquanto o formulário ainda usa hoje. Além disso, uma fatura não paga com vencimento anterior à janela de aproximadamente 120 dias desaparece da listagem; previsões anteriores ao ano atual também não são carregadas. Os registros continuam no banco, mas a UI não oferece consulta completa para eles.

**Correção mínima:** compartilhar funções de data civil e uma política explícita de timezone; adicionar filtro/paginação de histórico. Consultar pendências por status independentemente da antiguidade, sem depender apenas de janela de vencimento.

**Validação:** horário próximo à virada UTC, virada de ano, fatura atrasada há seis meses e previsão antiga ainda pendente. Sem correção, pendências e movimentações podem ficar invisíveis ou aparecer no dia errado.

### 11. P2 — O adapter de testes não respeita partes importantes da porta

**Evidência:** `packages/domain/src/index.test.ts:23` ignora `through` em `accounts.balance`; `:35` ignora o corte em `entries.listByAccount`. `MemoryRepository.transaction` executa o callback sem rollback.

**Problema e cenário:** um teste de saldo histórico pode somar movimentos posteriores ao corte; uma operação rejeitada após uma escrita pode deixar dados no fake, embora o PostgreSQL faça rollback. Não é correto inferir desses testes que o domínio preserva atomicidade ou cortes temporais em produção.

**Correção mínima:** implementar os cortes no fake e deixar explícito que ele não prova atomicidade; testar rollback e concorrência no adapter PostgreSQL. Se o fake continuar sendo usado para falhas após escrita, implementar restauração de snapshot nele. Criar poucos testes de contrato que ambos os adapters possam cumprir.

**Validação:** movimento posterior ao corte, falha após escrita parcial e replay concorrente no PostgreSQL. Sem correção, testes podem aprovar ou reprovar por comportamento diferente do adapter real.

### 12. P3 — Documentação normativa e estado implementado se contradizem

**Evidência:** `docs/data-model.md:3` declara proposta sem migrations executadas e §1.2 diz stack não implementada; README e ARCHITECTURE descrevem implementação e validações concluídas. A regra fornecida em AGENTS aponta investimentos em ARCHITECTURE §12, mas o documento atual os coloca na §10.

**Problema e cenário:** uma manutenção guiada pelo handoff pode tratar regras já implementadas como abertas, ou tomar evidências antigas de validação como resultado do checkout atual. A documentação também repete estado e contagens de testes em vários arquivos.

**Correção mínima:** manter `data-model.md` como fonte normativa de entidades/invariantes e ADRs como fonte de decisões; concentrar evidências datadas de execução em `verification.md`. README e arquitetura devem apontar para essa matriz, sem replicar contagens. Corrigir os links/seções e separar claramente investimento futuro de comportamento vigente.

**Validação:** revisão dos links e das afirmações de implementado/proposto. Sem correção, novas alterações podem partir de premissas incompatíveis.

## Riscos e decisões que não foram classificados como bugs públicos

- **Upsert na criação interna:** `CreateAccountCommand.id?` e `accounts.save` permitem reutilizar ID e alterar tipo, moeda ou abertura via chamada direta ao serviço (`domain/index.ts:109`, `db/repositories.ts:86`). O contrato HTTP omite ID, portanto não foi confirmado caminho público para isso. Preferir criação insert-only, rejeitando ID existente fora do replay; mudanças financeiras de abertura devem ter fluxo explícito. Não é necessário criar uma hierarquia de repositórios para resolver isso.
- **Rate limit global em memória:** `apps/web/src/server/auth.ts:79` usa uma chave única; cinco falhas bloqueiam também o titular por quinze minutos. O teste declara esse comportamento intencional. É um compromisso operacional de aplicação privada, não um bug financeiro. Se houver exposição mais ampla, aplicar limitação no proxy confiável e manter proteção global moderada; não confiar cegamente em `X-Forwarded-For` nem adicionar Redis apenas para o cenário atual.
- **Snapshots Drizzle ausentes:** o comando `db:generate` existe sem snapshots de baseline. O risco de recriar o schema já está documentado em `docs/migrations.md`; não é um achado novo. Manter migrations incrementais revisadas e resolver o baseline antes de usar geração automática.
- **Runtime de testes:** o gate depende de PostgreSQL 18.6 em um caminho temporário, enquanto o Compose usa por padrão 17.11. Padronizar preparação reproduzível e incluir a versão de produção nas integrações; não há bug de compatibilidade comprovado nesta auditoria.

## Aplicação de DRY e SOLID

| Responsabilidade | Fonte de verdade recomendada | Mudança pequena |
|---|---|---|
| Formato público e tipos de resposta | `packages/contracts` | UI deriva tipos com `Pick` e aliases; evitar cópias manuais de DTOs em `workspace-types.ts` e relatórios |
| Plano financeiro e elegibilidade | `packages/domain` | Funções internas por operação retornam plano usado pelo preview e commit; commit revalida em transação |
| Ciclos de fatura | `packages/domain` | Um resolvedor respeita datas persistidas e limite exclusivo do fechamento |
| Saldo em data de corte | `packages/domain` + consulta da porta | Um cálculo considera abertura e corte; PostgreSQL implementa a busca |
| Operações efetivas para análise | `packages/domain` | Uma projeção serve a resumo, série e categorias |
| Atomicidade e concorrência | Adapter PostgreSQL | Uma transação por operação/resposta consistente; constraints protegem integridade persistente |
| Moeda e escala | Catálogo compartilhado | UI formata conforme catálogo; contratos validam suporte |
| Data civil e apresentação | Helpers web compartilhados | Evitar misturar UTC e calendário local |

**SRP — responsabilidade única:** dividir preparação financeira, persistência do plano e projeções de leitura por motivos de mudança, sem fragmentar cada método em uma classe. `FinanceService` pode continuar como fachada.

**DIP — inversão de dependências:** a porta `FinanceRepository` já é uma boa aplicação e deve ser mantida. Compartilhar `tx` entre funções internas resolve a consistência sem acoplar domínio a Drizzle.

**ISP — segregação de interfaces:** helpers podem receber apenas as capacidades de `TransactionContext` que usam, com tipos locais. Não é preciso criar dezenas de interfaces de uma implementação.

**LSP — substituição de implementações:** o fake de testes deve respeitar a semântica de corte da porta. Garantias que ele não implementa devem ser comprovadas no PostgreSQL.

**OCP — extensão sem reescrita indevida:** os casos de uso explícitos atuais são adequados. Não há justificativa para motor genérico de regras, plugins de lançamentos, microserviços ou event sourcing. DRY deve remover interpretações repetidas, preservando validação de entrada, revalidação transacional e constraints do banco, que cumprem funções diferentes.

## Ordem sugerida de execução

1. Corrigir contexto Docker e saldo anterior à abertura — itens 1 e 2.
2. Centralizar planejamento de compra/estorno e ciclo — itens 3 a 5; adicionar regressões reproduzidas.
3. Produzir resumo em um snapshot e resolver situação de fatura — itens 6 e 8.
4. Definir moedas suportadas e calendário da UI; recuperar pendências antigas — itens 7 e 10.
5. Unificar projeção dos relatórios, melhorar consultas e fake de testes — itens 9 e 11.
6. Atualizar a documentação normativa e as evidências — item 12.

## Verificação executada e limites

- `pnpm typecheck`: aprovado em todos os workspaces.
- `pnpm lint`: aprovado.
- `pnpm build`: aprovado, incluindo Next e emissão MCP.
- `pnpm test`: não iniciou os testes pelo runner padrão; o CLI `tsx` falhou com `listen EPERM` na criação de pipe no sandbox.
- Alternativa executada com `node --import tsx --test --test-isolation=none` nos respectivos workspaces: 12 testes de domínio, 24 testes web e 3 testes MCP aprovados, sem skips nesses recortes. Web incluiu auth, HTTP, scheduler, formatação, filtros e dados de gráfico. MCP incluiu cliente API e auth; não o teste de transporte servidor.
- `bash scripts/test-postgres.sh`: interrompido por ausência de `/tmp/marvin-pg-runtime/usr/bin/initdb`. Nenhuma migration foi aplicada e nenhum banco de usuário foi acessado.
- Prova temporária em `/tmp/marvin-audit-probe.mts`, derivada do adapter de testes existente: saldo anterior à abertura retornou `10000`; preview mostrou vencimento `2026-10-28` contra `2026-10-30` efetivo; preview de estorno de despesa revertida foi aceito e commit recusado; estorno no fechamento foi associado ao ciclo encerrando nesse dia.
- Não executados: Docker build/inspeção de imagem, deploy, restore, E2E HTTP/MCP completo, navegação visual e concorrência em PostgreSQL. Não foi feita auditoria externa de vulnerabilidades de dependências.
- `portifolio/` era diretório não rastreado antes da auditoria e foi preservado; ficou fora da análise da plataforma financeira. Não houve leitura exaustiva de cada componente visual ou arquivo gerado.

O único arquivo de entrega adicionado é este relatório. Artefatos ignorados de compilação foram atualizados pelos comandos de validação. Nenhum commit, push, worktree ou alteração de código financeiro foi realizado.

**Parecer:** preservar a arquitetura atual; corrigir primeiro empacotamento e datas históricas, depois unificar planos financeiros e leituras consistentes. Não há estimativa confiável de redução de linhas ou dependências sem implementar e medir as mudanças; nenhuma dependência foi identificada como removível com evidência suficiente.

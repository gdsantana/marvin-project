# ADR 0005 — Decisões operacionais do MVP

- Data: 2026-10-25
- Status: aceito para guiar o comportamento do MVP; acesso ponta a ponta e enforcement ainda incompletos.

## Contexto

O ADR 0004 e `docs/data-model.md` §§6, 11 e 15 deixam comportamentos de calendário, estorno e correção para detalhamento na implementação. O código de domínio agora contém escolhas concretas. Este ADR registra essas escolhas sem afirmar que todos os endpoints, telas ou validações persistentes já existem.

## Decisões

### Ciclos em meses curtos

Datas de ciclo são calculadas por mês civil. Quando o dia configurado não existe no mês de destino, usa-se o último dia daquele mês. O próximo cálculo volta a partir do dia de fechamento configurado do cartão, não do dia truncado no mês anterior. Assim, fechamento dia 31 pode ser 28/29 de fevereiro e retornar a 31 em março. Vencimento no mesmo dia do fechamento ou antes dele cai no mês seguinte.

Implementação em `packages/domain/src/index.ts` (`addMonths`, `dueDate`); o teste de domínio cobre janeiro 31 → fevereiro 28 e vencimento igual ao fechamento. Compra no próprio dia de fechamento vai ao próximo ciclo conforme ADR 0004/modelagem.

### Estornos com múltiplas categorias

Um estorno permanece vinculado à despesa original, não excede o saldo monetário ainda reembolsável e reduz as categorias originais proporcionalmente às capacidades ainda não reembolsadas. Qualquer centavo restante é distribuído em ordem estável da lista original de alocações, sem exceder a capacidade de cada categoria. Estornos de compras no cartão creditam a dívida e não cancelam parcelas futuras.

Implementação em `FinanceService.createRefund` e `refundAllocations`. O teste atual não cobre a matriz de rateios parciais e resíduos; manter esse cenário como pendente de teste de aceitação detalhado.

### Correções e histórico

Histórico financeiro deve ser corrigido por novas operações compensatórias vinculadas, com motivo/origem rastreáveis; não substituir nem apagar silenciosamente a operação original. Estorno é suportado para despesas. Correção genérica/edit de transação, motivo obrigatório em ajuste e edição de categorias divididas ainda não estão expostos.

A migration bloqueia UPDATE/DELETE em `account_entries`, `card_statement_items` e `statement_payments`. Ela **não** torna `transactions` ou `category_allocations` append-only no banco. Portanto, o princípio orienta as operações futuras, mas a proteção DB está parcial e não há fluxo genérico de correção implementado.

### Fechamento automático de faturas

O fechamento manual usa `closeStatement`. A rotina automática recebe uma data de corte explícita (`closeAutomaticStatements(throughDate)`) e fecha ciclos abertos de cartões configurados em modo `automatic`. Não foi escolhido nem implementado scheduler; até existir um invocador operacional, o modo automático não executa por si só. A futura escolha do scheduler deve garantir chamada idempotente e observar faturas já fechadas, sem reescrever histórico.

O método existe em `packages/domain/src/index.ts`, mas não há rota web/MCP para invocação automática nem scheduler. A rota de fechamento manual está exposta pela API e usa a chave de idempotência da operação. Criação de cartão com configuração inicial está acessível; alteração posterior do modo/configuração ainda não está exposta na API/UI.

### Preview antes da gravação

Preview deve validar e retornar valores/datas calculados sem gravar movimentações. Há contratos em `packages/contracts`, implementação em `FinanceService.previewTransaction`, endpoint `POST /api/v1/transactions/preview` e a tool MCP `preview_transaction`; o teste de domínio verifica ausência de novas entradas. Não há fluxo de preview/confirmar na UI. API e tool MCP foram observadas em 2026-10-26 01:51 UTC, mas ainda precisam de teste de integração após as mudanças recentes.

## Consequências e limites

- O calendário é determinístico para dias 1–31 e não soma períodos fixos de 30 dias.
- O rateio de reembolso é proporcional ao saldo restante das categorias, não ao valor original após estornos anteriores.
- A política append-only exige que correções futuras sejam operações rastreáveis; enforcement SQL e fluxo genérico ainda precisam ser completados.
- Modo automático atualmente requer integração de execução. Não se deve descrevê-lo como agendado/ativo.
- Preview não altera dados no serviço de domínio e está acessível por HTTP/MCP; a ligação recém-adicionada precisa de teste e não há fluxo equivalente na UI.
- Nenhuma decisão deste ADR inclui investimentos, recorrências de despesas, integração bancária ou geração de previsão avulsa.

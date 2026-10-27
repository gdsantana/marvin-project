# ADR 0006 — Previsões avulsas e correções financeiras rastreáveis

- Data: 2026-10-25
- Status: aceito e implementado em `packages/contracts`, `packages/domain` e `packages/db`; integração HTTP/MCP/UI segue em andamento.

## Contexto

O MVP precisa representar compromissos de despesa sem movimentar saldo antes da realização e permitir corrigir lançamentos sem apagar seu histórico. Previsões de despesa não podem se confundir com itens de fatura: a compra parcelada já reconhece a dívida integral e usa itens de fatura apenas para distribuir cobrança. Reescrever transações ou alocações também permitiria alterar relatórios sem trilha auditável.

## Decisão

- `expense_forecasts` representa apenas despesa avulsa, sem motor de recorrência, sempre associada a conta não cartão e moeda copiada da conta. `projected` não grava `account_entries` nem entra em relatórios realizados. Realização é atômica, idempotente, cria a despesa pelo mesmo fluxo de `createExpense` e vincula a transação com unicidade; cancelamento preserva a linha e seu histórico.
- `transaction_revisions` é append-only e sequenciada por transação. Toda revisão registra motivo, ator, origem, instante, patch de metadados não financeiros e, opcionalmente, novas alocações. O domínio valida soma exata e tipo de categoria. Leituras aplicam a revisão mais recente sem alterar os dados originais.
- Correção de valor, conta ou data ocorre por reversão compensatória vinculada e, quando necessário, novo lançamento no mesmo commit. O tipo `adjustment` carrega entradas opostas e não vira receita/despesa no relatório. O relatório omite original integralmente revertido e o ajuste; contabiliza o lançamento substituto quando existe.
- Reversão genérica é limitada a receita, despesa avulsa e transferência que não movimentem cartão. É recusada para despesas já reembolsadas, pagamentos de fatura, transações de cartão, e transações já revertidas. Um estorno novo para origem revertida também é recusado. Reclassificação de categorias após reembolso é recusada para preservar a conciliação por categoria.
- Créditos de compra no cartão devem usar o fluxo existente de estorno vinculado: o crédito reduz a categoria original e cria crédito na fatura, mantendo parcelas. Não há exclusão de item nem reescrita de fatura encerrada; estornos encadeados seguem bloqueados pelo domínio.
- O estorno usa `postedOn ?? occurredOn` para selecionar a fatura e calcular seu ciclo. Preview e commit compartilham a seleção e o preview informa o ID de uma fatura aberta existente ou `statementPlan` (`cycleStartOn`, `closingOn`, `dueOn`) caso o commit crie a fatura.
- Estorno usa as alocações da revisão efetiva mais recente da despesa e desconta créditos prévios dessas categorias; revisão de categoria após qualquer estorno permanece bloqueada. Fusos de cartão devem ser IANA válidos no contrato e no domínio.
- Limites `BIGINT` aplicam-se aos valores gravados por linha. Agregações e saldos derivados usam `numeric` no resultado de `SUM(BIGINT)` do PostgreSQL e `bigint` JavaScript, sendo retornados como strings sem limite de 64 bits.
- A validação textual de valores monetários encerra sem converter para `BigInt` quando o formato é inválido; entradas malformadas retornam erro Zod sem lançar exceção.
- `closeDueAutomaticStatements(nowIso)` calcula o dia civil em `billingTimezone` de cada cartão automático e fecha ciclos abertos com `closingOn` até essa data. A operação altera apenas estado operacional da fatura, não cria lançamento nem dívida. Resultado agregado expõe somente contagem e instante conferido.
- SQL protege `transactions`, `category_allocations` e revisões contra UPDATE/DELETE; previsões não podem ser apagadas e só transitam de `projected` para `realized` ou `cancelled`. Unicidades protegem conciliação e reversão duplicada, além da serialização/idempotência no domínio.

## Consequências

A origem e cada revisão permanecem auditáveis e a leitura apresenta dados efetivos, sequência de revisões e vínculos de reversão para a UI. Consumidores existentes podem omitir os novos campos de leitura e recebem arrays/vínculos padrão nos contratos. O adapter web deve obter `actor` da identidade autenticada e fixar `source` conforme o canal; texto fornecido pelo LLM não é autoridade para autoria.

Ficam fora do escopo previsão recorrente, edição financeira in-place, reversão automática de compras parceladas, anulação de pagamento de fatura e crédito no cartão fora do fluxo de estorno. As interfaces persistentes estão em `docs/data-model.md` §§4.14–4.15 e os detalhes de migração em `docs/migrations.md`.

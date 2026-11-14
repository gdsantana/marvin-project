# ADR 0015 — Correção explícita de saldo inicial

- Data: 2026-11-14
- Status: implementado por solicitação do mantenedor

## Decisão

Complementa ADR 0010: criação continua insert-only, mas uma operação específica
permite corrigir somente o saldo inicial de contas existentes, inclusive cartões.
Exige saldo anterior esperado, novo valor assinado e motivo. Divergência do valor
anterior resulta em conflito; a transação serializável protege correções concorrentes.
O claim idempotente guarda o hash do payload e persiste no resultado os valores
anterior/novo, motivo, conta e instante da correção. Replay não reaplica correções nem sobrescreve correção posterior.

A correção afeta saldos e relatórios patrimoniais desde a abertura. Não modifica
movimentações, receitas/despesas, parcelas ou faturas, inclusive encerradas. Não é
uma operação para registrar fatos novos nem distribuir dívida inicial em faturas.
Dívida de cartão permanece negativa, crédito positivo; não inferir sinal.

API e MCP usam o mesmo serviço. A UI oferece o formulário em Configurações,
com saldo anterior visível e aviso do efeito histórico. Exclusão, arquivamento,
edição da data, moeda ou tipo de conta estão fora deste fluxo.

## Persistência e operação

Sem mudança de schema. O adapter atualiza somente `opening_balance_minor`.
O provisionamento reaplicado pelo runner de migrations concede UPDATE apenas
nessa coluna; executar o runner operacional na atualização antes de usar o fluxo.
Não há correção automática de registros existentes nem acesso a banco de usuário
nesta implementação.

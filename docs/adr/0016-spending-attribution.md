# ADR 0016 — Vincular cartões a contas para relatórios de gastos

## Status

Aceito. A migration 0005 foi adicionada para aplicação no processo normal de atualização.

## Contexto

Pix e débito são registrados na conta usada. Compras no crédito são registradas no cartão. Uma instituição pode ter várias contas, e um pagamento de fatura pode partir de uma conta diferente a cada mês. O detalhe de uma conta precisa atribuir as compras sem depender desses pagamentos.

## Decisão

Cada cartão pode ter uma conta corrente ou poupança vinculada para relatórios. O vínculo atual vale para todo o histórico. Cartões existentes começam sem vínculo e seus gastos aparecem no consolidado. O pagamento de fatura continua sendo uma transferência.

A consulta reutiliza a projeção de despesas efetivas. Os totais por categoria consideram estornos. Os percentuais por meio de pagamento representam a participação no valor bruto gasto no período.

## Consequências

Trocar o vínculo redistribui o histórico entre as contas. O consolidado, os saldos e as faturas preservam seus valores. Se o produto passar a exigir a atribuição histórica anterior a cada mudança, o vínculo precisará ter vigência.

Relacionado à [issue #29](https://github.com/gdsantana/marvin-project/issues/29).

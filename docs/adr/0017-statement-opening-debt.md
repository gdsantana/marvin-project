# ADR 0017 — Dívida de abertura na fatura do cartão

- Data: 2026-11-26
- Status: implementado

O saldo inicial negativo de um cartão novo representa apenas a dívida da
fatura vigente na data de abertura. A criação usa as mesmas regras de ciclo das
compras, inclusive no dia do fechamento. Compras posteriores somam seus itens
normalmente, e a dívida de abertura não é repetida em outros ciclos.

O vínculo é um valor positivo na fatura, sem transação, alocação de categoria
ou movimentação adicional. Total, previsão, situação derivada e limite de
pagamento consideram esse valor. Pagamentos reduzem o restante na mesma fatura;
o saldo inicial continua sendo a base do saldo patrimonial.

Cartões existentes exigem confirmação explícita do valor ainda pendente e da
fatura aberta, com opção de usar o ciclo vigente no fuso do cartão. A API
limita o valor à dívida de abertura e permite apenas um vínculo por cartão.
Não há atualização automática de cartões existentes. Correções de saldo
continuam sem reescrever faturas (ADR 0015); ajustes mensais continuam
reservados a cobranças ainda não registradas no passivo (ADR 0014).

A consulta de contas sinaliza cartões ativos com saldo inicial negativo e
sem vínculo, considerando todo o histórico de faturas. Essa indicação abre
o fluxo de confirmação existente na Visão geral e em Faturas e fica disponível
ao Hermes em `get_accounts`.

# ADR 0014 — Ajuste manual de fatura como despesa do mês

- Data: 2026-11-13
- Status: aceito pelo mantenedor nesta implementação

## Contexto

Ao começar a usar a plataforma, o usuário conhece a fatura atual, mas pode não
conhecer o número ou valor das parcelas antigas que chegarão nos próximos meses.
O mantenedor escolheu contabilizar diferenças descobertas como despesas do mês.

## Decisão

Adicionar cobrança positiva manual a fatura aberta. Registrar transação
`expense`, entrada negativa integral no cartão, alocação negativa na categoria
raiz de despesa `Ajuste de fatura` e item `adjustment` sem plano ou parcelas.
A categoria é inicializada pela migration 0004 e pelo bootstrap, sem substituir
categorias existentes. Não confundir o item `adjustment` com a transação
`adjustment` usada para reversões compensatórias.

O usuário informa a diferença, data de reconhecimento e descrição. Escolhe uma
fatura aberta ou o ciclo da data informada. A data determina o mês do relatório;
não há tentativa de inferir a compra original ou as parcelas futuras.

Exigir confirmação explícita de dívida ainda não reconhecida. Valores incluídos
no saldo inicial ou em compras anteriores não são elegíveis: distribuí-los em
faturas sem alterar novamente o passivo requer outro fluxo. Não corrigir o saldo
inicial silenciosamente. O banco não consegue verificar essa informação externa;
a confirmação é responsabilidade do usuário, também em chamadas via Hermes.

Só aceitar valores positivos. Créditos e estornos usam os fluxos existentes.
Faturas fechadas são preservadas. Categoria arquivada ou ambígua bloqueia a
operação, sem criar outra automaticamente. Escrita atômica, idempotente e preview
compartilham preparação no domínio. Nenhuma mudança de deploy ou dependência.

## Consequências

Não é necessário reconstruir o histórico. Relatórios do mês incluem despesas
anteriores reconhecidas agora; a categoria permite identificá-las. Não há previsão
completa de dívida futura, pois os compromissos ainda não foram informados.

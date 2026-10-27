# Decisões da fundação do MVP

Este registro acompanha o comportamento implementado em `packages/contracts` e `packages/domain`. O schema físico, migrations, adapters HTTP/MCP e interface permanecem responsabilidade dos workspaces correspondentes.

## Dinheiro e contratos

- O domínio recebe e calcula dinheiro como `bigint`; DTOs carregam unidades mínimas como strings inteiras. Schemas Zod rejeitam decimais, alocações não positivas e valores fora do intervalo `BIGINT` do PostgreSQL.
- Campos gravados em linhas `BIGINT` mantêm esse limite; saldos, limite disponível, relatórios e totais de faturas são derivados com `bigint` sem limite de 64 bits e saem como strings inteiras separadas dos contratos de escrita.
- Toda escrita pública de operação usa chave de idempotência. O fingerprint contém o discriminador da operação e o payload normalizado (incluindo BigInt como texto), então duas operações semanticamente diferentes não reutilizam a mesma chave.
- `FinanceRepository.transaction()` é a fronteira obrigatória de atomicidade. A implementação precisa serializar/lockar claims idempotentes, saldos de fatura/pagamento e ciclos de cartão; repetição com payload divergente resulta em `IDEMPOTENCY_CONFLICT`.
- `previewTransaction` valida as mesmas regras com leituras numa transação e não chama portas de escrita. A resposta descreve lançamentos/alocações/faturas que seriam criados; o adapter não persiste preview.
- Contratos de leitura HTTP/MCP também têm schemas Zod públicos: contas com saldo, cadastros, histórico enriquecido, resumo mensal, faturas detalhadas/previsões e respostas idempotentes das escritas.

## Contas, movimentos e classificação

- Instituição, conta, categoria e configuração do cartão também são idempotentes. Uma conta tem nome, moeda, saldo/data inicial e tipo; transações anteriores à data inicial de qualquer conta movimentada são rejeitadas.
- Criar conta de cartão exige `cardSettings` na mesma chamada/transaction; editar as configurações depois é uma operação idempotente separada.
- Pix/débito são metadados da despesa em conta de caixa/banco. Transferência exige contas diferentes e mesma moeda, grava duas entradas opostas e não recebe alocação.
- Despesa e receita validam soma e tipo das categorias. A compra de cartão grava uma entrada negativa integral e aloca a despesa integral uma vez.
- Reembolsos são vinculados à compra original, não excedem o valor restante e usam as alocações efetivas mais recentes da compra. Quando há várias categorias, a distribuição usa proporção dos saldos remanescentes; divisões inteiras têm resto distribuído centavo a centavo, sem superar a capacidade de nenhuma categoria. Em cartão, `postedOn ?? occurredOn` escolhe tanto a fatura quanto o ciclo; preview retorna a fatura existente ou `statementPlan` com as datas que o commit criará.
- Cashback independente é receita; cashback no cartão grava crédito de passivo e linha negativa de fatura. Um estorno de compra é redução da despesa, não renda.

## Cartões, faturas e projeções

- O plano divide valores inteiros igualmente e entrega o resto à última parcela; cada parcela é positiva e a soma reconcilia com o total.
- Compra no dia do fechamento entra no ciclo seguinte. Datas são calculadas por calendário civil e dias inexistentes são limitados ao último dia do mês. Se vencimento ocorre no mesmo mês e no dia de fechamento ou antes, vence no mês seguinte.
- Ciclos de compra criam faturas abertas. Fechamento manual usa `closeStatement`; modo automático pode ser executado por `closeAutomaticStatements(throughDate)`. Fatura fechada não recebe novas linhas. Reconfigurar fechamento não reescreve ciclos já persistidos.
- Ciclos novos que se sobrepõem a uma fatura persistida são rejeitados. Fechamento manual exige chave de idempotência.
- Pagamento exige fatura fechada e conta de origem de caixa/banco na mesma moeda. O domínio calcula o saldo em aberto na transação, rejeita pagamento excedente, cria transferência sem categoria e atualiza o estado para paga/parcialmente paga.
- Previsões são leitura de itens e pagamentos de faturas por vencimento e moeda; não criam `account_entries` nem alteram saldo. Recorrências de renda e sua conciliação seguem fora do MVP porque o modelo permanece em aberto.
- Relatórios apresentam saldos e fluxos por moeda, sem conversão. A despesa mensal considera compra original e reduz o gasto pela classificação de reembolsos; transferências e pagamentos de fatura são excluídos.

## Previsões avulsas e correções rastreáveis

- `createExpenseForecast(input, key)` cria uma previsão avulsa para conta não cartão; `listExpenseForecasts(from, to, currency?)` consulta por período esperado/moeda. Projetar e cancelar não criam movimentos nem alteram relatório realizado. `realizeExpenseForecast(forecastId, input, key)` usa o mesmo persistidor de despesa (`persistExpense`) e grava a transação efetiva e o vínculo único na mesma transação serializável; `cancelExpenseForecast(forecastId, key)` preserva o histórico.
- `correctTransaction(input, key, audit)` acrescenta uma revisão com número monotônico por transação. Metadados e alocações efetivas aparecem em `transactionHistory`; substituição de categorias deve manter a soma assinada e o tipo. Depois de qualquer reembolso, alteração de categoria fica bloqueada para não invalidar o rateio já conciliado.
- `reverseTransaction(input, key, audit)` grava ajuste compensatório vinculado e eventual substituição atômica. `audit.actor` e `audit.source` vêm do caller autenticado; não fazem parte do payload público. O relatório omite tanto a transação original integralmente revertida como o `adjustment`, evitando renda artificial; se existir substituição, só ela entra no relatório.
- Reversões aceitas: receita, despesa avulsa sem reembolso e transferência sem conta de cartão. Rejeitadas: compra no crédito, qualquer operação com entrada de cartão (inclui cashback/crédito e transferência envolvendo cartão), transferência registrada como pagamento de fatura, despesa já reembolsada, estorno/ajuste e original já revertido. Para cartão, `createRefund` continua sendo o fluxo de crédito correto; não altera parcelas futuras. Reembolso após reversão de origem e reclassificação após reembolso também são recusados.
- `closeDueAutomaticStatements(nowIso)` usa a data civil do `billingTimezone` do cartão e faz catch-up dos ciclos `open` em que `closingOn <= data local`. O fechamento apenas muda status e retorna `{ closedCount, checkedAt }`; não cria transações ou dívida. Transação serializável/retry resolve chamadas concorrentes em mais de uma instância.
- `billingTimezone` é validado como fuso IANA no contrato e no domínio antes de persistir configuração, evitando que um cartão inválido interrompa o lote de fechamento automático.

## Limites desta entrega

Não há investimento, câmbio, orçamento, recorrência, geração de lançamentos financeiros em faturas, acesso ao banco no domínio ou execução de migrations. A porta SQL deve garantir FKs/uniques/constraints e consistência serializável de operações concorrentes, inclusive idempotência e limite de pagamento.

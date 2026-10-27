# API HTTP do web

Esta é a API v1 implementada em `apps/web`; o navegador e o MCP usam os mesmos endpoints. Todos os valores monetários na API são **strings decimais de unidades mínimas** (centavos para BRL, PLN e EUR). A API valida entradas e saídas com os schemas exportados de `@finance/contracts`. O `apps/web` injeta `FinanceRepository` no `FinanceService`; regras de saldo, fatura, parcelamento, reembolso, preview e relatório ficam no domínio.

Base local: `http://localhost:3000/api`. Em produção, use a origem HTTPS privada configurada em `APP_ORIGIN`.

## Autenticação

- **Navegador:** `POST /auth/login` recebe `{"password":"..."}`. A senha é verificada contra `WEB_PASSWORD_HASH` (scrypt). O servidor cria o cookie assinado `marvin_session` (`HttpOnly`, `SameSite=Strict`, `Secure` em produção) e o cookie `marvin_csrf` (`SameSite=Strict`). A sessão expira após sete dias.
- **Escritas do navegador:** envie `X-CSRF-Token` com o valor retornado por `GET /auth/session`; o cookie CSRF também deve estar presente. `Origin` precisa corresponder exatamente à origem de `APP_ORIGIN`.
- **MCP:** envie `Authorization: Bearer <MCP_API_TOKEN>`. Essa credencial é independente da sessão web e dispensa CSRF. Nunca a envie ao navegador.
- Endpoints financeiros exigem sessão ou bearer. `GET /health` é público e não revela estado do banco nem dados privados.
- O limitador de login permite cinco falhas por janela de 15 minutos, compartilhadas pelo processo. Como a aplicação tem uma única pessoa usuária e não confia em cabeçalhos de proxy para identificar clientes, o limite é global; em múltiplas réplicas seria necessário armazenamento compartilhado.

## Envelope e erros

Sucesso:

```json
{"ok":true,"data":{}}
```

Erro:

```json
{"ok":false,"error":{"code":"VALIDATION_ERROR","message":"Confira os campos informados.","details":{}}}
```

Status usados: `400` JSON/validação/chave ausente, `401` sessão/bearer inválido, `403` CSRF/origem, `404` recurso ausente, `409` conflito ou reutilização divergente da chave de idempotência, `413` corpo acima do limite e `422` regra do domínio. Erros de autenticação podem incluir `RATE_LIMITED` (`429`) e configuração ausente (`503`). Falhas inesperadas retornam `500` sem detalhes internos.

| Código | Significado |
|---|---|
| `VALIDATION_ERROR` | Entrada inválida; `details` contém caminhos de campo quando aplicável. |
| `NOT_FOUND` | Identificador não encontrado. |
| `CONFLICT` | Estado atual não permite a operação. |
| `IDEMPOTENCY_CONFLICT` | A chave já foi usada com outro payload. |
| `INSUFFICIENT_STATEMENT_BALANCE` | Pagamento maior que o saldo a pagar. |
| `CURRENCY_MISMATCH` | Moedas incompatíveis; não há conversão automática. |
| `INVALID_ACCOUNT_TYPE`, `INVALID_CATEGORY`, `INVALID_REFUND` | Regra de tipo, classificação ou vínculo violada. |

## Saúde e sessão

### `GET /health`

Público; não consulta o banco.

```json
{"ok":true,"data":{"status":"ok"}}
```

### `POST /auth/login`

JSON: `{"password":"senha local"}`. Compara senha local usando scrypt e aplica rate limit. Responde `{"ok":true,"data":{"authenticated":true}}` e define os cookies.

### `GET /auth/session`

Retorna `{"ok":true,"data":{"authenticated":true,"csrfToken":"..."}}` quando a sessão é válida; sem sessão, `authenticated` é `false` e `csrfToken` é `null`.

### `DELETE /auth/session`

Encerra a sessão. Exige `Origin` permitido e `X-CSRF-Token` quando existe sessão.

## Consultas

Todas as consultas abaixo exigem sessão web ou bearer MCP. Respostas de sucesso seguem os schemas `accountsResponseSchema`, `institutionsResponseSchema`, `categoriesResponseSchema`, `transactionsResponseSchema`, `statementsResponseSchema` e `monthlySummaryResponseSchema` em `packages/contracts`.

### `GET /v1/institutions`

Lista `id`, `name` e `isArchived`; não retorna credenciais bancárias.

### `GET /v1/accounts`

Lista nome, instituição, tipo, moeda, saldo inicial, data-base, status de arquivamento e `balanceMinor` derivado pelo domínio. Para cartão, também inclui `availableCreditMinor` (string ou `null`, quando não existe limite configurado); saldo usa a convenção de passivo assinado.

### `GET /v1/categories`

Lista nome, tipo, categoria superior e status de arquivamento.

### `GET /v1/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD`

Consulta o intervalo inclusivo por data econômica e retorna `id`, tipo, data econômica e de postagem, descrição, contraparte, notas, forma de pagamento, origem, estado de revisão, lançamentos por conta/moeda e alocações por categoria. Valores das entradas/alocações são strings em unidades mínimas; transferências preservam suas duas pontas.

### `GET /v1/statements?from=YYYY-MM-DD&to=YYYY-MM-DD`

Lista faturas cujo vencimento está no intervalo inclusivo: cartão e moeda, datas do ciclo, status, itens, pagamentos, total faturado, pago e saldo restante. Parcelas projetadas não são novas movimentações de conta.

### `GET /v1/cards/settings?accountId=<uuid>`

Retorna as configurações atuais do cartão: `accountId`, `creditLimitMinor`, dias de fechamento/vencimento, fuso horário e modo manual/automático. `accountId` precisa apontar para uma conta de cartão.

### `GET /v1/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Resumo de saldos por moeda (até `to`) e receitas/despesas do intervalo. Campos: `from`, `to`, `balancesByCurrency`, `incomeMinorByCurrency`, `expenseMinorByCurrency`. O domínio exclui transferências próprias e não converte moedas.

Exemplo:

```json
{"ok":true,"data":{"from":"2026-10-01","to":"2026-10-31","balancesByCurrency":{"BRL":"450000"},"incomeMinorByCurrency":{"BRL":"500000"},"expenseMinorByCurrency":{"BRL":"50000"}}}
```

## Escritas e preview

Todas as escritas exigem sessão + CSRF ou bearer MCP e um cabeçalho `Idempotency-Key` com 1–200 caracteres. Reutilizar uma chave com o mesmo payload devolve o mesmo resultado; usar a chave para outro payload retorna `409 IDEMPOTENCY_CONFLICT`. O preview é somente leitura e não exige chave de idempotência.

Metadados de transação podem incluir `occurredOn`, `postedOn` (opcional/null), `description`, `counterpartyName` (opcional/null), `notes` (opcional/null), `source` (`manual`, `hermes` ou `import`) e `reviewStatus` (`confirmed` ou `needs_review`). Dinheiro deve ser enviado como string inteira em unidades mínimas; números JSON são recusados pelos schemas.

### `POST /v1/institutions`

Schema de entrada `createInstitutionSchema`; exemplo:

```json
{"name":"Banco Exemplo"}
```

Retorna `{ "id": "<uuid>" }`.

### `POST /v1/accounts`

Schema `createAccountSchema`. Para contas sem cartão, envie nome, tipo (`checking`, `savings`, `cash`), moeda ISO, `openingBalanceMinor` string, `openingDate` e `institutionId` UUID ou `null`. Para cartão, use `type:"credit_card"` e `cardSettings` com `creditLimitMinor` string ou `null`, `closingDay`, `dueDay`, `billingTimezone` e `billingMode` (`manual` ou `automatic`). Conta e configuração do cartão são criadas atomicamente pelo domínio.

```json
{"name":"Conta principal","type":"checking","currency":"BRL","openingBalanceMinor":"0","openingDate":"2026-10-25","institutionId":null}
```

### `POST /v1/categories`

Schema `createCategorySchema`:

```json
{"name":"Mercado","type":"expense","parentId":null}
```

### `POST /v1/cards/configuration`

Atualiza de forma idempotente as configurações de cartão existente. Use o schema `creditCardSettingsSchema` e informe `accountId`, `creditLimitMinor` (string ou `null`), `closingDay`, `dueDay`, `billingTimezone` e `billingMode`. A gravação ocorre por `FinanceService.configureCard`.

```json
{"accountId":"<uuid-do-cartao>","creditLimitMinor":"500000","closingDay":20,"dueDay":28,"billingTimezone":"America/Sao_Paulo","billingMode":"manual"}
```

### `POST /v1/transactions/income`

Schema `createIncomeSchema`. Campos próprios: `accountId`, `amountMinor` positivo como string e `categoryId` UUID ou `null`, além dos metadados.

### `POST /v1/transactions/expense`

Schema `createExpenseSchema`. Campos próprios: `accountId`, `amountMinor` positivo, `paymentMethod` (`pix`, `debit`, `cash`, `other`, etc.) e `allocations`. Cada alocação tem `categoryId` (ou `null`) e `amountMinor` positivo; a soma deve ser igual ao valor total. O domínio aplica o sinal de despesa.

### `POST /v1/transactions/transfer`

Schema `createTransferSchema`; `fromAccountId`, `toAccountId` e `amountMinor` positivo. O domínio exige contas distintas da mesma moeda e não classifica a operação como receita/despesa.

### `POST /v1/transactions/credit-purchase`

Schema `createCreditPurchaseSchema`; campos próprios: `cardAccountId`, `totalAmountMinor`, `installmentCount` (1–120), `allocations` positivas que somam o total e metadados. A compra reconhece o passivo total uma vez; o domínio cria parcelas exatas e vincula-as a faturas.

### `POST /v1/transactions/cashback`

Schema `createCashbackSchema`; `accountId`, `amountMinor`, `categoryId` (UUID ou null), `cardStatementId` opcional. Cashback em cartão precisa indicar a fatura.

### `POST /v1/transactions/refund`

Schema `createRefundSchema`; `originalTransactionId`, `accountId` e `amountMinor`. O domínio valida vínculo e limite ainda reembolsável e reduz as alocações originais.

### `POST /v1/statements/payment`

Schema `payStatementSchema`; `statementId`, `fromAccountId`, `amountMinor` positivo e metadados. Registra transferência para o cartão, sem nova despesa; pagamento parcial deixa o restante na fatura.

### `POST /v1/statements/close`

Entrada `{"statementId":"<uuid>"}`. Fecha uma fatura aberta por `FinanceService.closeStatement`. A resposta contém `data.value` (`cardStatementSchema`) e `data.replayed`.

### `POST /v1/transactions/preview`

Schema `previewTransactionSchema`, uma união discriminada pelo campo `operation`: `income`, `expense`, `transfer`, `credit_purchase`, `cashback`, `refund` ou `statement_payment`. O restante segue o schema da escrita correspondente. A API chama `FinanceService.previewTransaction`, que valida referências, sinal, categorias, moeda, saldo/fatura e calendário de parcelas usando o port do domínio. O serviço faz apenas leituras dentro da transação; não cria lançamentos, parcelas, pagamentos, faturas nem claims de idempotência.

Exemplo de compra em 3 vezes:

```json
{
  "operation":"credit_purchase",
  "cardAccountId":"<uuid-do-cartao>",
  "totalAmountMinor":"100000",
  "installmentCount":3,
  "allocations":[{"categoryId":"<uuid-da-categoria>","amountMinor":"100000"}],
  "occurredOn":"2026-10-25",
  "description":"Monitor",
  "source":"hermes",
  "reviewStatus":"confirmed"
}
```

A resposta é validada por `previewTransactionResponseEnvelopeSchema`. Exemplo abreviado:

```json
{
  "ok":true,
  "data":{
    "operation":"credit_purchase",
    "kind":"expense",
    "entries":[{"accountId":"<uuid-do-cartao>","amountMinor":"-100000"}],
    "allocations":[{"categoryId":"<uuid-da-categoria>","amountMinor":"-100000"}],
    "installments":[
      {"number":1,"amountMinor":"33333","closingOn":"2026-11-20","dueOn":"2026-11-28"},
      {"number":2,"amountMinor":"33333","closingOn":"2026-12-20","dueOn":"2026-12-28"},
      {"number":3,"amountMinor":"33334","closingOn":"2027-01-20","dueOn":"2027-01-28"}
    ]
  }
}
```

Datas e valores do exemplo dependem das configurações do cartão; o servidor é a autoridade. O preview não reserva limite nem garante que o estado permaneça igual até uma escrita posterior.

### Previsões avulsas de despesa

Previsões não são parcelas de fatura e não alteram saldo, movimentações nem relatórios realizados. A consulta retorna estados projetados, realizados e cancelados; o período se refere a `expectedOn`.

#### `GET /v1/expense-forecasts?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=BRL`

`from` e `to` são obrigatórios e inclusivos; `currency` é opcional e deve ser um código ISO 4217 em maiúsculas. Resposta validada por `expenseForecastResponseSchema`:

```json
{"ok":true,"data":[{"id":"<uuid>","accountId":"<uuid>","expectedOn":"2026-11-05","amountMinor":"12000","categoryId":null,"description":"Internet","currency":"BRL","status":"projected","realizedTransactionId":null,"createdAt":"2026-10-25T12:00:00.000Z"}]}
```

#### `POST /v1/expense-forecasts`

Exige `Idempotency-Key`. Schema `createExpenseForecastSchema`:

```json
{"accountId":"<uuid-de-conta-sem-cartao>","expectedOn":"2026-11-05","amountMinor":"12000","categoryId":null,"description":"Internet"}
```

Responde `201` com `{ "value": <expenseForecast>, "replayed": false }` dentro do envelope. A conta, categoria e moeda são validadas pelo domínio.

#### `POST /v1/expense-forecasts/{forecastId}/realize`

Exige `Idempotency-Key`. Schema `realizeExpenseForecastSchema`:

```json
{"occurredOn":"2026-11-05","postedOn":null,"paymentMethod":"debit","source":"manual","reviewStatus":"confirmed"}
```

Responde `201` com previsão atualizada e transação efetiva (`{ "value": { "forecast": ..., "transaction": ... }, "replayed": false }`). A realização e a despesa ocorrem na mesma transação atômica; repetição da mesma chave devolve o resultado gravado.

#### `POST /v1/expense-forecasts/{forecastId}/cancel`

Exige `Idempotency-Key` e corpo `{}`. Responde `200` com a previsão no estado `cancelled`. Só previsões `projected` podem ser canceladas; o registro permanece no histórico.

### Revisão e reversão de lançamentos

#### `POST /v1/transactions/correct`

Exige `Idempotency-Key`. Entrada `correctTransactionSchema`:

```json
{"transactionId":"<uuid>","reason":"Corrigi o nome do estabelecimento","metadata":{"description":"Mercado do bairro"},"allocations":[{"categoryId":"<uuid>","amountMinor":"8500"}]}
```

`metadata` aceita `description`, `counterpartyName`, `notes` e `reviewStatus`; datas, contas e valores não são editáveis por revisão. `allocations` é opcional e deve reconciliar com o valor/classificação original. Ator e origem não são aceitos do cliente: a API registra `local-user`/`manual` para sessão web e `hermes`/`hermes` para bearer de serviço. A rota relê o histórico e responde com a transação efetiva em `transactionCorrectionResponseSchema` (`200`). O histórico inclui número, motivo, ator, origem e data das revisões; esta versão não devolve o snapshot antigo dos valores de metadata/categorias.

#### `POST /v1/transactions/reverse`

Exige `Idempotency-Key`. Entrada `reverseTransactionSchema`:

```json
{"transactionId":"<uuid>","occurredOn":"2026-11-06","reason":"Lançamento duplicado"}
```

Opcionalmente, `replacement` aceita uma nova `income`, `expense` ou `transfer`; reversão e substituição são atômicas. A resposta `201` usa `transactionReversedResponseSchema` com `{ "value": { "reversal": ..., "replacement": null }, "replayed": false }`. O serviço só aceita receita, despesa avulsa e transferência em contas sem cartão. Recusa compras no crédito, movimentações vinculadas a faturas/cartões, pagamento de fatura, despesa já reembolsada e lançamento já revertido. Reembolso de compra no crédito continua usando `POST /v1/transactions/refund`.

Consultas de transações retornam a transação efetiva, lista de revisões (motivo/ator/origem/data), `reversalOfTransactionId` e `reversedByTransactionIds`. Reversões são novos lançamentos compensatórios; operações originais permanecem no histórico.

## Segurança e limites desta versão

- `APP_ORIGIN` deve ser a origem HTTPS pública confiável; não inferimos a origem de `Host` ou `X-Forwarded-*`.
- Login recebe até 4 KiB; demais corpos JSON até 64 KiB.
- As respostas públicas da API são validadas pelos contratos de `packages/contracts` antes do envio.
- Não há exclusão de histórico financeiro. Correções só revisam metadata/categorias; alterações de valor/conta exigem reversão e, se necessário, um novo lançamento.

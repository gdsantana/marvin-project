# MCP — Hermes e API web

`apps/mcp` usa o SDK oficial `@modelcontextprotocol/sdk` com HTTP Streamable em `/mcp`. Hermes envia `Authorization: Bearer <MCP_HERMES_BEARER_TOKEN>`. Cada requisição MCP cria servidor/transporte stateless e libera ambos quando a resposta HTTP fecha.

O endpoint público `GET /healthz` retorna somente `{ "ok": true, "data": { "status": "ok" } }`. Requisições MCP têm limite de 64 KiB; JSON inválido retorna 400 e corpo acima do limite retorna 413. O servidor não registra tokens, cabeçalhos de autorização, mensagens nem payloads financeiros.

## Credenciais e URL

- `MCP_HERMES_BEARER_TOKEN`: Hermes → MCP. Mínimo de 32 bytes.
- `MCP_API_TOKEN`: MCP → API web. A mesma credencial é configurada no web e MCP; precisa ser diferente do token de Hermes.
- `MCP_API_URL`: base da API; no Compose é `http://web:3000/api/`. As ferramentas acrescentam paths `v1/...`.

O cliente HTTP envia Bearer para a API, valida o envelope e valida `data` com schemas públicos de `packages/contracts`. Cada POST de escrita inclui `Idempotency-Key`; preview é POST somente leitura e não envia essa chave.

## Ferramentas disponíveis

### Consulta

- `get_institutions`: lista instituições.
- `get_accounts`: lista contas e saldo derivado `balanceMinor`.
- `get_card_settings`: recebe `accountId` e consulta limite disponível configurado, dias de fechamento/vencimento, fuso e modo do cartão.
- `get_categories`: lista categorias para classificação.
- `get_transactions`: recebe `from` e `to` e consulta o intervalo.
- `get_statements`: recebe `from` e `to` e lista faturas detalhadas por vencimento.
- `get_monthly_summary`: recebe `from` e `to` e retorna saldos/fluxos por moeda.
- `get_expense_forecasts`: recebe `from`, `to` e opcionalmente `currency`; lista previsões avulsas projetadas, realizadas e canceladas.

### Preview

- `preview_transaction`: recebe o campo `transaction`, com o payload discriminado por `operation` (`income`, `expense`, `transfer`, `credit_purchase`, `cashback`, `refund` ou `statement_payment`). Encaminha para `POST /api/v1/transactions/preview`, valida a resposta com `previewTransactionResponseSchema` e não persiste dados nem envia chave de idempotência. A API executa o `FinanceService.previewTransaction`; cálculos e validação financeira não são replicados no MCP. Ver [contrato da API, seção Preview](api.md#post-v1transactionspreview).

### Escrita

Todas as ferramentas abaixo exigem `idempotencyKey`; o MCP o envia como `Idempotency-Key`. A origem é definida pelo servidor como `hermes` e as entradas são validadas novamente com os contracts antes de chamar a API.

- `create_institution`, `create_account`, `create_category`.
- `create_income`, `create_expense`, `create_transfer`, `create_credit_purchase`, `create_cashback`, `create_refund`.
- `pay_statement`, `close_statement`.
- `configure_card`: recebe as configurações completas do cartão e `idempotencyKey`; alterações são validadas pela API e preservam as regras de ciclo existentes.
- `create_expense_forecast`, `realize_expense_forecast`, `cancel_expense_forecast`.
- `correct_transaction`, `reverse_transaction`.

Previsões são despesas esperadas avulsas: não são parcelas de fatura nem alteram saldo antes da realização. Realização usa a API para registrar a despesa vinculada na mesma operação atômica; cancelamento só aceita estado `projected`. Ambas exigem chave de idempotência.

`correct_transaction` exige `transactionId`, `reason` e `metadata` (com descrição, contraparte, notas ou status de revisão); pode incluir `allocations` para reclassificar categorias. A API registra a revisão e devolve o lançamento efetivo. `reverse_transaction` exige `transactionId`, `occurredOn` e `reason`; pode incluir uma substituição tipada como receita, despesa ou transferência. A ferramenta apenas encaminha o pedido; a API decide se a reversão é permitida, faz a compensação e registra o vínculo. Compras no crédito, pagamentos de fatura, despesas já reembolsadas e operações com conta/cartão incompatível são recusados.

Actor e origem para correção/reversão são derivados pelo backend a partir do bearer autenticado (`hermes`); não são campos de entrada MCP. Todas as ferramentas de escrita acima exigem `idempotencyKey`, encaminhada em `Idempotency-Key`. Respostas e erros são validados pelo cliente MCP com os contracts; `409` de idempotência/conflito e `422` de regra de domínio retornam como erro da ferramenta sem detalhes internos.

Escritas são encaminhadas para as rotas documentadas em [docs/api.md](api.md). O MCP não fala com PostgreSQL nem importa pacotes `db`/`domain`. Falhas da API retornam `isError: true` para o cliente MCP, sem incluir tokens ou detalhes internos.

## Execução local

```bash
pnpm --filter @finance/mcp dev
```

Configure `MCP_PORT`, `MCP_HERMES_BEARER_TOKEN`, `MCP_API_URL` e `MCP_API_TOKEN`. O servidor recusa inicialização sem tokens fortes e distintos.

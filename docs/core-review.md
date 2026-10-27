# Independent core review

What this change does: The MVP adds expense forecasts, transaction revisions and reversals, effective transaction history and reports, and automatic statement closing. It also adds HTTP routes and contracts for these operations. I reviewed the current domain, repository, migrations, contracts, and relevant web/MCP callers; the expected load is one self-hosted user with occasional agent retries.

## Must fix

1. **Card refunds can land in the wrong statement** (`packages/domain/src/index.ts:303-305`, `:591-598`)
   - **What this is:** Card statement selection must use the bank posting date when it is available, as the model requires.
   - **Problem:** With a card closing on the 20th, an open statement closing `2026-10-20`, and a refund with `occurredOn: 2026-10-19` and `postedOn: 2026-10-21`, both preview and commit select the October statement because they compare `closingOn` to `occurredOn`. The posting date puts the refund in the November cycle.
   - **Fix:** Select the statement using `postedOn ?? occurredOn` and use that same date to calculate the target cycle.
   - **If we skip it:** Refunds appear on a statement that was already posted by the bank, so the app and statement history disagree.

2. **An invalid card time zone can stop every automatic close** (`packages/contracts/src/index.ts:27-30`, `packages/domain/src/index.ts:120-125`, `:343-360`)
   - **What this is:** Card setup accepts any non-empty time-zone string, then the automatic closer converts the current instant using that value.
   - **Problem:** Create an automatic card with `billingTimezone: "Mars/Phobos"`. It is accepted, but `Intl.DateTimeFormat` throws when the closer reaches that card. The exception aborts the transaction, so valid due statements for other cards in the same run are rolled back too.
   - **Fix:** Validate the IANA time zone when creating or changing card settings, before saving them.
   - **If we skip it:** One bad setting can keep all automatic statements from closing until someone repairs that card.

3. **A valid write can create a balance the API cannot return** (`packages/domain/src/index.ts:391-397`, `packages/contracts/src/index.ts:4-7`, `apps/web/src/app/api/v1/[...path]/route.ts:42-45`)
   - **What this is:** Inputs are bounded to PostgreSQL `BIGINT`, but derived balances are not checked against the same bound.
   - **Problem:** Create an account with opening balance `9223372036854775807`, then record income of `1`. Both writes pass validation. The derived balance is `9223372036854775808`, which `accountWithBalanceSchema` rejects, so `GET /v1/accounts` fails instead of returning the account.
   - **Fix:** Reject a write when it would push any affected derived balance outside the supported range, or deliberately widen the output and storage arithmetic contract.
   - **If we skip it:** Accepted ledger entries can make account and summary reads fail.

## Should fix

4. **Refunds ignore corrected category allocations** (`packages/domain/src/index.ts:194-205`, `:297-300`, `:680-696`)
   - **What this is:** History and reports use the latest allocation revision, but refund allocation starts from the original allocation rows.
   - **Problem:** Record a `10000` expense in category A, revise it to category B, then refund `2000`. History shows the expense in B and the refund in A. The current monthly total happens to net correctly, but the category history contradicts the accepted correction and a category report would be wrong.
   - **Fix:** Base refund capacity on the latest effective allocation revision, then subtract earlier refund allocations from those same effective categories.
   - **If we skip it:** A partial refund is attributed to a category the transaction no longer uses.

5. **Preview omits the statement that a card refund will create** (`packages/domain/src/index.ts:587-600`)
   - **What this is:** Preview returns the selected statement when one is already open, but does not return a statement ID when commit will create the cycle.
   - **Problem:** For a card refund when there is no eligible open statement, preview returns no `statementId`; commit creates a statement and adds the refund item to it. An agent cannot confirm which invoice the operation will affect before committing.
   - **Fix:** Share target-selection logic and have preview return the existing statement ID or the planned cycle dates when commit will create a statement.
   - **If we skip it:** Preview and commit do not expose equivalent financial effects for this operation.

## Verification

- `pnpm --filter @finance/domain test` — 8 passed.
- `pnpm --filter @finance/web test` — 12 passed.
- `pnpm --filter @finance/mcp test` — 3 passed.
- `pnpm --filter @finance/db test` — PostgreSQL integration test skipped because `DATABASE_URL_TEST` is unset; no database was used.
- The existing tests cover forecast create/list/realize/cancel, forecast realization race in PostgreSQL, revision history, reversal and automatic-close behavior. The required posted-date statement precedence case (§11.5) is explicitly untested.

Verdict: fix 1, 2, and 3 first.

Not checked: End-to-end flows are owned by the other reviewer. I did not run a build or use a persistent database.

## Resolução registrada em 2026-10-26

O registro acima preserva o review original e seu contexto. A correção do núcleo incorporou os cinco achados e o caso do parser monetário:

1. Estornos no cartão selecionam fatura por `postedOn ?? occurredOn`; preview informa a fatura existente ou o ciclo planejado.
2. Contrato e domínio rejeitam fuso IANA inválido antes de persistir a configuração do cartão.
3. Saldos e agregações derivados retornam `bigint` sem limite de `BIGINT`; entradas persistidas continuam limitadas a `BIGINT`.
4. Reembolsos seguem alocações efetivas da revisão mais recente e descontam créditos anteriores.
5. Preview e commit de estorno usam o mesmo seletor de fatura.
6. Valores monetários textuais inválidos, como `abc` e `1.2`, são recusados pela validação de contrato sem lançar durante o parse.

Evidência do gate em 2026-10-26: 11 testes de domínio, quatro MCP, 18 web e um PostgreSQL passaram sem skips. Typecheck, lint, build serial, recovery, E2E dev e E2E de produção passaram. A causa do `500` visto no primeiro E2E foi uma verificação `instanceof` que falhava entre instâncias de módulo carregadas pelo Next; a rota passou a validar `code` com o schema de erro de domínio e devolve `409 CONFLICT`. O harness também preserva o assert que compra em fatura paga não grava saldo nem altera a fatura, isolando os cenários posteriores em outro cartão com ciclo aberto. A falha de produção anterior foi um lifecycle/build issue: MCP herdava `noEmit: true`; a configuração agora emite `dist/index.js`, e o teste `start` real e E2E production passaram. A validação visual aprovada está descrita em [docs/ui-validation.md](ui-validation.md). Docker build ficou impedido pelo acesso negado ao socket; não houve deploy no homelab. As decisões financeiras permanecem em [ADR 0006](adr/0006-forecast-and-correction.md) e [docs/data-model.md §11](data-model.md#11-testes-de-aceitação-de-domínio--obrigatórios-antes-de-produção).

# Auditoria dos requisitos do MVP

**Snapshot:** 2026-10-26. Validação executada em PostgreSQL 18.6 descartável; nenhum dado real foi usado. O gate local de dev e produção passou. Docker build e deploy não foram feitos.

## Estado do gate

- `pnpm install --frozen-lockfile`: passou; lockfile permaneceu inalterado.
- `pnpm typecheck`: passou após o ajuste textual em `workspace.tsx`.
- `pnpm lint`: passou.
- `bash scripts/test-postgres.sh`: 34 testes passaram, zero falhas e zero skips (MCP 4, domínio 11, DB 1, web 18), incluindo a regressão HTTP/PostgreSQL da compra em fatura paga.
- `npm_config_workspace_concurrency=1 pnpm build`: passou serialmente; Next.js 15.5.28 compilou e MCP gerou `apps/mcp/dist/index.js`. Aviso não bloqueante de plugin Next ausente na configuração ESLint.
- `bash scripts/validate-recovery.sh`: passou migrations, dump/restore entre clusters descartáveis, integridade agregada, saldos e replay idempotente.
- `docker compose --env-file .env.example -f infra/compose.yml config -q`: passou. Docker build não foi executado: acesso ao socket `/var/run/docker.sock` retornou `permission denied`.
- E2E dev completo passou com PostgreSQL 18.6, migration, web e MCP. O caso de compra em ciclo já pago exige `409 CONFLICT` e confirma que saldo e fatura permanecem intactos. Os cenários posteriores de `postedOn`, reembolso e compra 1x usam um segundo cartão com ciclo aberto; não alteram as datas nem os asserts financeiros.
- E2E de produção passou depois do rebuild serial; `next start` e `apps/mcp/dist/index.js` executaram com PostgreSQL real, e o harness encerrou com exit code 0. A verificação direta do MCP compilado também passou em Node 24.22.0 com health 200, initialize e 26 tools listadas.
- UI: Chromium real validou 6 rotas autenticadas em mobile 390×844 e desktop 1440×900, conteúdo carregado, sem overflow horizontal, skeleton residual, alertas ou erros de console/página. Há 20 screenshots e registro dos fluxos em [docs/ui-validation.md](ui-validation.md). O texto do preview recebeu depois uma substituição aprovada; não foram refeitas capturas.

Os E2E dev e produção passaram. O build MCP agora emite o artefato `dist` necessário pelo comando `start`. O único limite operacional deste gate é a impossibilidade de acessar o Docker socket; portanto não há evidência de Docker build ou deploy no homelab.

## Cobertura dos 15 cenários de `docs/data-model.md` §11

| # | Cenário obrigatório | Evidência disponível e limite |
|---:|---|---|
| 1 | Salário de 500000 e relatório mensal | E2E dev cria salário por MCP, confirma replay sem duplicação e valida relatório BRL em `502500`. **Coberto**. |
| 2 | Pix e débito na mesma conta corrente | E2E dev grava Pix e débito na mesma conta corrente; asserts de saldo e total BRL passam. **Coberto**. |
| 3 | Compra de crédito 1x sem alterar corrente | E2E dev valida compra 1x no cartão isolado e saldo da corrente inalterado. **Coberto**. |
| 4 | Compra de 100000 em 3x, datas e soma exata | E2E dev valida `33333 + 33333 + 33334` e vencimentos `2026-11-28`, `2026-12-28`, `2027-01-28`. **Coberto**. |
| 5 | Compra no fechamento, postagem bancária e ciclo correto | E2E dev valida compra em 20/10 com `postedOn` 21/10 na fatura que fecha em 20/11; estorno também segue `postedOn`. **Coberto**. |
| 6 | Pagamento parcial sem despesa nova | E2E dev valida pagamento parcial, duas tentativas concorrentes e quitação cumulativa de `33333`; domínio/DB também passam. **Coberto**. |
| 7 | Cashback em conta sem item de fatura | E2E dev confirma receita única e entrada positiva na conta corrente, sem item de fatura. **Coberto**. |
| 8 | Cashback no cartão com linha negativa | E2E dev confirma linha negativa `-500` na fatura indicada. **Coberto**. |
| 9 | Reembolso reduz categoria original, inclusive após revisão | E2E dev faz revisão, preview sem escrita e estorno por MCP; valida categoria efetiva e crédito na fatura de novembro. **Coberto**. |
| 10 | Transferência própria não muda receita/despesa ou patrimônio | E2E dev valida saldo agregado e relatório BRL (`502500` receita, `119000` despesa, saldo assinado total `383500`). **Coberto**. |
| 11 | Replay MCP idempotente sem duplicação | E2E dev repete salário e operações de previsão MCP; replays retornam o mesmo resultado, e payloads divergentes seguem conflito. **Coberto**. |
| 12 | Pagamentos concorrentes não excedem a fatura | E2E dev e teste PostgreSQL verificam concorrência sem exceder saldo/pagamento. **Coberto**. |
| 13 | BRL e EUR não são agregados sem FX | E2E dev valida receita EUR `70000` e totais BRL independentes. **Coberto**. |
| 14 | Alterar fechamento preserva faturas históricas | E2E dev compara itens e datas antes/depois de reconfigurar cartão; também rejeita compra em ciclo pago com `409` sem alterar saldo/fatura. **Coberto**. |
| 15 | Compra dividida em duas categorias sem duplicar total | E2E dev valida duas categorias distintas que somam `100000`, uma única obrigação e parcelas exatas. **Coberto**. |

## Produto presente e limites verificados

- API HTTP e schemas de runtime estão em `packages/contracts` e `apps/web`; o harness dev e produção verifica autenticação, origem/CSRF, bearers, JSON inválido e valores monetários malformados.
- MCP usa HTTP autenticado para consultar e escrever; testes de protocolo incluem chamadas `tools/call` e replay/cancelamento de previsão. Nenhum acesso MCP direto ao DB foi observado.
- Previsões avulsas, revisões, reversões, preview, fechamento de fatura e a rotina de fechamento automático estão implementados no domínio e expostos nas camadas documentadas em [docs/api.md](api.md) e [docs/mcp.md](mcp.md). E2E dev passou pelos cenários financeiros e MCP previstos no harness.
- Migração, constraints, recuperação e restore foram exercitados localmente com clusters PostgreSQL descartáveis. O Compose foi parseado, mas containers não foram construídos ou iniciados devido à negação do socket Docker.
- Não houve deploy no homelab, teste de backup operacional ou publicação. Esses passos não foram parte deste gate.
- Investimentos seguem fora do escopo, conforme [§17 do modelo](data-model.md#17-investimentos--proposta-futura) e [ADR 0001](adr/0001-investment-accounting.md).

## Comandos para reexecução do gate

Execute sem concorrência entre build/servidores Next. Next dev substitui `.next`, então rode E2E dev, depois rebuild e apenas então E2E produção:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
bash scripts/test-postgres.sh
bash scripts/validate-recovery.sh
docker compose --env-file .env.example -f infra/compose.yml config -q
pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts
npm_config_workspace_concurrency=1 pnpm build
pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts --production
```

O teste de workspace usa somente o PostgreSQL descartável preparado por `scripts/test-postgres.sh`; ele falha caso algum teste seja reportado como skipped. O harness HTTP cria e encerra seu próprio cluster, web e MCP. Runtime PostgreSQL user-space usado neste ambiente: `/tmp/marvin-pg-runtime/usr/bin` e `/tmp/marvin-pg-runtime/usr/lib`. Após um gate completo, só repita checks se houver novas alterações.

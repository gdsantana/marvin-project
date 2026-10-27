# Validação integrada

## Gate de 2026-10-26

O harness cobre autenticação e CSRF, JSON e valores malformados, datas de compra/postagem, parcelamento exato, cashback em conta e cartão, estorno após revisão de categoria, preview sem escrita, previsões, auditoria server-side, reversão/substituição e chamadas MCP reais. E2E dev e produção passaram com PostgreSQL real, migrations, web e MCP. O build final gera `apps/mcp/dist/index.js`; a validação de produção inicia esse artefato compilado e conclui com exit code 0. A sequência de reexecução é E2E dev → build serial → E2E produção, pois Next dev substitui `.next`.

### Evidência observada

- `pnpm install --frozen-lockfile`: passou antes do gate final; lockfile não foi alterado pela instalação.
- `pnpm typecheck`: passou após as alterações visuais e o ajuste de texto de preview.
- `pnpm lint`: passou após a remoção do import sem uso em MCP e o ignore específico de `apps/web/next-env.d.ts` gerado.
- `bash scripts/test-postgres.sh`: 34 testes passaram, zero falhas e zero skips: MCP 4, domínio 11, DB/PostgreSQL 1 e web 18. O aviso de depreciação do `pg` sobre `client.query()` durante outra query não bloqueou a execução.
- `bash scripts/validate-recovery.sh`: passou com migrations, dump/restore entre dois clusters PostgreSQL 18.6 descartáveis, integridade agregada, saldos e replay idempotente.
- `docker compose --env-file .env.example -f infra/compose.yml config -q`: passou. `docker info` foi impedido por `permission denied` no socket `/var/run/docker.sock`; Docker build e deploy não foram executados.
- `npm_config_workspace_concurrency=1 pnpm build`: passou serialmente. Next 15.5.28 compilou as rotas e MCP emitiu `apps/mcp/dist/index.js`. Aviso não bloqueante: plugin Next não detectado na configuração ESLint.
- E2E dev: `pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts` passou com todos os asserts HTTP/MCP e PostgreSQL 18.6 descartável. A regressão verifica que compra nova em fatura paga retorna `409 CONFLICT` e não altera saldo nem fatura; posted date/refund/1x usam um segundo cartão com ciclo aberto e mantêm as mesmas datas e expectativas.
- E2E produção: após rebuild serial, `pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts --production` passou com Next `start`, MCP compilado, PostgreSQL 18.6 descartável e exit code 0. O build MCP sobrescreve o `noEmit` herdado; o `start` real também foi validado com health 200, initialize e `tools/list`.
- Validação visual com Chromium real: 6 rotas autenticadas em mobile 390×844 e desktop 1440×900, conteúdo carregado, sem overflow horizontal, skeleton residual, alertas ou erros de console/página; 20 PNGs e interações documentados em [`ui-validation.md`](ui-validation.md). O texto do preview foi ajustado depois das capturas; não houve nova rodada visual, conforme autorizado.

O harness `scripts/validate-integration.ts` sobe um PostgreSQL 18 descartável em diretório temporário, aplica `pnpm db:migrate`, inicia a API do web e o MCP, executa chamadas HTTP reais e encerra os processos e o cluster que iniciou. Usa apenas contas, dados e credenciais gerados para a execução; não lê `.env` nem imprime credenciais.

## Execução

Com `pnpm install` já concluído e binários PostgreSQL user-space disponíveis, execute dev antes do build porque Next dev substitui `.next`; então gere os artefatos e rode somente a validação de produção:

```bash
pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts
npm_config_workspace_concurrency=1 pnpm build
pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts --production
```

O padrão inicia web e MCP em desenvolvimento. `PG_BIN` e `PG_LIB` podem indicar os diretórios do runtime PostgreSQL; por padrão são `/tmp/marvin-pg-runtime/usr/bin` e `/tmp/marvin-pg-runtime/usr/lib` neste ambiente.

O modo de produção usa `next start` e `apps/mcp` `start`; exige artefatos válidos nos dois workspaces. Não compila automaticamente. Verifique que o build cria `apps/mcp/dist/index.js` antes de iniciar o E2E de produção.

O harness de produção usa o valor do cookie de sessão extraído do login em um cabeçalho `Cookie` montado pelo cliente HTTP fixture. Isso exercita cookies marcados `Secure` no listener HTTP local sem proxy TLS.

Para os testes de workspace com PostgreSQL sem skips, use `scripts/test-postgres.sh`. `PG_BIN_DIR` e `PG_LIB_DIR` podem apontar para outro runtime 18.6; os padrões são `/tmp/marvin-pg-runtime/usr/bin` e `/tmp/marvin-pg-runtime/usr/lib`. O script cria e encerra somente o cluster descartável que iniciou e falha se qualquer teste for reportado como ignorado.

## Cobertura integrada

- Sessão web por cookie, leitura do token CSRF, origem permitida/rejeitada e bloqueio sem autenticação; bearer da API e bearer do Hermes são credenciais independentes.
- JSON malformado e `amountMinor: "abc1.2"` devem retornar HTTP 400.
- `tools/list` e `tools/call` MCP reais para consultas, receitas, despesas, preview, previsões, revisão, reversão, cashback, estorno e pagamento de fatura, incluindo replay e conflito de idempotência.
- Salário, Pix e débito na conta corrente, transferência própria, compras parceladas, datas de fechamento/postagem, fechamento, pagamento parcial e pagamentos concorrentes.
- Cashback em conta corrente e cartão; estorno após reclassificação com `postedOn`, selecionando o ciclo correto; previsão projetada/realizada/cancelada com realização concorrente e vínculo único.
- Revisão e reversão com autoria/origem derivadas no servidor, substituição com relatório e histórico corretos, e bloqueios para duplicatas, despesas reembolsadas, cartão e pagamento de fatura.
- Parse de respostas usando schemas Zod exportados por `@finance/contracts`.
- Invariantes esperados no fixture: `incomeMinorByCurrency.BRL = 502500`, `expenseMinorByCurrency.BRL = 119000`, receita EUR `70000`, e soma dos saldos assinados BRL `383500`. Assim, transferências próprias e pagamentos de fatura não aumentam a despesa.
- O preview é comparado antes/depois nas leituras de transações, faturas e saldo da conta de cartão. Valores financeiros não são inferidos pelo harness.

Quando um código de rota falha, a saída registra apenas status, código/mensagem curta e sanitizada; não inclui cabeçalhos, cookies, bearer, hash de senha ou payload completo. Se PostgreSQL, Next ou MCP falhar, o `finally` encerra clientes, grupos de processos próprios e o cluster temporário.

## Evidência histórica (snapshot anterior)

> Esta seção registra falhas dos snapshots anteriores; os resultados atuais aprovados estão no início deste documento. Os problemas foram corrigidos e a execução final passou em dev e produção.

> As falhas descritas nesta seção pertencem a snapshots anteriores. Os fixes e a execução final aprovados estão registrados no início deste documento; elas não representam o estado atual do gate.

Validação integrada ainda **não aprovada**. O harness iniciou PostgreSQL 18.6 descartável e aplicou a migration. Na primeira passagem pela escrita com chave divergente, `POST /api/v1/transactions/income` respondeu HTTP 500 com corpo vazio; o stderr do Next mostrou `DomainError: Chave de idempotência reutilizada com dados diferentes` em `packages/domain` (função de idempotência). A causa localizada foi a rota retornar a Promise de `transactionResult(...)` sem `await`, escapando do `try/catch`; as cinco rotas foram atualizadas pelo agente web para `return await`. O caso precisa ser reexecutado.

Após essa correção, o web dev iniciou, mas `GET /api/health` respondeu HTTP 500 com `Module not found: Can't resolve 'fs'`. O import trace passou por `pg/lib/connection-parameters.js`, `packages/db/src/client.ts`, `apps/web/src/server/finance.ts` e `apps/web/src/server/automatic-statements.ts` até `apps/web/src/instrumentation.ts`. Esse arquivo de instrumentation e o serviço de fechamento automático pertencem ao agente de automação; o achado foi enviado a esse agente, ao produto e ao pai. O harness falha agora imediatamente em health 5xx e imprime a mensagem saneada.

Por esses bloqueios de inicialização não foi possível chegar à rodada completa de `tools/call`, preview sem escrita ou asserts finais (`502500` receita BRL, `119000` despesa BRL, `70000` receita EUR e saldo assinado BRL `383500`). Esses valores são expectativas codificadas no harness, **não resultados observados**. A evidência integrada continua parcial até nova execução após correção do runtime do web.

A evidência histórica acima era parcial; foi substituída pelo gate final aprovado e pela matriz de 15 cenários em [`docs/verification.md`](verification.md). Para requisitos gerais e limites do MVP, ver [`docs/data-model.md` §11](data-model.md#11-testes-de-aceitação-de-domínio--obrigatórios-antes-de-produção) e [`ARCHITECTURE.md` §§1–5](../ARCHITECTURE.md#1-contexto-e-topologia-atual).

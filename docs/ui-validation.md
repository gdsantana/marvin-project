# Validação visual da interface

## Execução de 2026-10-26

- Ambiente isolado: PostgreSQL 18.6 iniciado em `/tmp/marvin-visual-pg`; migration aplicada com sucesso. O banco contém apenas schema vazio; nenhuma escrita financeira foi feita.
- Web dev iniciou em `http://localhost:3000`; `GET /api/health` respondeu `200` com `{"ok":true,"data":{"status":"ok"}}`.
- O preview colaborativo navegou para a aplicação e chegou a `/login`. Duas capturas (`preview_snapshot`) expiraram. O inventário do navegador alternativo também retornou sem browsers disponíveis.
- **Resultado visual: inconclusivo.** Não houve inspeção de screenshot nem validação de viewport mobile ou desktop. Não afirmar aprovação visual até repetir esta validação com captura funcional e dados sintéticos.

O banco e o servidor desta execução eram processos temporários criados para a validação e foram encerrados ao final da tarefa. A integração ponta a ponta com fixtures e operações financeiras é uma etapa separada, descrita em [integration-validation.md](integration-validation.md).

## Revalidação visual com Chromium — 2026-10-26

A tentativa anterior permanece registrada acima como inconclusiva. Nesta rodada, o app foi iniciado em Next dev na porta 3018 e ligado a um PostgreSQL 18.6 descartável em `/tmp/marvin-ui-validation`. A migration foi aplicada e a interface recebeu fixtures criadas pela API do domínio: três contas/cartão, receitas e despesas, uma despesa dividida entre duas categorias, transferência própria, compra em três parcelas, pagamento parcial e previsões realizada/pendente. As credenciais e os dados foram efêmeros; nenhum dado financeiro real foi usado.

### Navegador e evidência

O preview T3 chegou a `/login`, mas duas tentativas de captura falharam com a mesma mensagem bruta: `Preview snapshot failed: Preview automation snapshot timed out after 15000ms.` O inventário CUA retornou `{"apps":[],"browsers":[]}`. Como alternativa autorizada, usei `/usr/bin/chromium` (155.0.8059.84) e Playwright 1.64.1 instalado somente em `/tmp/marvin-ui-validation/pw`; nenhuma dependência do monorepo foi alterada. O badge de desenvolvimento do Next foi ocultado apenas no contexto de screenshot para não cobrir a navegação móvel. Capturas são PNGs do app real; as imagens foram inspecionadas.

O primeiro script exploratório também encontrou seletores Playwright ambíguos para os dois campos “Valor (R$)” e para o campo “Conta”; os locators foram refinados para o placeholder e `select[name="accountId"]`. Isso era ambiguidade do script de inspeção, não erro da aplicação. A execução final registrou zero erros de console e zero exceções de página.

### Telas autenticadas

Cada rota foi aguardada até renderizar um valor/nome sintético específico e deixar os indicadores de carregamento. Todas as capturas foram feitas em viewport de 390 × 844 e 1440 × 900 px. Nas 12 combinações, `scrollWidth` igualou a largura do viewport; nenhuma exibiu skeleton residual, alerta ou rolagem horizontal.

| Rota | Mobile | Desktop |
|---|---|---|
| Visão geral (saldo BRL 9.490,81; resumo e faturas) | [PNG](screenshots/00-overview-mobile.png) | [PNG](screenshots/00-overview-desktop.png) |
| Contas | [PNG](screenshots/01-accounts-mobile.png) | [PNG](screenshots/01-accounts-desktop.png) |
| Cartões | [PNG](screenshots/02-cards-mobile.png) | [PNG](screenshots/02-cards-desktop.png) |
| Lançamentos | [PNG](screenshots/03-entries-mobile.png) | [PNG](screenshots/03-entries-desktop.png) |
| Faturas | [PNG](screenshots/04-statements-mobile.png) | [PNG](screenshots/04-statements-desktop.png) |
| Relatórios | [PNG](screenshots/05-reports-mobile.png) | [PNG](screenshots/05-reports-desktop.png) |

Também capturei login em [mobile](screenshots/00-login-mobile.png) e [desktop](screenshots/00-login-desktop.png). Na navegação móvel, “Faturas” está presente; o botão “Sair” tem nome acessível. O atalho “Novo” cabe no cabeçalho de 390 px.

### Formulários e interação

- Despesa e divisão de categorias: [topo do formulário](screenshots/06-expense-form-mobile.png) e [fim do formulário](screenshots/07-expense-form-mobile-bottom.png). A categoria ocupa a largura do celular e “Sem categoria” aparece inteiro.
- Preview da despesa com duas categorias: [resultado](screenshots/08-expense-preview-mobile.png). A API de preview respondeu 200; a tela informou que nada foi salvo. Não confirmei a gravação.
- Correção com revisão de categorias: [formulário](screenshots/09-correction-split-mobile.png). Reversão com opção de lançamento substituto: [formulário](screenshots/10-reversal-form-mobile.png). Realização de previsão: [formulário](screenshots/11-realize-forecast-mobile.png).
- O diálogo móvel mede 776 px de altura e rola internamente (conteúdo de 1.402 px na despesa e 1.496 px na reversão). Escape fecha o diálogo e restaura o foco ao seletor que o abriu; Shift+Tab mantém o foco dentro dele.
- Campos monetários aceitam texto decimal, datas usam `type=date`, e conta, forma de pagamento e status usam seletores nativos. Os valores do preview ficaram legíveis.

### Ajustes visuais feitos

Em `apps/web/src/components/workspace.tsx`, traduções de tipos de lançamento e estados da fatura agora aparecem em pt-BR; a capitalização automática que alterava o texto foi removida. Retirei as menções à API e ao domínio das instruções visíveis, troquei o texto por ajuda em linguagem de produto, dei largura total ao seletor de categoria em mobile e encurtei a opção do cabeçalho para “Novo”. Não alterei contratos nem regras financeiras.

Health consultado durante a execução: HTTP 200. Não executei build, typecheck ou testes nesta rodada; o gate coordenado os executará depois do encerramento deste servidor. O Next dev e o PostgreSQL descartável são processos próprios desta validação e serão encerrados antes de liberar o gate.

Após a aprovação das capturas, o texto auxiliar do preview foi refinado para “Confira os dados antes de confirmar. Nenhum dado foi salvo ainda.” As evidências de fluxo permanecem válidas; a captura não foi refeita para essa alteração apenas textual.

## Refatoração visual — 2026-10-26

A entrega aplica tema escuro, tokens semânticos e componentes shadcn `base-nova` com Base UI às seis áreas, login e operações existentes. Geist e JetBrains Mono são servidas localmente. Elementos do Figma sem suporte implementado foram omitidos, incluindo séries mensais, distribuição por categorias indisponível, metas, sincronização e análises por IA. O tema claro não foi implementado; os componentes consomem papéis semânticos que permitem sua inclusão futura.

### Ambiente e comandos

O roteiro `scripts/validate-visual.ts` usa exclusivamente respostas HTTP interceptadas e dados sintéticos, inclusive valores acima da precisão inteira de JavaScript e moedas separadas. Não há gravação no banco pessoal. O servidor visual foi iniciado com `DATABASE_URL` explicitamente apontando para uma porta local sem PostgreSQL; falhas esperadas do scheduler nesse ambiente não correspondem a operações em dados reais.

Comandos executados nesta entrega:

- `pnpm typecheck` e `pnpm lint`: aprovados em todos os workspaces.
- `pnpm --filter @finance/web typecheck` e `pnpm --filter @finance/web lint`: aprovados novamente após os ajustes finais de carregamento de cartões.
- `bash scripts/test-postgres.sh`: 35 testes aprovados, zero skips, em PostgreSQL descartável. Cobertura inclui receita, despesa, transferência, crédito, parcelamento, pagamento parcial, correção, reversão e idempotência.
- `pnpm --filter @finance/web build`: aprovado. A revisão final também compilou uma cópia temporária isolada dos mesmos arquivos web; o servidor de desenvolvimento existente foi preservado.
- `pnpm --filter @finance/web exec tsx ../../scripts/validate-integration.ts --production`: aprovado, com PostgreSQL real descartável, migration, API web e MCP.
- `scripts/validate-visual.ts --self-check`: aprovado; lint explícito do roteiro aprovado.

Reprodução da validação de navegador, com servidor isolado já iniciado e dependência Playwright externa disponível:

```bash
VISUAL_ISOLATED=1 \
PLAYWRIGHT_MODULE=/caminho/node_modules/playwright/package.json \
CHROMIUM_EXECUTABLE=/usr/bin/chromium \
VISUAL_BASE_URL=http://127.0.0.1:3026 \
pnpm --filter @finance/web exec tsx ../../scripts/validate-visual.ts
```

Não executar `next dev` e `next build` sobre o mesmo diretório `.next`. Houve uma tentativa afetada por concorrência de artefatos: as falhas de recursos estáticos foram descartadas e a rodada final foi executada em cópia temporária isolada. Não foi necessário alterar a configuração de implantação.

### O que foi verificado

- Tema escuro sob preferências clara e escura do navegador; tokens obrigatórios presentes, sem seletor de tema.
- Seis rotas autenticadas e login em 390 × 844 e 1440 × 900; navegação por teclado, ausência de rolagem horizontal da página e nomes acessíveis dos controles.
- Treze operações pelo seletor e quatro diálogos contextuais: correção, reversão, realização e cancelamento de previsão. Verificações de contenção, foco inicial, Tab, Shift+Tab, Escape, retorno de foco e movimento reduzido. O roteiro aguarda a atualização assíncrona de foco da primitiva antes das assertivas.
- Respostas de relatório fora de ordem, ausência de dados, falha recuperável e nova tentativa, sem apresentar erro como zero.
- Prévia invalidada após edição; falha de conexão na escrita seguida de repetição com a mesma chave idempotente, corpo e token CSRF.
- Configurações de dois cartões respondendo fora de ordem; resposta do cartão anterior não sobrescreve o selecionado, e salvar fica bloqueado enquanto a configuração carrega. O seletor de novos registros aguarda as referências iniciais para evitar formulário sem seleção.
- Moedas e valores exatos, transferências próprias e pagamentos de fatura identificados conforme dados existentes; ausência de conteúdo financeiro fictício e controles sem suporte.

O bloco responsável por montar e enviar operações financeiras foi comparado com o código anterior à refatoração e permaneceu igual. A apresentação de datas civis foi ajustada para dia/mês/ano, com teste focado sem conversão de fuso. Revisões de código independentes verificaram as correções de consultas, mensagens seguras e quebra de textos longos.

### Contraste e limites

Os pares semânticos opacos finais foram medidos por luminância sRGB; os resultados estão em [visual-reference.md](../specs/refatoracao-visual/visual-reference.md#10-tokens-efetivamente-adotados). Entre eles: texto/fundo 19,06:1, texto auxiliar/superfície muted 5,81:1, texto/botão principal 11,65:1 e contorno de campo/popover 3,55:1. O vermelho de estado foi clareado para aumentar a margem de contraste.

As capturas foram inspecionadas para hierarquia, legibilidade, responsividade e integridade das superfícies. Diálogos possuem rolagem interna: capturas realizadas após os testes de foco podem mostrar a parte inferior do formulário, sem implicar ausência dos campos superiores.

Não houve teste em dispositivo físico nem operação manual com leitor de tela. A árvore de acessibilidade, os nomes dos controles e o foco foram verificados por automação, o que não certifica conformidade integral WCAG 2.2 AA. O build mantém um aviso preexistente sobre ausência do plugin específico do Next.js na configuração ESLint; lint e build concluíram com sucesso. A suíte PostgreSQL emite aviso de depreciação de consultas concorrentes do `pg`, sem falha dos testes.

### Resultado final e evidências

Rodada final em produção isolada: **60 cenários aprovados, zero falhas**, saída 0. A rodada anterior em desenvolvimento aprovou 56 cenários; o cenário adicional de configuração de cartões ampliou a matriz final em quatro combinações. O servidor temporário foi encerrado após a validação; o servidor de desenvolvimento preexistente foi preservado.

Resultados completos: [results.json](screenshots/refatoracao-visual/results.json). Capturas selecionadas do mesmo build, com dados sintéticos:

| Área | Mobile | Desktop |
|---|---|---|
| Login | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-login.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-login.png) |
| Visão geral | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-overview.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-overview.png) |
| Contas | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-accounts.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-accounts.png) |
| Cartões | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-cards.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-cards.png) |
| Lançamentos | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-entries.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-entries.png) |
| Faturas | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-statements.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-statements.png) |
| Relatórios | [PNG](screenshots/refatoracao-visual/390-dark-P1-P4-reports.png) | [PNG](screenshots/refatoracao-visual/1440-dark-P1-P4-reports.png) |

Também foram preservadas capturas de receita, despesa e parcelamento em ambas as larguras, no mesmo diretório. Os números grandes e as descrições extensas nas imagens são casos deliberados de teste, sem dados pessoais.


## Correções de plataforma — 31/10/2026

Roteiro `scripts/validate-visual.ts --audit` aprovado com Chromium real, API interceptada e credenciais fictícias. Foram verificadas seis rotas em 390×844 e 1440×900, filtros de período, visibilidade de cancelamentos, navegação móvel pelo menu Mais e criação de conta sem seletor de moeda. Capturas finais: `/tmp/marvin-visual-d2yAM7`. A inspeção visual corrigiu um caso em que descrição extensa comprimia o valor mobile; não houve rolagem horizontal ou erro JavaScript nos cenários finais.

O modo histórico sem `--audit` contém seletores da navegação anterior; não representa um gate aprovado atual. Evidências globais e limites estão em [verification.md](verification.md). Não foram repetidos contraste integral, leitor de tela ou dispositivo físico.

# Identidade visual Marvin Finanças

Referência: https://www.figma.com/design/CpQA20cURuJQxt8wFlftJD/Marvin-Finnace-app?node-id=0-1

Frames consultados: dashboard mobile `2009:5`, dashboard desktop `2009:924`, extrato mobile `2009:403`, extrato desktop `2009:1466`, nova transação desktop `2009:2033` e relatórios desktop `2009:2363`.

## Fundação compartilhada

Os tokens ficam em `apps/web/src/app/globals.css`. Os componentes de interface usam os nomes semânticos do Tailwind para propagar a identidade às contas, cartões, faturas, relatórios, formulários e login.

| Token | Valor | Uso |
| --- | --- | --- |
| background | #09090b | Fundo |
| card | #121215 | Cartões |
| surface | #18181b | Superfícies internas |
| primary e success | #4edea3 | Destaque e entradas |
| destructive | #ffb2b7 | Valores de saída e erros |
| chart-income | #10b981 | Séries de entradas |
| chart-expense | #e11d48 | Séries de saídas |
| border | #27272a | Divisórias |

Geist Variable é a fonte de interface; JetBrains Mono Variable é usada em valores e metadados. O raio base é 12 px. A ação padrão usa fundo claro, conforme as ações principais desktop no Figma.

## Adaptação aos recursos existentes

A navegação mobile oferece Início, Nova, Transações, Relatórios e Mais. Mais preserva o acesso às contas, cartões, faturas e saída. O Figma usa Perfil, mas não existe essa rota na aplicação.

Gráficos usam dados reais por moeda. Não se introduziram indicadores fictícios de sincronização bancária, orçamento ou inteligência artificial. Percentuais de categorias mantêm a base em valores absolutos e informam a possibilidade de despesas negativas por reembolsos.

## Extrato, relatórios e nova transação

O extrato combina busca, tipo, conta e categoria. Categorias divididas são pesquisadas individualmente, e o filtro de conta considera todas as entradas de uma transferência. Limpar filtros restaura a lista completa. A tabela mantém rolagem horizontal no desktop quando necessário; valores longos podem quebrar linha nos cartões mobile.

Relatórios apresentam histórico mensal e categorias lado a lado em telas grandes, empilhados em mobile. A quantidade de colunas do gráfico acompanha a série retornada, inclusive para o intervalo anual.

A nova transação mantém os campos e o fluxo de revisão existentes, com uma lateral de saldos por conta e movimentações recentes no desktop. No mobile, esse contexto aparece depois do formulário. Saldos são atuais, sem simular um saldo projetado antes da validação.

Validação desta entrega: `pnpm typecheck`, `pnpm lint`, `pnpm build` e `pnpm test` com PostgreSQL descartável passaram. Foram 50 testes aprovados, sem skips, incluindo relatórios por categoria, filtros, formatação, histórico anual com 12 meses, parcelamento, seed e limpeza. O banco de desenvolvimento não foi alterado por essa validação. A comparação visual em navegador permanece pendente.

## Pendências de fidelidade

Esta adaptação ainda não representa uma reprodução integral validada das telas do Figma. Relatórios mantêm as análises existentes; o formulário mantém os campos e a revisão financeira já implementados. Faltam comparação visual em navegador mobile e desktop e conferência dos assets exportados. O download do asset de marca falhou por resolução de DNS no ambiente; manteve-se o WebP existente, também referenciado nos metadados de ícones. O arquivo de ícone SVG legado continua no projeto.

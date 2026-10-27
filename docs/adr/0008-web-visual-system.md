# ADR 0008 — Sistema visual da aplicação web

- Data: 2026-10-26
- Status: aceito, conforme aprovação da pessoa mantenedora

## Contexto

A refatoração visual aproxima as telas existentes da referência Figma sem alterar capacidades financeiras. Os [requisitos](../../specs/refatoracao-visual/requirements.md) definem tema exclusivamente escuro, aparência semântica compartilhada e omissão de funcionalidades sem suporte real. O [design](../../specs/refatoracao-visual/design.md) orienta extração incremental de apresentação e preservação de contratos e operações.

A mudança se limita à UI em `apps/web`, respeitando [ARCHITECTURE.md §6](../../ARCHITECTURE.md#6-ui) e os invariantes do [modelo financeiro §§1 e 11](../data-model.md). O protótipo não autoriza novas métricas, integrações ou regras financeiras.

## Decisão

1. Disponibilizar somente tema escuro, inclusive no login e nos diálogos. A raiz recebe `.dark` e `color-scheme: dark`; não há paleta clara, seletor de tema ou detecção da preferência de aparência do dispositivo.
2. Centralizar em `globals.css` tokens CSS semânticos e pares de superfície/conteúdo, além de ações, estados, bordas, entrada, foco e navegação. O mapeamento `@theme inline` integra esses papéis ao Tailwind 4. Um tema claro futuro poderá fornecer outros valores para os mesmos papéis; essa preparação não constitui implementação de tema claro.
3. Usar shadcn/ui com estilo `base-nova`, registrado em `apps/web/components.json`, e componentes reais em `components/ui`. Base UI fornece primitivas de comportamento onde aplicável, incluindo botão e diálogo; cartões, campos e feedback são composições locais dessa base visual. Não se trata apenas de aplicar cores a controles próprios.
4. Servir Geist e JetBrains Mono localmente por `@fontsource-variable/geist` e `@fontsource-variable/jetbrains-mono`, importadas no layout, com alternativas de sistema. Ambas usam SIL Open Font License 1.1, conferida nos pacotes instalados; preservar avisos e licenças na redistribuição. Não depender de requisições de fontes a serviços externos.
5. Separar apresentação incrementalmente: `app-shell.tsx` organiza cabeçalho e navegação mobile/desktop; `action-dialog.tsx` apresenta campos, prévias e revisões; `workspace.tsx` mantém sessão, consultas e coordenação das operações. Tipos de apresentação e formatação compartilhada ficam no web. Domínio e contratos permanecem intactos, assim como API, MCP, persistência e autenticação.
6. Preservar o fluxo de envio existente, incluindo montagem dos corpos, CSRF, prévia, revisão e reutilização da chave idempotente. Componentes de apresentação não mantêm cálculos financeiros próprios.
7. Omitir funcionalidades do Figma sem implementação ou dados suficientes: metas, sincronização bancária, análises por IA, séries históricas e gráficos por categoria indisponíveis. Não substituí-las por exemplos financeiros, controles desabilitados ou anúncios de funcionalidades futuras. Preservar previsões e operações já existentes, valores inteiros e separação por moeda.

## Alternativas consideradas

- Apenas trocar cores dos controles próprios: menor esforço inicial, mas mantém duplicação de estilos e comportamentos. A adoção limitada das primitivas e composições shadcn foi preferida para consistência.
- Reescrever toda a interface e seu fluxo de dados: aumenta o risco de alterar prévias, confirmações e idempotência. A extração incremental preserva a coordenação existente.
- Copiar integralmente o Figma, incluindo dados ilustrativos, ou entregar tema claro agora: contraria o escopo aprovado e poderia comunicar capacidades financeiras inexistentes.

## Consequências e limites

A apresentação passa a compartilhar tokens, tipografia e variantes; novos componentes devem consumir esses papéis. O web assume a manutenção das composições shadcn e das dependências Base UI e Fontsource. Os estilos legados sem consumidores foram removidos após a migração.

Mobile first, foco visível, estados de consulta e preferência por movimento reduzido orientam a implementação. Primitivas acessíveis não comprovam, sozinhas, conformidade WCAG, contraste ou operação integral por teclado. A identidade pode se afastar de amostras literais do Figma quando a legibilidade exigir ajustes.

## Verificação e acompanhamento

A implementação é verificada por typecheck, lint, build, testes financeiros em PostgreSQL descartável, integração web/MCP e cenários de navegador com dados sintéticos. Os comandos, resultados e limites estão em [docs/ui-validation.md](../ui-validation.md). Essa validação não equivale a uma certificação integral WCAG ou a testes em dispositivos físicos.

Reavaliar a decisão quando houver demanda aprovada por tema claro ou novos dados/recursos reais, ou quando validações demonstrarem limitações das primitivas escolhidas. Novas capacidades financeiras exigem escopo próprio; esta decisão não as autoriza.

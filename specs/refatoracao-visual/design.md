# Design: Refatoração visual da plataforma

> Status: **Aprovado pela pessoa mantenedora**  
> Requisitos vinculados: `specs/refatoracao-visual/requirements.md`

## 1. Objetivos e Não-Objetivos

**Objetivos**

- Aplicar a identidade escura do Figma às seis áreas autenticadas, ao login e às superfícies de operações, com prioridade às quatro referências desenhadas.
- Organizar elementos visuais reutilizáveis segundo as convenções de composição e temas do shadcn, preservando fluxos financeiros e a acessibilidade.
- Distinguir dados reais, estados vazios e falhas, sem transformar exemplos do protótipo em funcionalidades existentes.

**Não-Objetivos**

- Alterar domínio, persistência, contratos, autenticação, topologia ou regras de cálculo.
- Criar integrações bancárias, metas, investimentos, notificações ou análises por inteligência artificial.
- Criar séries históricas ou indicadores novos que dependam de definições financeiras ou dados indisponíveis.

## 2. Arquitetura de Alto Nível

A mudança se concentra em `apps/web`: rotas atuais continuam encaminhando para `Workspace`, que mantém o controle de sessão, consultas e operações. Os componentes de apresentação recebem dados e callbacks; não consultam banco nem calculam regras financeiras. `formatMinor` e os contratos de resposta permanecem a referência para moeda e precisão. O MCP e os pacotes compartilhados não são alterados.

O arquivo `workspace.tsx` concentra hoje navegação, estado, chamadas, telas e formulários. A extração proposta é incremental e restrita aos componentes visuais diretamente envolvidos; a lógica de prévia, revisão, CSRF e chave de idempotência deve manter o mesmo ciclo de vida. O tema e os componentes shadcn são introduzidos em `apps/web` porque ainda não existe configuração nem componentes dessa biblioteca no checkout.

## 3. Componentes

Os caminhos novos abaixo são responsabilidades propostas, sujeitos às convenções efetivas ao implementar. Não é necessário criar um arquivo para cada elemento simples.

### 3.1 Tema semântico e primitivas

- **Propósito**: definir uma linguagem visual comum.
- **Tipo**: estilos e componentes de UI em `apps/web/src/app/globals.css` e `apps/web/src/components/ui/`.
- **Entradas / Saídas**: variáveis semânticas para superfícies, texto, ação, borda, foco e estados; variantes reutilizáveis de controles.
- **Responsabilidades**: mapear amostras do Figma a papéis semânticos shadcn, padronizar tipografia, espaçamento, raio, superfícies e variantes. Priorizar composição de `Button`, `Card`, `Input`, `FieldGroup`, `Field`, `FieldLabel`, `Select`, `Dialog`, `Alert`, `Empty`, `Skeleton` e outros componentes apenas quando necessários. Usar Geist e JetBrains Mono com carregamento e alternativas adequados ao Next.js; verificar licença e disponibilidade antes da inclusão.
- **Não-responsabilidades**: criar novos estados financeiros ou impor cores que falhem em contraste.
- **Requisitos atendidos**: 1.1–1.7, 6.1–6.2, 7.1, 7.4–7.6.

O tema deve usar variáveis CSS semânticas e pares de superfície/conteúdo do shadcn, incluindo `background`/`foreground`, `card`/`card-foreground`, `primary`/`primary-foreground`, `muted`/`muted-foreground`, além de borda, entrada, foco e navegação. Mapear esses papéis no `@theme inline` do Tailwind 4, no CSS global existente. Aplicar `.dark` na raiz desde a renderização inicial e `color-scheme: dark`; não adicionar seletor, detecção automática ou paleta clara nesta entrega. Um futuro tema claro deverá fornecer novos valores para os mesmos papéis, sem reescrever os consumidores.

As cores pertencem aos tokens e às variantes compartilhadas; evitar cores literais e sobrescritas `dark:` por componente. Preferir variantes existentes antes de estilos locais. Compor cartões com suas regiões, formulários com `FieldGroup` e `Field`, validação com `data-invalid` e `aria-invalid`, e diálogos com título acessível. Usar primitivas de feedback e manter o comportamento de foco fornecido pela base escolhida. Consultar a documentação de cada componente antes de implementá-lo.

### 3.2 Estrutura e navegação

- **Propósito**: acomodar navegação e conteúdo em todas as larguras.
- **Tipo**: componentes de UI extraídos de `Workspace` em `apps/web/src/components/`.
- **Entradas / Saídas**: seção atual, links existentes, ação de abertura de formulário e saída da sessão.
- **Responsabilidades**: navegação lateral desktop, navegação móvel com área segura, cabeçalho, indicação da página atual e espaço para conteúdo; preservar as seis rotas e as ações de login e saída.
- **Não-responsabilidades**: adicionar destinos ou buscas fictícias.
- **Requisitos atendidos**: 2.1–2.5, 7.2, 7.6.

### 3.3 Painel financeiro

- **Propósito**: exibir os dados atuais de resumo com a hierarquia do Figma.
- **Tipo**: apresentação de `Overview` e `SummaryTile`.
- **Entradas / Saídas**: `References`, `ReportData`, período e callbacks existentes; links para lançamentos e faturas.
- **Responsabilidades**: exibir saldo, receitas e despesas por moeda, período, transações recentes e faturas; reaproveitar `formatMinor`; mostrar estado apropriado para dados ausentes.
- **Não-responsabilidades**: criar conversão cambial, cálculo de patrimônio, séries históricas, metas ou classificação de operações no navegador. Não chamar saldo de contas de patrimônio líquido sem definição correspondente.
- **Requisitos atendidos**: 3.1–3.5, 5.4.

### 3.4 Listas, extrato e recursos

- **Propósito**: aplicar a linguagem visual a contas, cartões, lançamentos, previsões e faturas.
- **Tipo**: apresentação de `ResourceSection`, `Rows` e `ExpenseForecasts`.
- **Entradas / Saídas**: coleções atuais e callbacks de criação, correção, reversão e realização/cancelamento de previsão.
- **Responsabilidades**: preservar valores, datas, vínculos, revisões, condições das ações e navegação; adaptar listas ao espaço disponível. Manter busca e filtros somente onde já existirem.
- **Não-responsabilidades**: filtrar a partir de uma amostra parcial como se fosse o histórico completo ou reclassificar transações.
- **Requisitos atendidos**: 2.1, 4.1–4.3, 6.3.

### 3.5 Formulários e diálogos

- **Propósito**: aplicar o desenho de nova transação aos fluxos existentes sem perder seus campos ou garantias.
- **Tipo**: `ActionDialog`, `Field`, `CategorySplits`, prévia e revisão.
- **Entradas / Saídas**: ação, dados de referência, seleção, estado de envio, resultado de prévia e callbacks existentes; eventos de formulário mantêm o contrato atual.
- **Responsabilidades**: compor campos acessíveis, agrupar dados relacionados, destacar valor, preservar alocações e opções específicas; manter prévia, revisão de reversão, validação, foco, fechamento e resultado de envio.
- **Não-responsabilidades**: alterar corpos HTTP, validações financeiras, política de confirmação ou tratamento idempotente; não substituir o formulário abrangente por um formulário simplificado que omita capacidades.
- **Requisitos atendidos**: 4.4–4.6, 6.3, 7.2–7.5, 7.8.

### 3.6 Relatórios e estados de consulta

- **Propósito**: apresentar o resumo existente e diferenciar carregamento, ausência de dados e erro.
- **Tipo**: `Reports` e apresentação dos estados de consulta de `Workspace`.
- **Entradas / Saídas**: período, `ReportData`, estado da consulta e callback de nova tentativa.
- **Responsabilidades**: exibir receitas e despesas por moeda; separar carregamento inicial, revalidação, vazio e erro; descartar respostas antigas após troca de período e não rotular resultados anteriores como pertencentes ao novo período. Não mostrar zero como substituto de falha. Uma nova tentativa repete a leitura sem criar escrita financeira.
- **Não-responsabilidades**: derivar gráficos de categoria ou séries históricas de dados parciais, expor mensagens técnicas ou incluir indicadores fictícios.
- **Requisitos atendidos**: 3.2–3.3, 5.1–5.4, 7.7–7.8.

### 3.7 Autenticação e mensagens

- **Propósito**: harmonizar login e feedback com a plataforma.
- **Tipo**: `login-form.tsx`, `login/page.tsx` e mensagens compartilhadas.
- **Entradas / Saídas**: fluxo de sessão, resultado de autenticação e estados de operação já existentes.
- **Responsabilidades**: preservar redirecionamento, mensagens compreensíveis e apresentação sem dados sensíveis; usar mensagens acessíveis e manter sucesso perceptível após gravação.
- **Não-responsabilidades**: modificar credenciais, políticas de sessão, endpoints ou proteção CSRF.
- **Requisitos atendidos**: 1.2–1.4, 2.5, 4.5–4.6, 6.3, 7.1–7.2, 7.7–7.8.

## 4. Modelo de Dados

Nenhuma alteração de tabelas, esquema, índices, migração ou dados. O estado de apresentação pode distinguir `carregando`, `pronto`, `vazio` e `erro` por consulta, incluindo período associado ao resultado. Essa representação é efêmera no cliente e não introduz valores financeiros persistidos.

## 5. APIs / Contratos

Nenhum endpoint ou contrato público será criado ou alterado. As leituras atuais incluem `/api/v1/accounts`, `/api/v1/categories`, `/api/v1/transactions`, `/api/v1/statements`, `/api/v1/institutions`, `/api/v1/expense-forecasts` e `/api/v1/reports/summary`. O resumo retorna saldos, receitas e despesas agrupados por moeda para um intervalo, mas não retorna séries mensais nem agregação por categoria. A lista de transações tem intervalo limitado e não é fonte suficiente para inferir relatórios completos.

As escritas existentes continuam utilizando suas rotas, token CSRF, chave de idempotência e prévia quando aplicável. Ao refatorar o diálogo, preservar chave e assinatura de uma tentativa com resultado incerto: repetir a mesma operação não deve criar uma segunda movimentação.

## 6. Preocupações Transversais

### 6.1 Segurança

Preservar autenticação e redirecionamentos; não colocar tokens, corpos financeiros ou mensagens privadas em logs. Mensagens de erro exibem orientação genérica; erros de validação permitidos podem identificar o campo sem reproduzir o conteúdo sensível. Não alterar proteção de sessão nem acesso de cliente ao servidor.

### 6.2 Desempenho e escalabilidade

Não adicionar consultas por cartão ou por linha. Reutilizar as leituras atuais e medir as telas no conjunto de dados de validação existente; carregar fontes e eventuais componentes gráficos de modo a evitar peso desnecessário. O projeto não estabelece orçamento numérico aprovado: registrar medidas antes e depois e investigar regressões observáveis sem inventar uma meta.

### 6.3 Observabilidade

Manter o tratamento de erro existente sem registrar dados financeiros completos. Na validação de interface, registrar rota, estado, resultado e erros de console sem conteúdo pessoal; usar dados sintéticos. Não apresentar mensagens brutas de infraestrutura à pessoa usuária.

### 6.4 Acessibilidade e UX

**Fluxo principal**: abrir a área → consultar dados ou estado da consulta → selecionar uma ação existente → preencher → revisar quando aplicável → confirmar → receber resultado. Erros de envio mantêm o formulário e o contexto; uma resposta incerta mantém a chave da tentativa.

**Inventário de telas**:

| Superfície | Objetivo e ação principal | Regiões e comportamento |
|---|---|---|
| Resumo `/` | Consultar a situação; **Ver lançamentos** | Cabeçalho, período, totais por moeda, transações recentes e faturas. |
| Contas `/accounts` | Consultar contas; **Nova conta** | Lista de contas e saldos, com ação existente de criação. |
| Cartões `/cards` | Consultar cartões; **Nova conta** | Lista e ação existente de configuração de cartão. |
| Lançamentos `/entries` | Consultar histórico; **Nova receita** | Lançamentos, detalhes, correções e reversões; previsões com ações existentes. |
| Faturas `/statements` | Consultar faturas; **Fechar fatura** | Lista com vencimento, estado e valor; operações existentes acessíveis. |
| Relatórios `/reports` | Consultar totais; **Selecionar período** | Seletor de período e receitas/despesas por moeda. |
| Formulário de operação | Registrar ou revisar operação; **Confirmar** conforme ação | Tipo, campos agrupados, alocações, prévia/revisão quando aplicável e mensagens junto aos campos. |
| Login `/login` | Iniciar sessão; **Entrar** | Campo de senha e retorno acessível de erro. |

Os rótulos específicos devem ser reconciliados com o código durante a implementação; não alterar o significado das ações. O seletor de período é o controle principal do relatório, mesmo não sendo botão.

**Estados aplicáveis a listas, resumo e relatórios**:

| Estado | Tratamento e texto proposto |
|---|---|
| Carregamento inicial | Indicador e texto para leitores: “Carregando dados”. Não mostrar dados vazios como resultado. |
| Revalidação | Manter dados anteriores identificados pelo período anterior e informar “Atualizando dados”; se isso não for possível, ocultá-los até chegar o novo resultado. |
| Sem registros | “Você ainda não tem registros.” Oferecer a ação de criação existente correspondente; relatórios sem dados mostram “Não há movimentações neste período.” |
| Filtro sem resultados | Onde houver filtro existente: “Nenhum resultado para os filtros selecionados.” Oferecer “Limpar filtros”. |
| Falha de rede ou servidor | “Não foi possível carregar os dados. Tente novamente.” Ação “Tentar novamente”; apresentar falha do relatório separadamente da lista. |
| Sessão expirada / sem permissão | Manter redirecionamento de sessão existente; para acesso negado, “Você não tem permissão para acessar esta área.” Não oferecer repetição automática. |
| Página inexistente | Usar a resposta 404 existente e oferecer retorno ao início quando a apresentação for ajustada. |
| Ação indisponível | Manter a condição existente, sem sugerir que ação desabilitada foi executada; explicar o motivo quando a interface tiver essa informação. |
| Sucesso de operação | Mensagem persistente no contexto ou anunciada por região de estado, dados afetados atualizados; não depender apenas de uma notificação temporária. |

**Formulários**: erros de campo ficam junto ao controle, associados por identificador e com `aria-invalid`; o envio pendente desabilita repetição e anuncia “Salvando”; falha geral usa região de alerta e mantém entrada, prévia aplicável e chave de tentativa. Sucesso comunica a operação e atualiza a tela. Ao trocar tipo ou editar dados que invalidem a prévia, manter o descarte de prévia já existente. Em caso de resultado incerto, permitir repetição com a mesma chave; não prometer preservação de entrada após fechamento ou recarga, que não faz parte do comportamento atual.

**Interações e acessibilidade**: Tab percorre navegação, título, controles e conteúdo em ordem lógica; Enter ou Espaço aciona controles, Escape fecha o diálogo quando permitido, foco fica no diálogo e retorna ao disparador. Controles por ícone recebem nome acessível; gráficos eventualmente suportados precisam de alternativa textual com período, moeda, categorias e valores. Alvos de toque devem ter pelo menos 44 × 44 px, sem encobrir conteúdo pela navegação fixa. Texto normal atinge contraste mínimo de 4,5:1 e texto grande e componentes aplicáveis 3:1; verificar foco e demais critérios WCAG 2.2 AA no contexto real. Desabilitar movimento não essencial sob preferência de movimento reduzido. Não usar cor como única indicação de receita, despesa ou erro.

### 6.5 Internacionalização

Textos em pt-BR; manter rótulos e datas compreensíveis. `formatMinor` utiliza inteiros e formatação pt-BR, sempre com moeda explícita. Nenhum valor é convertido para ponto flutuante para apresentação ou cálculo financeiro.

## 7. Decisões e Trade-offs

### 7.1 Tema semântico e componentes shadcn

- **Contexto**: o Figma exige uma identidade nova; o checkout usa classes e cores próprias sem configuração shadcn.
- **Opções consideradas**:
  - A. Introduzir gradualmente configuração e componentes shadcn necessários, com tokens semânticos — facilita variantes e coerência, mas adiciona dependências e trabalho de migração.
  - B. Manter todos os controles próprios e apenas trocar cores — reduz mudança inicial, mas mantém comportamentos e estilos duplicados.
- **Decisão**: A, limitada aos componentes efetivamente necessários; verificar documentação e versões antes de adicionar dependências.
- **Consequências**: a adoção será explícita no `apps/web`; componentes existentes não devem ser sobrescritos automaticamente e a configuração deve respeitar Tailwind 4 e pnpm.

### 7.2 Tema escuro e contraste

- **Contexto**: a referência é escura e alguns tons cinza pequenos podem não cumprir contraste.
- **Opções consideradas**:
  - A. Usar o tema escuro com ajustes acessíveis e valores semânticos — aproxima do Figma e preserva legibilidade.
  - B. Copiar cada cor literalmente — maior fidelidade superficial, com risco de contraste insuficiente.
- **Decisão**: A. Disponibilizar somente o tema escuro, inclusive no login e nos diálogos, independentemente da preferência do dispositivo. Preparar a estrutura semântica para um tema claro futuro, sem implementar sua paleta ou seletor agora.
- **Consequências**: cores exatas podem mudar após medição; documentar os pares efetivos e os resultados de contraste antes da implementação final.

### 7.3 Dados ausentes no protótipo

- **Contexto**: o resumo atual não fornece série mensal nem distribuição por categoria; o protótipo inclui metas, sincronização e análises não implementadas.
- **Opções consideradas**:
  - A. Omitir elementos sem capacidade real e preservar os dados e recursos atuais — evita ambiguidade, mas reduz fidelidade ao protótipo.
  - B. Exibir controles e dados ilustrativos — reproduz aparência, mas pode induzir decisões financeiras incorretas.
- **Decisão**: A, conforme decisão da pessoa mantenedora. Omitir blocos, indicadores, controles e destinos sem suporte implementado, inclusive gráficos sem dados completos; não substituí-los por exemplos, controles desabilitados ou avisos de funcionalidade futura. Previsões já existentes continuam disponíveis e identificadas como tais.
- **Consequências**: novas métricas exigem iniciativa funcional separada; a omissão nesta entrega é uma decisão resolvida e não autoriza novos contratos.

### 7.4 Extração incremental da interface

- **Contexto**: `Workspace` concentra consultas, formulários e visualização, inclusive idempotência e prévias.
- **Opções consideradas**:
  - A. Extrair apresentação em partes pequenas, preservando estado e fluxo — menor risco funcional, com convivência temporária de estilos.
  - B. Reescrever toda a interface e fluxo de dados — permite reorganização ampla, mas aumenta risco de regressões financeiras.
- **Decisão**: A.
- **Consequências**: validar cada superfície e remover estilos antigos somente quando não houver mais uso, sem limpeza de escopo alheio.

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Perda de campo, prévia ou chave idempotente no diálogo | Média | Alta | Comparar cada ação antes/depois e testar repetição de envio com dados sintéticos. |
| Dados antigos apresentados sob período novo | Média | Alta | Vincular resultado ao intervalo, cancelar ou ignorar respostas anteriores e testar alternância rápida. |
| Contraste insuficiente na paleta escura | Alta | Média | Medir combinações reais e ajustar tokens semânticos. |
| Dados ou ações fictícias do Figma confundirem a pessoa | Média | Alta | Omitir capacidades sem suporte; identificar dados e estados reais. |
| Regressão em mobile ou navegação por teclado | Média | Alta | Validar as seis rotas, login e diálogos nas duas larguras, além de teclado e leitor de tela. |
| Perda de dependências ou diferenças de componentes shadcn | Média | Média | Inspecionar configuração e documentação, adicionar apenas primitivas necessárias e executar verificações do workspace. |

## 9. Migração / Rollout

A migração é local à interface, em etapas revisáveis: tema e primitivas; estrutura de navegação; telas; formulários e estados; validação integrada. A entrega final deve ser avaliada em conjunto, sem exigir migração de dados ou alteração de implantação. Usar dados sintéticos e não executar operações no banco pessoal. Validar `pnpm --filter @finance/web typecheck`, `pnpm --filter @finance/web lint`, testes aplicáveis e `pnpm --filter @finance/web build`, além de capturas mobile e desktop e testes de fluxo, estados, contraste e teclado.

## 10. Cobertura de Requisitos

| Requisito | Coberto por |
|---|---|
| 1.1 | §3.1, §7.2 |
| 1.2 | §3.1, §3.7 |
| 1.3 | §3.1, §3.4, §3.7 |
| 1.4 | §3.1, §6.5 |
| 1.5 | §3.1, §7.2 |
| 1.6 | §3.1, §7.1–§7.2 |
| 1.7 | §3.1, §6.4, §7.2 |
| 2.1 | §3.2, §3.4 |
| 2.2 | §3.2, §6.4 |
| 2.3 | §3.2 |
| 2.4 | §3.2, §6.4, §9 |
| 2.5 | §3.2, §3.7 |
| 3.1 | §3.3 |
| 3.2 | §3.3, §3.6, §5 |
| 3.3 | §3.3, §3.6, §6.4 |
| 3.4 | §3.3, §5 |
| 3.5 | §3.3, §6.5 |
| 4.1 | §3.4 |
| 4.2 | §3.4, §6.4 |
| 4.3 | §3.4, §6.4 |
| 4.4 | §3.5, §6.4 |
| 4.5 | §3.5, §3.7, §6.4 |
| 4.6 | §3.5, §3.7, §6.4 |
| 5.1 | §3.6, §5 |
| 5.2 | §3.6, §6.4, §7.3 |
| 5.3 | §3.6, §6.4 |
| 5.4 | §3.3, §3.6, §7.3 |
| 6.1 | §3.1 |
| 6.2 | §3.1, §7.1 |
| 6.3 | §3.4–§3.7, §5 |
| 7.1 | §3.1, §6.4 |
| 7.2 | §3.2, §3.5, §6.4 |
| 7.3 | §3.5, §6.4 |
| 7.4 | §3.1, §6.4 |
| 7.5 | §3.1, §6.4 |
| 7.6 | §3.2, §6.4, §9 |
| 7.7 | §3.6, §6.4 |
| 7.8 | §3.7, §6.1, §6.3 |

## 11. Questões em Aberto

Nenhuma decisão de produto pendente para este escopo. A omissão de funcionalidades não implementadas e a disponibilidade exclusiva do tema escuro foram confirmadas. O tema claro fica para entrega futura, apoiado nos mesmos papéis semânticos. O inventário final de cores, a verificação de fontes e a medição de contraste permanecem verificações técnicas obrigatórias antes da conclusão da implementação.

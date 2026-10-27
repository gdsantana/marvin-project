# Referência técnica visual — tarefa 1.1

Inventário documental concluído em 26/10/2026. Escopo: leitura do checkout e consulta às fontes oficiais; nenhuma alteração de produção, instalação, operação financeira ou extração remota do Figma. Este documento é a referência para as próximas tarefas, não evidência de que a refatoração ou sua validação visual já ocorreu. A autorização da pessoa usuária permite prosseguir sem aprovações intermediárias; esta execução abrange exclusivamente 1.1.

## 1. Base e rastreabilidade

Lidos `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `docs/data-model.md` e os três documentos `requirements.md`, `design.md` e `tasks.md` desta especificação. Fontes locais de comportamento: `apps/web/src/components/workspace.tsx`, `login-form.tsx`, `finance-format.ts`, rotas em `apps/web/src/app`, `globals.css`, `layout.tsx` e `apps/web/package.json`.

Limites: arquitetura §§2–4, 6 e 8; modelo §§2, 4.2–4.15, 5–6, 8 e 11. Dinheiro permanece inteiro/string, com moeda explícita; saldo não é patrimônio líquido; transferência e pagamento de fatura não são despesas. Parcelas não duplicam a despesa integral. Previsões não entram em saldo nem relatório antes da realização. Investimentos (§17) continuam futuros. O checkout atual termina a arquitetura em §10; a referência a §12 em instruções/modelo não corresponde a seção disponível e não foi corrigida nesta tarefa.

### Figma reutilizado dos requisitos

Arquivo [Marvin Finnace app](https://www.figma.com/design/CpQA20cURuJQxt8wFlftJD/Marvin-Finnace-app?node-id=0-1), chave `CpQA20cURuJQxt8wFlftJD`, nó registrado `0:1`. Os requisitos não registram IDs individuais dos frames; não inventar IDs nem afirmar conferência remota frame a frame.

| Referência extraída | Aplicação no código | Adaptação necessária |
|---|---|---|
| Painel financeiro, mobile 390 px e desktop 1280 px | `/`, `Overview`, `SummaryTile` | Saldo nas contas, receitas/despesas por moeda, recentes e faturas reais; omitir patrimônio e gráficos sem contrato |
| Extrato de transações | `/entries`, `ResourceSection`, `Rows` | Preservar detalhes, revisões, vínculos e previsões; não copiar busca/filtros inexistentes |
| Nova transação | `ActionDialog`, não há rota própria | Manter todas as 17 operações, campos e revisões, não só o formulário ilustrativo |
| Relatórios e análises | `/reports`, `Reports` | Totais reais por moeda e período; omitir análises e séries indisponíveis |
| Navegação lateral/cabeçalho e navegação móvel | Estrutura de `Workspace` | Seis destinos reais, sessão, criação e saída |
| Sem equivalente extraído | Contas, cartões, faturas, login, correção/reversão e previsões | Aplicar a linguagem visual sem perder funções |

Amostras observadas: fundo `#09090b`, painel `#121215`, superfície de relatórios `#1c1b1d`, verde `#4edea3`, vermelho `#f43f5e`; Geist e JetBrains Mono; raio de cartões 12 px e margem móvel 16 px. Os demais valores abaixo são propostas técnicas, não novas amostras atribuídas ao Figma. Validar a entrega em 390 × 844 e 1440 × 900, mesmo que o frame desktop extraído tenha 1280 px.

## 2. Fluxos, superfícies e controles atuais

Fluxo de acesso: abrir rota → consultar `GET /api/auth/session` → sem sessão/falha redirecionar a `/login` → enviar senha a `POST /api/auth/login` → sucesso redirecionar a `/` e atualizar router. Login tem senha obrigatória, `autocomplete=current-password`, foco inicial, botão Entrar/Verificando e erro `role=alert`. Não há cadastro, recuperação de senha ou seletor de tema. A captura de falha de rede/JSON do login ainda não é tratada com `catch/finally`.

Fluxo autenticado: preparar espaço → carregar referências → exibir área → abrir ação → preencher → prévia ou revisão quando aplicável → confirmar → POST → “Registro salvo.” em `role=status`, fechar diálogo e recarregar referências/resumo. Falha mantém formulário e mensagem. Saída usa `DELETE /api/auth/session` com CSRF e redireciona ao login.

| Área/componente | Dados visíveis e controles existentes |
|---|---|
| Estrutura global | Marca com link `/`, título/introdução por seção, seletor Novo com 13 ações primárias, saída no cabeçalho e lateral; lateral a partir de `md`, navegação inferior com seis links abaixo de `md`, `aria-current`, safe areas e espaço inferior |
| `/` Visão geral | Seletor Este mês/Mês passado/Este ano; saldo nas contas, receitas e despesas por moeda; últimas cinco transações da coleção em ordem inversa; até quatro faturas não pagas; links Ver lançamentos/Ver faturas; atalhos para conta, categoria e receita |
| `/accounts` Contas | Contas que não são cartão; nome, moeda, saldo; Nova conta ou cartão. Instituições são selecionáveis no formulário, não uma tela de gestão separada |
| `/cards` Cartões | Contas `credit_card`; nome, moeda, saldo assinado e limite disponível quando retornado, inclusive sem limite definido; criação e Configurar cartão |
| `/entries` Lançamentos | Histórico registrado, criação de receita, detalhes expansíveis por lançamento, correção e reversão condicional; seção separada de previsões |
| `/statements` Faturas | Nome do cartão, vencimento, status traduzido, restante quando presente; Fechar fatura. Pagamento também acessível no Novo. Itens detalhados não são renderizados nessa lista |
| `/reports` Relatórios | Mesmo seletor de três períodos; receitas/despesas por moeda; não há série, comparação ou distribuição por categoria |
| `Rows` detalhes | Descrição, data econômica, tipo, contraparte, valores assinados por entrada; aviso Precisa revisar e notas; contas movimentadas, categorias efetivas, vínculos de reversão e revisões com número, motivo, ator, origem e data/hora pt-BR |
| `ExpenseForecasts` | Grupos Projetadas/Realizadas/Canceladas, contagem, ordenação por data esperada; descrição, data, conta, categoria, valor/moeda; Nova previsão; Realizar/Cancelar apenas nas projetadas; link para despesa realizada |
| `CategorySplits` | Categoria opcional e valor positivo por linha; Sem categoria; adicionar Outra categoria, remover com nome acessível; remoção desabilitada quando resta uma linha; soma deve ser igual ao total |
| Diálogo | Tipo de registro apenas sem seleção contextual; título acessível, Fechar, Cancelar, envio desabilitado enquanto ocupado; foco inicial, ciclo de Tab, Escape, retorno de foco e fechamento pelo fundo implementados manualmente; limite de altura e rolagem interna |

Não há busca, paginação, seleção em massa, exportação, filtro por conta/categoria/status nem intervalo personalizado na UI. Os filtros internos de tipo de conta/status e agrupamentos não são controles de filtro do extrato. Não adicionar “Limpar filtros” sem filtro real.

## 3. Inventário completo de operações e campos

`Field` é obrigatório por padrão; campos opcionais são indicados abaixo. Datas iniciais usam hoje local. Valores digitados aceitam vírgula ou ponto, até duas casas, sem milhar; a conversão usa `BigInt`. Rótulos atuais “R$” e ajuda “reais” convivem com contas BRL/PLN/EUR: registrar como limitação da apresentação atual, preservando a moeda do contrato e evitando universalizar BRL na migração.

Campos compartilhados nas operações indicadas por **C**: `description`, `occurredOn`, `postedOn` opcional, `counterpartyName` opcional, `notes` opcional, `reviewStatus` confirmado/precisa revisar. `source=manual` é inserido pelo fluxo quando aplicável, não editado pela pessoa.

| Ação | Campos/seleções e condições | Destino POST |
|---|---|---|
| Instituição | `name` | `/api/v1/institutions` |
| Conta ou cartão | `name`, `type` corrente/poupança/dinheiro/cartão, `currency` BRL/PLN/EUR, `openingBalanceMinor`, `openingDate`, `institutionId` opcional; cartão acrescenta `creditLimitMinor` opcional, `closingDay`, `dueDay`; criação injeta fuso do navegador e modo manual em `cardSettings` | `/api/v1/accounts` |
| Configurar cartão | `accountId` somente cartões; limite opcional, fechamento, vencimento, `billingTimezone`, `billingMode` manual/automático; carrega configuração atual ao selecionar cartão | `/api/v1/cards/configuration` |
| Categoria | `name`, `type` receita/despesa, `parentId` opcional | `/api/v1/categories` |
| Receita | `amountMinor`, `accountId` sem cartão, `categoryId` de receita não arquivada opcional; C | `/api/v1/transactions/income` |
| Despesa | `amountMinor`, conta sem cartão, `paymentMethod` Pix/débito/dinheiro/outra; alocações de despesa não arquivadas; C | `/api/v1/transactions/expense` |
| Transferência | `amountMinor`, `fromAccountId`, `toAccountId` sem cartões; C | `/api/v1/transactions/transfer` |
| Compra parcelada | `totalAmountMinor`, `cardAccountId`, `installmentCount` mínimo 1, alocações de despesa não arquivadas; C | `/api/v1/transactions/credit-purchase` |
| Cashback | `amountMinor`, conta ou cartão, categoria de receita opcional, `cardStatementId` opcional; C | `/api/v1/transactions/cashback` |
| Reembolso | `amountMinor`, `originalTransactionId` dentre despesas carregadas, conta ou cartão; C | `/api/v1/transactions/refund` |
| Pagamento de fatura | `amountMinor`, `statementId` dentre faturas não abertas, conta de origem sem cartão; C; pagamento parcial suportado pelo serviço | `/api/v1/statements/payment` |
| Fechamento | Fatura aberta; C também é renderizado atualmente, embora seja operação de fechamento | `/api/v1/statements/close` |
| Criar previsão | `description`, `expectedOn`, `amountMinor`, conta sem cartão, categoria de despesa opcional; aviso de que não altera saldo/relatório | `/api/v1/expense-forecasts` |
| Realizar previsão | Seleção contextual imutável mostra descrição/valor/data esperada; `occurredOn`, `postedOn` opcional, forma de pagamento e status; aviso de impacto no saldo | `/api/v1/expense-forecasts/{id}/realize` |
| Cancelar previsão | Confirmação contextual com descrição, valor e data, sem campos; histórico e saldo preservados | `/api/v1/expense-forecasts/{id}/cancel` |
| Corrigir | `reason`, descrição, contraparte opcional, notas, status; checkbox para substituir categorias conforme condições abaixo; `transactionId` contextual, metadados agrupados em `metadata` | `/api/v1/transactions/correct` |
| Reverter | Data da compensação, motivo, substituição opcional receita/despesa/transferência; detalhes abaixo; `transactionId` contextual | `/api/v1/transactions/reverse` |

### Correção, reversão e seleção

- Correção aparece em todos os lançamentos do histórico. Revisar categorias aparece somente para `income`/`expense` sem reembolso vinculado na coleção carregada. Ao ativar, usa alocações efetivas como valores absolutos iniciais e categorias do tipo da operação; neste fluxo a lista não exclui arquivadas. Não mudar valores, contas ou datas financeiras por revisão.
- Reversão aparece somente para `income`, `expense` ou `transfer`, sem `paymentMethod=credit`, sem entrada em conta cartão, sem `reversedByTransactionIds` e sem reembolso relacionado detectado na lista. Esse teste local depende da coleção disponível; backend continua autoridade e pode recusar vínculos não visíveis.
- Substituição opcional: descrição, data, valor e status; receita usa conta sem cartão e categoria de receita opcional; despesa usa conta sem cartão, forma de pagamento e alocações; transferência usa origem/destino sem cartões. Categorias da substituição excluem arquivadas. Revisão mostra entradas originais, motivo e substituição, sem calcular compensação no cliente.
- Configuração de cartão consulta `GET /api/v1/cards/settings?accountId=…`, preenche limite, dias, fuso e modo e mostra erro de leitura. Não possui carregamento explícito, proteção de resposta obsoleta ou botão próprio de nova tentativa.

### Prévia, confirmação e idempotência

Receita, despesa, transferência, compra, cashback, reembolso e pagamento chamam `POST /api/v1/transactions/preview` antes da escrita, com `operation` correspondente. Prévia recebe CSRF e não recebe chave de escrita. Preservar respostas utilizadas: `entries` por conta/valor; `allocations` por categoria/valor; `installments` com número, valor, fechamento e vencimento (a UI mostra número/total, vencimento e valor); `plannedStatement` com ciclo/fechamento/vencimento; `remainingStatementMinor`. Contas/categorias são resolvidas pelas referências. Outros dados retornados não autorizam inventar indicadores.

Primeiro envio mostra “Revise antes de gravar”; segundo, com mesma assinatura `{path, body}`, confirma e salva. Reversão usa revisão local antes de POST, com assinatura equivalente; não usa a prévia transacional. Realização de previsão não passa pela prévia nessa implementação. Edição do formulário/troca de tipo invalida prévia e revisão. A validação local recusa formato monetário inválido, alocações não positivas e substituição sem valor positivo; validação financeira completa continua no backend.

Toda escrita efetiva envia CSRF e `idempotency-key`. A assinatura igual reutiliza a chave após erro de rede/resultado incerto; corpo diferente gera outra chave. Sucesso limpa a tentativa e seleções e recarrega dados. Fechar diálogo limpa mensagens/prévia/revisão/seleções; não há promessa de preservar campos após fechamento ou recarga. Preservar esse ciclo ao extrair apresentação. Erros HTTP usam `error.message` ou fallback; erros de conexão têm mensagem própria. A futura sanitização não deve imprimir payload ou credenciais.

## 4. Dados disponíveis, limites e omissões

| Leitura atual | Dados consumidos e limites |
|---|---|
| `GET /api/v1/accounts` | ID, nome, tipo, moeda, saldo e limite disponível opcional; não é carteira de investimentos |
| `GET /api/v1/categories` | ID, nome, tipo e arquivamento; alimenta seleções e detalhes, não agrega categorias |
| `GET /api/v1/institutions` | ID e nome para vínculo de conta |
| `GET /api/v1/transactions?from&to` | Intervalo de 1º de janeiro do ano obtido aproximadamente 730 dias atrás até hoje UTC; metadata, entradas, alocações, revisões e vínculos usados na UI. Não é todo o histórico nem acompanha o seletor do relatório |
| `GET /api/v1/statements?from&to` | De início do mês aproximadamente 120 dias atrás até dia 28 do mês aproximadamente 730 dias à frente; cartão, moeda, vencimento, status, restante e itens opcionais; lista renderiza só cabeçalho/restante |
| `GET /api/v1/expense-forecasts?from&to` | Ano atual até fim do próximo ano; ID, conta, data esperada, valor, categoria, descrição, moeda, status, transação realizada e criação; criação não aparece na lista |
| `GET /api/v1/reports/summary?from&to` | `from`, `to`, `balancesByCurrency`, `incomeMinorByCurrency`, `expenseMinorByCurrency`; mês atual, mês anterior ou ano atual; sem série temporal nem agrupamento por categoria |

`formatMinor` preserva sinal, inteiro e código de moeda, com agrupamento pt-BR e duas casas; datas de operação/vencimento ainda aparecem em ISO nas listas. Revisões usam data/hora local pt-BR. Preservar precisão e distinguir data econômica, postagem, competência/ciclo e pagamento. Não reconstruir totais de relatório por soma da coleção parcial, nem somar entradas de transferência como receita/despesa.

| Elemento do protótipo a omitir | Motivo e substituição permitida |
|---|---|
| Patrimônio líquido, carteira, investimentos e rentabilidade | Sem capacidade correspondente; manter rótulo Saldo nas contas |
| Distribuição por categoria, donut, ranking e percentuais | Resumo não fornece agregação completa; detalhes de categorias existentes permanecem |
| Balanço mensal em série, evolução, comparações com período anterior, tendências e metas percentuais | Não há série/comparativo no contrato consumido; exibir apenas totais disponíveis |
| Metas, orçamentos, recorrências e projeções automáticas | Não implementados; previsões avulsas existentes permanecem e não são substituídas por esses conceitos |
| Sincronização bancária, estado de integração, importar/exportar, análise por IA | Ausência de fluxo implementado; não mostrar controle desabilitado nem aviso de recurso futuro |
| Busca/filtros do extrato ou cabeçalho, paginação, ações em massa | Não existem na interface; manter somente período do resumo/relatório |
| Notificações, perfil/gestão de usuários, configurações genéricas e destinos extras | Sem telas/ações correspondentes; manter saída e configuração real de cartão |
| Exemplos de saldos, gráficos, contas, nomes e indicadores do Figma | Conteúdo ilustrativo; somente dados reais ou estados vazios |
| Tema claro e seletor de aparência | Fora do escopo aprovado; único tema escuro em login, navegação e diálogos |

Revisões retornam autoria/motivo/ordem/data, não valores anteriores completos de metadados/categorias; não prometer diff histórico que o contrato não oferece. `postedOn`, método de pagamento e relação original estão disponíveis no tipo local, mas não são todos renderizados como detalhe textual. A presença em um tipo/DTO não significa controle ou tela implementada.

## 5. Estados atuais e destino visual

| Estado | Observado | Tratamento previsto nas tarefas seguintes |
|---|---|---|
| Sessão inicial | Preparando seu espaço; falha/ausência leva ao login | Preservar fluxo e feedback sem expor dados |
| Carga inicial das referências | `Promise.all` de seis leituras, indicador único | Estado inicial explícito; não confundir falta de dado com zero |
| Revalidação | Indicador global substitui áreas; resumo tem ciclo independente | Distinguir atualização e manter resultado associado ao período |
| Troca de período | Resumo não cancela/ignora resposta antiga, nem limpa resultado anterior | Proteger respostas fora de ordem em 5.3; não afirmar P2 cumprida |
| Vazio | Mensagens em listas/recentes/faturas e em cada grupo de previsão; resumo usa Sem dados/Sem movimentações | Preservar contexto e acesso à criação; relatório com objeto vazio pode ficar sem mensagem, corrigir |
| Filtro sem resultado | Não aplicável ao extrato sem filtros; períodos podem não ter movimentação | Mensagem específica por período, sem criar filtro |
| Falha de leitura | `dataError` global; sem botão de retry; referências anteriores podem permanecer ou vazias | Erro recuperável com Tentar novamente; não representar falha como vazio/zero |
| 403/404 | Sem superfícies específicas nesse cliente | Mensagem segura conforme resposta; não inventar nova política de autorização |
| Formulário inválido | HTML required/min e mensagens globais de conversão/API | Associar erro ao campo quando identificável, mantendo preenchimento |
| Envio/prévia pendente | Busy desabilita envio e mostra Validando | Estado acessível de pendência; não permitir envio duplicado |
| Erro de envio | Alerta no diálogo e preservação dos campos enquanto aberto | Manter entrada e chave para repetição incerta |
| Sucesso | Registro salvo, diálogo fecha, referências/resumo recarregam | Manter confirmação perceptível após fechamento |
| Desabilitado/somente leitura | Envio ocupado, remoção da última categoria; previsões finalizadas sem ações | Nome/estado legíveis e explicação contextual, sem controles fictícios |

O código possui redução de movimento global, labels envolventes, alertas/status, nomes de controles por ícone e foco manual no diálogo. Isso não constitui auditoria de acessibilidade concluída. Verificar ordem de foco, teclado, Escape, retorno ao disparador, conteúdo longo, zoom, áreas seguras e alvos de 44 × 44 px. A navegação móvel atual usa texto de 9 px e algumas ações de linha têm altura mínima menor que 44 px: rever sem perder os seis destinos. Evitar significado só por cor; usar rótulos de tipo/status e sinais monetários.

## 6. Fontes, licenças e disponibilidade

| Fonte/recurso | Evidência | Proposta |
|---|---|---|
| Geist | [Licença oficial Vercel](https://raw.githubusercontent.com/vercel/geist-font/main/LICENSE.txt): SIL Open Font License 1.1, copyright Vercel em colaboração com basement.studio | Texto, títulos e valores em destaque; pesos 400/500/600/700 conforme arquivo escolhido |
| JetBrains Mono | [Licença oficial JetBrains](https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt): SIL Open Font License 1.1 | Metadados/rótulos curtos e legendas, evitando parágrafos longos e excesso de caixa alta |
| Atual | CSS declara Inter com alternativas de sistema; não há carregamento de fonte no layout nem dependência de fonte no package web | Não afirmar que Inter está instalada ou que a fonte Figma já é servida |
| Figma | Referência fornecida pela pessoa usuária; requisitos contêm extração suficiente | Reproduzir linguagem de UI, sem importar imagens/logos externos de licença desconhecida |

Licenças consultadas em 26/10/2026: permitem uso e redistribuição sob OFL; ao distribuir arquivos das fontes, preservar aviso de copyright e licença, não vender fonte isoladamente e respeitar condições de nomes reservados/modificação. A licença da fonte não licencia automaticamente outros assets do protótipo.

Carregamento proposto em 1.2: verificar exports e disponibilidade de Geist/JetBrains Mono na versão instalada de `next/font`, usar variáveis CSS e fontes servidas localmente pelo app; `next/font/google` pode exigir rede no build. Se necessário, usar arquivos locais licenciados e conservar OFL, sem CDN no navegador. A declaração instalada de `next/dist/compiled/@next/font/dist/google/index.d.ts` confirma exports `Geist` e `JetBrains_Mono`; isso confirma suporte da API, não disponibilidade de download no build. Nenhum arquivo de fonte foi baixado/incluído e nenhum build de fonte foi executado nesta tarefa. Alternativas: Geist → `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`; JetBrains Mono → `ui-monospace, SFMono-Regular, Consolas, monospace`. Testar acentos, BRL/PLN/EUR, sinal negativo, dígitos tabulares, quebra e fallback.

## 7. Composição shadcn proposta

Documentação oficial consultada em 26/10/2026: [theming](https://ui.shadcn.com/docs/theming), [Field](https://ui.shadcn.com/docs/components/base/field) e [Dialog](https://ui.shadcn.com/docs/components/base/dialog). O tema usa pares semânticos de superfície/conteúdo expostos no Tailwind por `@theme inline`. Campos agrupam label, controle, ajuda e erro; usar `data-invalid` no grupo e `aria-invalid` no controle. Diálogo precisa de título, descrição/contexto, ações e gerenciamento de foco. Reconsultar a documentação da base e versão escolhidas antes de implementar.

| Atual | Composição candidata, somente se usada |
|---|---|
| `.button`, ações de linha | Button com variantes principal, secundária, ghost e destrutiva |
| `.panel`, SummaryTile/Reports | Card com regiões de cabeçalho/conteúdo quando necessárias |
| Field e textarea/select próprios | FieldGroup, Field, FieldLabel, FieldDescription, FieldError, Input, Textarea, Select ou Native Select |
| ActionDialog e confirmação | Dialog com título acessível, conteúdo e rodapé; preservar estado no proprietário do fluxo |
| Mensagens, vazios e carga | Alert, Empty e Skeleton conforme estado real; Badge para status com texto |
| Categorias e revisão | FieldSet/legend e Checkbox; preservar controles de adicionar/remover |
| Navegação | Links semânticos com `aria-current`; primitivas adicionais apenas por necessidade real |

Não existe `components.json` nem diretório UI shadcn no estado inspecionado. Next 15/React 19/Tailwind 4 e alias atuais devem orientar 1.2; não instalar todos os componentes, trocar stack ou misturar APIs Base/Radix. Este inventário não escolhe preset nem adiciona dependências. `cn` e variantes compartilhadas podem ser necessários. Cores pertencem aos tokens, sem literais dispersos nem estilos diferentes para cada consumidor.

## 8. Tokens propostos e contraste calculado

Paleta sRGB opaca proposta, ainda não aplicada. Aplicar `.dark` desde o HTML inicial e `color-scheme: dark`; uma única `themeColor` coerente, sem consulta à preferência do dispositivo. Hoje o CSS é claro e o layout tem duas cores de navegador por preferência: ainda precisa migrar em 1.2.

| Papéis | Valor proposto | Uso |
|---|---|---|
| background / foreground | `#09090b` / `#fafafa` | Canvas e texto principal |
| card / card-foreground | `#121215` / `#fafafa` | Painéis e totais |
| popover / popover-foreground | `#1c1b1d` / `#fafafa` | Diálogo e superfícies flutuantes |
| secondary, muted, accent / respectivos foregrounds | `#1c1b1d` / `#fafafa`, com muted-foreground `#a1a1aa` | Ações secundárias, ajuda, hover e estados de consulta |
| primary / primary-foreground | `#4edea3` / `#09090b` | Ação principal |
| primary hover / foreground | `#4edea3` / `#09090b` | Inicialmente mesma cor; variar tratamento sem opacidade até medir nova combinação |
| destructive / destructive-foreground | `#f43f5e` / `#09090b` | Ação destrutiva; não usar branco normal nesse fundo |
| expense | `#f43f5e` | Valor/ícone de despesa sobre superfícies escuras, acompanhado de texto/sinal |
| success / success-foreground | `#123026` / `#4edea3` | Confirmação e prévia, medir par final antes de aplicação |
| error / error-foreground | `#32141c` / `#fda4af` | Erro com texto explicativo |
| warning / warning-foreground | `#302713` / `#fcd34d` | Revisão e alerta |
| border / input | `#2e2e33` / `#71717a` | Separador decorativo / contorno funcional de campo |
| ring | `#4edea3` | Foco visível; usar separação escura em botão verde |
| sidebar / sidebar-foreground | `#121215` / `#fafafa` | Navegação |
| sidebar-primary / foreground | `#4edea3` / `#09090b` | Destaque de ação |
| sidebar-accent / foreground | `#1c1b1d` / `#fafafa` | Seleção/hover, com indicação textual/forma |
| sidebar-border / sidebar-ring | `#2e2e33` / `#4edea3` | Divisão decorativa/foco |

Não criar séries ou gráficos só para consumir `chart-*`. A paleta não define semântica financeira nova. Estado disabled deve usar superfície/texto legíveis próprios; não reduzir opacidade indiscriminadamente. A seleção precisa de marcador/ícone/`aria-current`, pois duas superfícies próximas têm baixo contraste entre si.

Medição executada com Python, sem dependências: linearizar cada canal sRGB (`c/12.92` para `c ≤ 0.04045`, senão `((c+0.055)/1.055)^2.4`); luminância `0.2126R + 0.7152G + 0.0722B`; razão `(Lmaior+0.05)/(Lmenor+0.05)`. Cores abaixo são opacas; arredondamento apenas para apresentação. Meta: texto normal ≥ 4,5:1; texto grande aplicável e contornos funcionais ≥ 3:1.

| Conteúdo / fundo | Razão | Avaliação |
|---|---:|---|
| `#fafafa` / `#09090b` | 19,06:1 | Texto normal passa |
| `#fafafa` / `#121215` | 17,91:1 | Texto normal passa |
| `#fafafa` / `#1c1b1d` | 16,44:1 | Texto normal passa |
| `#a1a1aa` / `#1c1b1d` | 6,69:1 | Ajuda/placeholder normal passa |
| `#a1a1aa` / `#27272a` | 5,81:1 | Alternativa de hover passa |
| `#4edea3` / `#121215` | 10,95:1 | Destaque e foco passam sobre painel |
| `#09090b` / `#4edea3` | 11,65:1 | Texto de botão principal passa |
| `#f43f5e` / `#1c1b1d` | 4,67:1 | Texto normal passa com margem pequena; não aplicar opacidade |
| `#09090b` / `#f43f5e` | 5,42:1 | Texto de botão destrutivo passa |
| `#ffffff` / `#f43f5e` | 3,67:1 | Falha para texto normal; substituir por foreground escuro |
| `#fda4af` / `#32141c` | 8,87:1 | Mensagem de erro passa |
| `#fcd34d` / `#302713` | 10,22:1 | Aviso passa |
| `#71717a` / `#1c1b1d` | 3,55:1 | Contorno funcional passa; texto normal falha |
| `#71717a` / `#121215` | 3,87:1 | Contorno funcional passa; texto normal falha |
| `#2e2e33` / `#121215` | 1,38:1 | Somente borda decorativa; insuficiente para identificar campo |

Ajustes: não usar cinza `#71717a` em texto pequeno; não usar borda decorativa como único limite de input; evitar anel verde diretamente contra botão verde, adicionando offset escuro; medir novamente hover, seleção, disabled, transparências, foco e componentes compostos. Texto sobre erro/despesa não deve depender de vermelho sozinho. As razões são verificação matemática de pares propostos, não resultado de navegador nem declaração de conformidade WCAG integral.

### Escala e geometria propostas

- Espaçamento base 4 px: 4/8/12/16/24/32/48; margem móvel 16 px, expansão progressiva; nenhuma correção mobile posterior a layout desktop.
- Raio principal 12 px; controles 8 px e diálogo 16 px como proposta, não extração adicional. Sombras discretas; bordas não substituem contraste funcional.
- Corpo 16 px, auxiliar 14 px, metadados 12 px com contraste normal; títulos 24–32 px, valor principal 28–40 px com quebra segura por moeda. Mono limitado a dados curtos, dígitos tabulares e rótulos legíveis.
- Controles/alvos de toque pelo menos 44 px; foco proposto 2–3 px com offset 2 px. Diálogo com altura dinâmica, rolagem interna e teclado móvel sem ocultar ações.
- Movimento apenas para feedback discreto; preservar `prefers-reduced-motion`, sem animação necessária para compreender informação.

## 9. Verificação e handoff

Cobertura de 1.1: quatro referências e identificador disponível (§1); todas as superfícies/controles (§2); 17 operações, campos, condições, prévia e respostas (§3); dados versus omissões (§4); estados e lacunas (§5); fontes/licenças (§6); documentação e composição shadcn (§7); tokens/contraste propostos (§8). Atende ao inventário dos requisitos 1.1, 1.3, 1.7, 4.4, 5.4 e 6.3, sem afirmar implementação desses requisitos.

Verificações executadas: inspeção de estado Git e arquivos, leitura estática dos fluxos/formatadores/estilos, consulta oficial de theming/Field/Dialog e licenças, cálculo sRGB dos pares listados e revisão do escopo de escrita. `visual-reference.md` não existia antes desta execução. Alterações prévias do repositório foram preservadas. Nenhum comentário foi adicionado a código.

Limitações: não houve navegador, screenshots, banco, testes de fluxo, typecheck, lint ou build; são desnecessários para a única criação Markdown e continuam obrigatórios nas tarefas de implementação pertinentes. Não houve nova extração Figma nem acesso a IDs individuais ausentes dos requisitos. Fontes ainda não foram carregadas, pares finais e estados reais ainda precisam de medição. Nenhum contrato, domínio, banco, MCP, autenticação, implantação ou arquivo de produção foi alterado. `tasks.md` permanece intocado pelo limite de escrita; o registro de conclusão de 1.1 é este documento. Próximo passo técnico é 1.2, usando este inventário, sem ampliar esta entrega.

### Concorrência observada na conferência final

O inventário acima descreve o snapshot inicial, em que formulários e listas estavam concentrados em `workspace.tsx`. Na conferência final foram observadas extrações concorrentes, incluindo `action-dialog.tsx`; os campos compartilhados e casos de receita/fechamento foram reconferidos no novo arquivo e continuam compatíveis com este registro. Caminhos e aparência podem continuar evoluindo por outros trabalhos; não atribuir essas alterações a 1.1 nem sobrescrevê-las. A única escrita desta execução foi este documento.

## 10. Tokens efetivamente adotados

A implementação utiliza fontes locais dos pacotes `@fontsource-variable/geist` e `@fontsource-variable/jetbrains-mono`, e componentes `base-nova` com Base UI. O tema é escuro desde o HTML inicial; não há seletor nem dependência da preferência de aparência do dispositivo. As classes consomem os papéis semânticos, permitindo substituir os valores por um futuro tema claro. Os estilos legados sem consumidores foram removidos.

A paleta final difere de algumas propostas do inventário: `muted` e `secondary` usam `#27272a`; `destructive` usa `#fb7185` para ampliar a margem de contraste; `success` usa `#4edea3`; `border` usa `#3f3f46`, mantendo `input` em `#71717a`. As superfícies principais permanecem `#09090b`, `#121215` e `#1c1b1d`.

Razões calculadas novamente sobre os valores finais, pelo método sRGB descrito acima:

| Par semântico | Contraste |
|---|---:|
| foreground / background | 19,06:1 |
| card-foreground / card | 17,91:1 |
| popover-foreground / popover | 16,44:1 |
| muted-foreground / muted | 5,81:1 |
| primary-foreground / primary | 11,65:1 |
| destructive / popover | 6,38:1 |
| success / card | 10,95:1 |
| input / popover | 3,55:1 |
| ring / popover | 10,05:1 |
| sidebar-accent-foreground / sidebar-accent | 8,40:1 |

Os pares opacos avaliados atendem aos limiares correspondentes de texto ou contorno. Esse cálculo não certifica todos os estados compostos, transparências ou conformidade integral WCAG; evidências e limites da validação ficam em `docs/ui-validation.md`.

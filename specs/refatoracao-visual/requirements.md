# Requisitos: Refatoração visual da plataforma

## Visão Geral

A plataforma web de finanças pessoais deve adotar uma identidade visual coerente com o [Figma fornecido](https://www.figma.com/design/CpQA20cURuJQxt8wFlftJD/Marvin-Finnace-app?node-id=0-1), preservando as funcionalidades e regras financeiras existentes. A refatoração atende à pessoa usuária do sistema em dispositivos móveis e computadores, abrangendo as telas existentes e priorizando as telas de painel, extrato, nova transação e relatórios representadas no Figma. A referência visual contém exemplos e propostas de funcionalidades que não constituem, por si só, autorização para criar novas regras financeiras ou integrações.

Referências do projeto: [arquitetura, seções 6 e 8](../../ARCHITECTURE.md) e [modelo financeiro, seções 1 e 11](../../docs/data-model.md). As orientações de [temas](https://ui.shadcn.com/docs/theming) e [componentes](https://ui.shadcn.com/docs/components) do shadcn orientam consistência sem definir a implementação nesta fase.

### Referência visual extraída

- O Figma apresenta quatro telas em larguras de referência de 390 px e 1280 px: painel financeiro, extrato de transações, nova transação e relatórios e análises.
- A identidade apresentada é escura: fundo principal `#09090b`, superfícies do painel `#121215` e superfícies observadas em relatórios `#1c1b1d`; textos claros e cinzas estabelecem hierarquia, com verde `#4edea3` e vermelho `#f43f5e` como destaques observados. Esses valores são amostras da referência, sujeitos à verificação de contraste e ao levantamento completo na fase de design.
- A tipografia observada combina Geist para textos e valores em destaque e JetBrains Mono para rótulos, números e legendas. Foram observados cartões com raio de 12 px, espaços externos de 16 px no painel móvel e agrupamentos de cartões, gráficos e listas.
- No painel móvel, a referência inclui patrimônio em destaque, cartões de receitas e despesas, balanço mensal e distribuição por categorias. O extrato apresenta busca e filtros; a nova transação enfatiza o valor e os campos do formulário; relatórios apresentam filtros, indicadores, gráficos e análise de categorias.
- Na versão desktop, as referências apresentam navegação lateral e cabeçalho; no celular, cabeçalho e navegação móvel. Dados, metas, sincronizações, análises por inteligência artificial e demais conteúdos do protótipo são ilustrativos até confirmação de sua disponibilidade.
- O código atual apresenta estilos próprios e dependência de Tailwind; não foram identificados `components.json` nem componentes shadcn instalados em `apps/web`. A adoção técnica e o mapeamento de componentes ficam para o design.

## Personas

- **Pessoa usuária**: administra suas finanças pessoais pela interface web em celular ou computador.
- **Pessoa mantenedora**: evolui a interface e precisa preservar consistência visual e comportamento existente.

## Histórias de Usuário e Critérios de Aceitação

### 1. Identidade visual consistente

**História de Usuário:** Como pessoa usuária, quero reconhecer a mesma identidade visual em toda a plataforma, para que a navegação entre telas seja coerente.

**Critérios de Aceitação:**

1.1 O sistema deve apresentar tema escuro, hierarquia tipográfica, cores, superfícies, bordas e espaçamentos consistentes com a referência visual extraída, respeitando os requisitos de acessibilidade.
1.2 O sistema deve aplicar tratamentos visuais consistentes para ações, campos, cartões, tabelas, mensagens e indicadores equivalentes nas telas abrangidas.
1.3 Onde uma tela existente não tiver correspondente no Figma, o sistema deve aplicar a mesma identidade visual sem remover suas funções existentes.
1.4 O sistema deve apresentar textos de interface em português do Brasil e valores e datas em formatos apropriados ao contexto brasileiro, preservando a moeda de cada valor.
1.5 O sistema deve disponibilizar apenas o tema escuro nesta entrega, inclusive no login e nos diálogos, independentemente da preferência de aparência do dispositivo e sem seletor de tema.
1.6 O sistema deve definir a aparência por papéis semânticos compartilhados, permitindo acrescentar um tema claro futuramente sem alterar os componentes consumidores desses papéis.
1.7 Se uma cor ou combinação tipográfica do Figma não atender aos critérios de acessibilidade, então o sistema deve aplicar uma adequação que preserve a hierarquia visual e atenda aos critérios de contraste e legibilidade.

### 2. Navegação e adaptação a dispositivos

**História de Usuário:** Como pessoa usuária, quero navegar e operar a plataforma em celular e computador, para que eu possa consultar e registrar minhas finanças em ambos.

**Critérios de Aceitação:**

2.1 O sistema deve oferecer acesso às áreas existentes de resumo, contas, cartões, lançamentos, faturas e relatórios, com indicação da área atual.
2.2 Quando exibido em celular, o sistema deve apresentar navegação e conteúdo adaptados ao toque, seguindo a organização móvel da referência quando houver tela correspondente.
2.3 Quando exibido em computador, o sistema deve apresentar navegação lateral e organização de conteúdo compatíveis com a referência desktop.
2.4 Quando a largura da tela mudar, o sistema deve manter todas as ações e informações disponíveis sem sobreposição ou rolagem horizontal involuntária da página.
2.5 Quando uma sessão não autenticada acessar uma área protegida, o sistema deve preservar o fluxo existente de autenticação.

### 3. Painel financeiro

**História de Usuário:** Como pessoa usuária, quero consultar um resumo visual das minhas finanças, para que eu identifique saldos, receitas e despesas disponíveis.

**Critérios de Aceitação:**

3.1 Quando houver dados disponíveis, o sistema deve apresentar os saldos e indicadores existentes com hierarquia visual compatível com o painel do Figma.
3.2 Onde os dados necessários estiverem disponíveis, o sistema deve apresentar receitas e despesas e sua distribuição por categoria com identificação do período e da moeda.
3.3 Se não houver dados suficientes para um indicador ou gráfico, então o sistema deve apresentar estado vazio ou indisponível sem inventar valores.
3.4 O sistema deve distinguir receitas, despesas, transferências e pagamentos de fatura conforme as regras existentes, sem apresentar transferências ou pagamentos como nova despesa.
3.5 Se houver valores em moedas diferentes, então o sistema deve apresentá-los separados, sem agregação sem taxa de câmbio explícita.

### 4. Extrato e operações financeiras

**História de Usuário:** Como pessoa usuária, quero consultar lançamentos e realizar operações financeiras com a nova identidade, para que eu mantenha meus registros sem perder capacidades atuais.

**Critérios de Aceitação:**

4.1 O sistema deve apresentar os lançamentos existentes em uma organização visual compatível com a referência de extrato, preservando as informações e ações já disponíveis.
4.2 Onde houver filtros ou busca implementados, o sistema deve apresentar os controles e identificar os filtros ativos e os resultados correspondentes.
4.3 Quando uma consulta não retornar lançamentos, o sistema deve informar que não há resultados para os critérios aplicados.
4.4 Quando a pessoa iniciar uma operação existente, o sistema deve apresentar os campos, validações, informações de revisão e confirmações exigidos pelo fluxo atual.
4.5 Se um envio falhar ou apresentar dados inválidos, então o sistema deve informar o problema sem indicar que a operação foi concluída e preservar os dados preenchidos quando possível.
4.6 Quando uma operação for concluída, o sistema deve apresentar confirmação e atualizar os dados afetados conforme o comportamento existente.

### 5. Relatórios e apresentação de dados

**História de Usuário:** Como pessoa usuária, quero consultar relatórios com apresentação visual consistente, para que eu compreenda meus resultados por período e categoria.

**Critérios de Aceitação:**

5.1 O sistema deve preservar os relatórios e filtros existentes e apresentar período, categorias, valores e moedas associados aos resultados.
5.2 Onde houver dados disponíveis para gráficos ou indicadores da referência, o sistema deve apresentá-los com legendas ou rótulos que identifiquem as séries e seus valores.
5.3 Se uma consulta falhar, então o sistema deve informar a falha e oferecer uma forma de tentar novamente.
5.4 O sistema deve omitir blocos, indicadores, controles e destinos do protótipo cujas funcionalidades ou dados ainda não estejam implementados, sem apresentar exemplos fictícios, controles desabilitados ou avisos de funcionalidade futura em seu lugar; as previsões e demais funcionalidades já existentes devem permanecer disponíveis.

### 6. Continuidade e manutenção visual

**História de Usuário:** Como pessoa mantenedora, quero uma linguagem visual compartilhada, para que alterações futuras mantenham a coerência da plataforma.

**Critérios de Aceitação:**

6.1 O sistema deve manter significados visuais consistentes para ações principais, ações secundárias, erros, estados desabilitados e foco em todas as telas abrangidas.
6.2 O sistema deve apresentar elementos visuais equivalentes por meio de componentes reutilizáveis com variantes consistentes, seguindo os princípios de composição, cores semânticas, pares de superfície e conteúdo e estados acessíveis do shadcn.
6.3 O sistema deve preservar contratos, autenticação e regras financeiras existentes durante a refatoração visual.

## Requisitos Não Funcionais

### 7. Acessibilidade, responsividade e segurança

7.1 O sistema deve atender aos critérios aplicáveis de nível AA das WCAG 2.2 nas telas alteradas, incluindo contraste, identificação de campos e indicadores de foco.
7.2 O sistema deve permitir navegar e operar controles, formulários e diálogos usando apenas teclado, com foco visível e ordem coerente.
7.3 O sistema deve disponibilizar nomes acessíveis para controles por ícone e informação textual equivalente para os dados essenciais apresentados em gráficos.
7.4 O sistema não deve depender apenas de cor para distinguir valores, estados ou mensagens.
7.5 Quando a pessoa solicitar redução de movimento no dispositivo, o sistema deve respeitar essa preferência nas animações da interface.
7.6 O sistema deve permanecer utilizável em 390 × 844 e 1440 × 900 pixels, sem perda de conteúdo ou rolagem horizontal involuntária da página.
7.7 Enquanto dados estiverem carregando, o sistema deve apresentar uma indicação de carregamento; se a solicitação falhar, deve apresentar uma mensagem de erro identificável.
7.8 O sistema não deve expor credenciais nem dados financeiros em mensagens de erro ou registros da interface.

## Fora de Escopo

- Alteração de regras financeiras, contratos, persistência, autenticação ou implantação.
- Novas integrações bancárias, sincronização de contas, metas, orçamentos, investimentos ou geração de análises por inteligência artificial apenas por constarem no protótipo.
- Disponibilização do tema claro, alternância de tema e adaptação automática à aparência do dispositivo nesta entrega.
- Implementação da refatoração, definição técnica detalhada e plano de tarefas nesta fase de requisitos.

## Questões em Aberto

Nenhuma decisão de produto pendente para este escopo. Funcionalidades ainda não implementadas serão omitidas; o tema escuro será a única aparência disponível, com estrutura preparada para um tema claro futuro. As adequações visuais devem seguir os princípios do shadcn e os critérios de acessibilidade deste documento. A medição das combinações finais de cores e a validação tipográfica são verificações da implementação, não decisões de produto em aberto.

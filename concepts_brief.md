# Nova interface financeira

* **Data:** 2026-10-29
* **Estado:** hipótese em discussão; revisão independente parcial

## Visão geral

Substituir a identidade e os componentes visuais atuais pela identidade do [Figma](https://www.figma.com/design/CpQA20cURuJQxt8wFlftJD/Marvin-Finnace-app?node-id=0-1). A primeira entrega deve contemplar dashboard, criação de transações, histórico com visualização, edição e exclusão, e relatórios baseados nas transações. A usabilidade dos fluxos orientará a avaliação. Telas necessárias que não constem no Figma serão adaptadas à identidade para avaliação posterior.

## Análise

O projeto já possui serviços e regras financeiras que precisam continuar coerentes com a nova interface. A revisão identificou que as operações atuais usam revisões de alguns dados e estornos, e não oferecem edição e exclusão genéricas para todas as transações. Transferências, parcelas e pagamentos de fatura podem envolver registros relacionados: agir sobre apenas um deles pode produzir resultados inconsistentes. É necessário definir quais ações cada operação permite antes de apresentá-las ao usuário.

Ao alterar ou excluir uma transação, saldos e relatórios devem refletir a mudança. Uma correção deve aparecer no mês original da transação; em compras parceladas, deve aparecer em todos os meses atingidos. A revisão encontrou diferenças entre o tratamento temporal de saldos e de estornos nos relatórios, que precisam ser resolvidas para atender a esse comportamento. Moedas distintas não devem ser agregadas sem conversão explícita. Os dados existentes e os vínculos financeiros devem ser preservados.

O Figma foi acessado e contém, entre outras telas, um dashboard móvel. A correspondência visual integral e a cobertura de todos os fluxos ainda precisam ser verificadas. Devem ser considerados estados vazios, carregamento e erro, navegação por teclado, legibilidade e uso em celular e desktop. O projeto já possui uma especificação visual anterior com escopo mais restrito, que não aprova por si só as novas operações financeiras.

A revisão contou com dois revisores independentes, focados em design e código. O limite de agentes impediu a revisão independente de todas as lentes previstas pela skill; esta análise é parcial. Os revisores não verificaram o Figma de forma independente.

## Objetivos e limites

* **Incluído:** nova identidade visual; dashboard; criação de transações; histórico com visualização, edição e exclusão; relatórios derivados das transações; adaptação de telas necessárias ausentes no Figma.
* **Fora do escopo definido:** mudanças de banco, autenticação ou arquitetura de implantação sem definição e aprovação pertinentes; exclusão de dados financeiros existentes.
* **Pendente:** quais tipos e campos podem ser editados ou excluídos, comportamento de operações relacionadas e períodos já encerrados, e quais elementos do Figma exigem capacidades ainda não implementadas.

## Alternativas consideradas

* Manter a identidade visual atual: não atende à direção estabelecida pelo usuário.
* Aplicar apenas mudanças visuais sem viabilizar os fluxos solicitados: não atende à primeira entrega pretendida.
* Reescrever indiscriminadamente a lógica financeira junto da interface: aumentaria o risco de inconsistência; manter as regras existentes e alterar os serviços somente quando necessário é a hipótese para avaliação.

## Decisões e próximos passos

* Usar o Figma como referência visual; adaptar lacunas para revisão do usuário.
* Permitir edição e exclusão somente quando a operação completa puder ser atualizada sem violar as regras financeiras; explicar a restrição na interface nos demais casos.
* Recalcular saldos e relatórios após alterações ou exclusões, refletindo correções no mês original e, em compras parceladas, em todos os meses atingidos, respeitando as regras de operações relacionadas.
* O usuário deseja recalcular a fatura quando uma transação de fatura encerrada for corrigida. O tratamento preciso de diferenças em faturas já pagas fica para depois do MVP. Até haver regra segura, restringir alterações que dependam desse tratamento e explicar a restrição; preservar o histórico, sem reescrevê-lo silenciosamente.
* Definir a política de edição e exclusão antes de detalhar a implementação; complementar a revisão independente das lentes que faltaram.

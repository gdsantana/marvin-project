# Nova interface financeira

* **Estado:** rascunho
* **Data:** 2026-10-29

## Visão geral

Adotar na interface web a identidade visual e os desenhos documentados no [Figma](https://www.figma.com/design/CpQA20cURuJQxt8wFlftJD/Marvin-Finnace-app?node-id=0-1). A primeira entrega reúne dashboard, criação e histórico de transações e relatórios. Telas necessárias que não estejam desenhadas serão adaptadas à mesma identidade para avaliação posterior.

## O problema

A interface atual não corresponde à identidade visual desejada. Além da aparência, a pessoa usuária precisa percorrer os fluxos financeiros principais com clareza e ver os efeitos de suas alterações nos saldos e relatórios. A substituição visual precisa preservar os dados e respeitar os vínculos entre operações financeiras.

## Objetivos

* Reproduzir a identidade e os desenhos do Figma nas telas documentadas, substituindo interfaces e componentes visuais atuais.
* Permitir consultar o dashboard, criar transações e consultar o histórico e relatórios baseados nelas.
* Permitir visualizar, editar e excluir transações quando a operação completa puder ser atualizada sem violar as regras financeiras; explicar restrições nos demais casos.
* Refletir correções nos saldos e relatórios dos períodos atingidos, incluindo todos os meses afetados por compras parceladas.
* Tornar os fluxos utilizáveis em celular e desktop; a avaliação da pessoa usuária será baseada na usabilidade.

## Fora do escopo

* Definir o tratamento preciso de diferenças em faturas já pagas; operações que dependam dessa definição devem ser restringidas até existir uma regra segura.
* Apagar dados financeiros existentes ou reescrever silenciosamente o histórico de faturas encerradas.
* Alterar autenticação, implantação ou arquitetura de banco sem as decisões e aprovações pertinentes.

## Questões em aberto

* Quais tipos de operação e campos poderão ser editados ou excluídos com segurança no MVP?
* Quais telas e estados necessários ainda não estão representados no Figma?
* Como preservar o histórico e recalcular faturas encerradas sem comprometer pagamentos existentes?

*Drafted with EGM*

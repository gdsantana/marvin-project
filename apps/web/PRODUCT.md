# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A pessoa proprietária da instalação do Marvin usa o navegador, no celular ou no computador, para registrar o que aconteceu com seu dinheiro e consultar sua situação financeira. A aplicação atende uma pessoa por instalação.

## Product Purpose

Marvin Finanças ajuda a acompanhar e registrar finanças pessoais em reais brasileiros (BRL) no homelab. A pessoa usuária pode consultar saldos, entender receitas e despesas do período e acompanhar compromissos futuros, como parcelas e faturas.

## Positioning

O Marvin roda na infraestrutura da própria pessoa usuária. Ela pode registrar operações na interface web ou por conversa com Hermes, que consulta e solicita operações via MCP. Os dois caminhos usam as mesmas validações e regras financeiras da API.

## Operating Context

- A interface é responsiva, mobile first e em português brasileiro. O acesso ao aplicativo exige uma sessão autenticada. A implantação prevista usa rede privada ou VPN.
- O trabalho cotidiano inclui consultar o resumo, registrar e revisar movimentações, conferir contas e cartões, acompanhar faturas e explorar relatórios por período.
- Configurações reúne o cadastro de instituições, contas, cartões e categorias. Durante um lançamento, a pessoa pode criar uma categoria sem sair do formulário.

## Capabilities and Constraints

- O aplicativo oferece contas, cartões, receitas, despesas, transferências, cashback, estornos, compras parceladas, pagamentos de fatura, previsões e relatórios. Investimentos permanecem fora do escopo atual.
- Pix e débito são meios de pagamento vinculados à conta correspondente. Transferências entre contas próprias e pagamentos de fatura movimentam saldos sem criar nova receita ou despesa.
- A compra parcelada reconhece a dívida integral uma vez. As parcelas mostram quando cada parte será cobrada. A interface distingue data da compra, competência da fatura e data do pagamento.
- A previsão representa um compromisso futuro. O saldo atual deriva do saldo inicial e das movimentações efetivas.

## Brand Commitments

O nome exibido na interface é **Marvin Finanças**. Os textos do aplicativo usam português brasileiro. O ícone da marca é [marvin.webp](public/brand/marvin.webp).

## Evidence on Hand

- [README](../../README.md) e [arquitetura](../../ARCHITECTURE.md#6-ui) descrevem os fluxos implementados e a operação no homelab.
- [Modelo de dados](../../docs/data-model.md#2-semântica-financeira) define a semântica de saldo, dívida, fatura e relatórios.
- [Validação de interface](../../docs/ui-validation.md) e [capturas](../../docs/screenshots/) registram exemplos das telas em celular e computador.

## Product Principles

1. Explicitar o efeito de cada operação sobre saldo, despesa e compromissos futuros.
2. Dar contexto para revisar valores, contas, datas e categorias antes da confirmação e preservar o histórico ao corrigir uma operação.
3. Manter o registro e a consulta acessíveis no celular, com espaço para análises mais amplas no computador.

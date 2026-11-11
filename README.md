<p align="center">
  <img src="docs/images/marvin-project-banner.png" alt="Marvin Project — controle financeiro pessoal" width="100%">
</p>

# Marvin Project

Aplicação pessoal de controle financeiro em reais brasileiros, com interface web em pt-BR e integração com Hermes por MCP. O projeto roda em um monorepo pnpm e foi pensado para self-hosting.

## Funcionalidades

- Contas, cartões, receitas, despesas e transferências.
- Compras parceladas, faturas, previsões e relatórios.
- API HTTP autenticada e servidor MCP separado.
- Persistência PostgreSQL com regras financeiras centralizadas.

## Começar

Requisitos: Node.js, pnpm 12 e Docker para iniciar o PostgreSQL local.

```bash
pnpm install
```

Para configurar o banco, aplicar migrations e criar a conta proprietária, siga o [guia de desenvolvimento local](docs/deployment.md#postgresql-para-desenvolvimento-local). Depois, inicie a interface com `pnpm dev:web`; para iniciar o servidor MCP em outro terminal, use `pnpm dev:mcp`.

## Documentação

- [Deploy e operação no homelab](docs/deployment.md)
- [Migrations do banco](docs/migrations.md)
- [Arquitetura e limites entre os pacotes](ARCHITECTURE.md)
- [Modelo de dados e invariantes financeiros](docs/data-model.md)
- [API HTTP](docs/api.md)
- [Ferramentas MCP](docs/mcp.md)
- [Verificações e validação](docs/verification.md)
- [Decisões arquiteturais](docs/adr/)

## Licença

O código original está disponível sob a [PolyForm Noncommercial License 1.0.0](LICENSE). Dependências e componentes de terceiros mantêm suas próprias licenças.

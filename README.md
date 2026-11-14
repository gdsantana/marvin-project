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

## Instalação no homelab

Após a primeira release pública, instale a versão estável mais recente em uma VM Linux com Docker Compose:

```bash
curl -fsSL https://github.com/gdsantana/marvin-project/releases/latest/download/install.sh | bash
```

Execute em um terminal interativo. A instalação usa `~/marvin`, que deve estar vazio ou ainda não existir, sem precisar salvar o script ou preparar um diretório intermediário. Para escolher uma versão e outro diretório, consulte o [guia de instalação](docs/deployment.md#primeira-instalação-sem-clone).

O mesmo `scripts/install.sh` da revisão é publicado nas releases. Ele repete entradas inválidas de HTTPS, usuário e senha. Se a porta 3000 ou 3001 estiver ocupada, pede outra porta para a Web e usa a seguinte para o MCP, por exemplo 4000 e 4001.

O instalador cria as configurações e credenciais, baixa as imagens do GitHub Container Registry (GHCR), prepara o PostgreSQL e inicia Web e MCP. Ele pede a origem HTTPS e a criação da conta da interface; ao final, exibe o token bearer para conectar o agente ao MCP. Configure também um proxy privado, DNS e HTTPS. Enquanto a release ou as imagens forem privadas, é necessária autenticação conforme o [guia de instalação](docs/deployment.md#primeira-instalação-sem-clone).

Para atualizar uma instalação existente, escolha uma release estável e execute no diretório de instalação:

```bash
./update-homelab.sh vX.Y.Z
```

O atualizador baixa Web e MCP da mesma versão, faz backup, aplica migrations e reinicia os dois serviços. O PostgreSQL tem ciclo de atualização separado. Revise as notas e bloqueie o acesso pelo proxy e Hermes antes da confirmação; siga o [guia de operação](docs/deployment.md#atualização-de-instalação-existente) para backups, recuperação e verificação.

Releases usam Release Please: mudanças convencionais integradas à `main` acumulam-se em um PR de release. Quando esse PR é integrado, o workflow gera a tag, publica imagens Web/MCP no GHCR e anexa os arquivos de instalação. O deploy no homelab é manual. A release estará pronta para instalar quando contiver `marvin-deploy.tar.gz`.

## Desenvolvimento local

Requisitos: Node.js, pnpm 12 e Docker para iniciar o PostgreSQL local.

```bash
pnpm install
```

Para configurar o banco, aplicar migrations e criar a conta proprietária, siga o [guia de desenvolvimento local](docs/deployment.md#postgresql-para-desenvolvimento-local). Depois, inicie a interface com `pnpm dev:web`; para iniciar o servidor MCP em outro terminal, use `pnpm dev:mcp`.

A separação técnica do banco está no [ADR 0012](docs/adr/0012-database-runtime-and-migration-roles.md): a Web usa `marvin_app`; migrations e manutenção usam `marvin_migrator`; o provisionamento de roles usa a conexão administrativa. Isso não cria perfis de usuário na interface. Para bases existentes, siga o procedimento explícito `--adopt-existing` no [guia de deploy](docs/deployment.md#separação-de-privilégios-postgresql); não altere ownership de uma base real sem backup e revisão.

## Documentação

- [Deploy e operação no homelab](docs/deployment.md)
- [Releases e atualização do homelab](docs/deployment.md#releases-e-deploy-com-imagens-publicadas)
- [Migrations do banco](docs/migrations.md)
- [Arquitetura e limites entre os pacotes](ARCHITECTURE.md)
- [Modelo de dados e invariantes financeiros](docs/data-model.md)
- [API HTTP](docs/api.md)
- [Ferramentas MCP](docs/mcp.md)
- [Verificações e validação](docs/verification.md)
- [Decisões arquiteturais](docs/adr/)

## Licença

O código original está disponível sob a [PolyForm Noncommercial License 1.0.0](LICENSE). Dependências e componentes de terceiros mantêm suas próprias licenças.

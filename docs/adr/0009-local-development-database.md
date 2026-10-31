# ADR 0009 — Acesso local ao PostgreSQL de desenvolvimento

- Data: 2026-10-31
- Status: aceito para desenvolvimento local

## Contexto

O PostgreSQL do Compose usa o host interno `db`, inacessível aos scripts pnpm executados no host. O mantenedor confirmou o uso desse banco Docker no desenvolvimento.

## Decisão

Adicionar `infra/compose.dev.yml`, usado somente por `pnpm db:up`, para publicar o PostgreSQL em `127.0.0.1`, porta `DEV_DB_HOST_PORT` ou 5432. O serviço e seu volume existente são preservados. O Compose de deploy continua sem publicar a porta do banco, conforme ADR 0003.

O override adiciona uma rede bridge de desenvolvimento somente ao banco, mantendo também a rede interna existente. Uma rede não interna é necessária para o Docker efetivar a publicação da porta. Web e MCP não são conectados à rede de desenvolvimento.

Os comandos de limpeza e seed preferem `DEVELOPMENT_DATABASE_URL`, com credenciais literais e endereço local. `DATABASE_URL` continua disponível para os containers e como fallback dos scripts. A configuração de desenvolvimento não é consumida pela aplicação de produção. As proteções de produção e confirmação explícita continuam obrigatórias; a porta local não distingue dados reais de fictícios.

## Consequências

É possível usar scripts locais com o PostgreSQL Docker sem expor a porta à LAN. Aplicar o override recria o container e pode interromper conexões brevemente, sem remover o volume. Alterações de porta precisam ser refletidas na URL de desenvolvimento. A limpeza permanece explícita e destrutiva; iniciar o banco não limpa nem popula dados.

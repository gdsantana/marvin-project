# ADR 0012 — Roles distintas para runtime e migrations PostgreSQL

- Data: 2026-11-07
- Status: aceito para implementação local solicitada; aplicação no homelab não autorizada nesta entrega.
- Referências: ARCHITECTURE.md §2/§8, docs/data-model.md §10.1/§18 e ADRs 0003/0011.

## Contexto

Web e migrations usavam a mesma `DATABASE_URL`. O proprietário aprovou separar as identidades técnicas PostgreSQL, mantendo a conta única de login da Web e a fronteira MCP → HTTP → Web → DB. Objetivo: runtime funcionar sem autoridade para alterar schema, permissões, senha do proprietário ou desabilitar os triggers financeiros.

## Decisão

Manter a identidade administrativa existente como propriedade da base e acesso reservado ao operador. Criar `marvin_migrator` e `marvin_app` com LOGIN e senhas distintas, sem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS ou associação a outras roles. As roles são fixas e cluster-globais: uma implantação Marvin por cluster com essa política. O provisionamento recusa roles homônimas não gerenciadas ou incompatíveis.

`marvin_migrator` possui os schemas/objetos da aplicação e CREATE na base dedicada, para o journal Drizzle e futuras migrations. `marvin_app` tem CONNECT, USAGE no schema e grants explícitos por operação. Não é dono da base/objetos, não tem TEMP, CREATE ou TRUNCATE, e não acessa `drizzle`. Publicações PostgreSQL e credenciais DB permanecem fora do MCP.

A política versionada reside em `packages/db/src/database-roles.ts`. Comando separado `db:provision-roles` exige terminal e conexão administrativa para criar/verificar roles e ownership em transação. Senhas técnicas são URL-safe ASCII de 32 a 128 caracteres; envia verificadores SCRAM-SHA-256 com salt aleatório, sem plaintext no SQL. Erros do CLI não expõem URLs, senhas ou mensagens brutas do driver. Reexecução preserva senhas; rotação exige `--rotate-passwords`.

Bancos existentes exigem `--adopt-existing`, backup e revisão explícita dos objetos conhecidos. Não executar REASSIGN OWNED amplo, apagar dados ou reescrever migrations. Roles, transferência de ownership e grants são operações administrativas versionadas no código, separadas das migrations financeiras. Objetos inesperados são bloqueados para revisão.

O runner `db:migrate` exige `MIGRATION_DATABASE_URL` autenticada como `marvin_migrator`, sem fallback para runtime. Usa o migrator do Drizzle ORM com o mesmo diretório/journal e reaplica grants após sucesso. Novos objetos ficam sem acesso runtime até serem incluídos na política; defaults revogam execução pública de funções e não concedem acesso automático a tabelas/sequências. Não conceder grants genéricos em todos os objetos futuros.

Os locks de autenticação/triggers exigem UPDATE em ao menos uma coluna: grants `UPDATE(id)` em `auth_users`, `accounts` e `transactions` satisfazem o lock sem permitir update de senha/saldo inicial/metadados. Histórico financeiro permanece com triggers append-only; outras permissões são restritas às operações usadas pelos repositórios. Comandos de owner/bootstrap e limpeza dev usam conexão operacional; não recebem mais autoridade no runtime.

Separar `.env` de runtime e `.env.ops` de operação, ambos não versionados nem copiados às imagens. `.env.ops.example` é somente template. Web não carrega `.env.ops`; Compose injeta apenas DATABASE_URL em Web, MIGRATION_DATABASE_URL no job migrate e DATABASE_ADMIN_URL no job provision-roles. POSTGRES_PASSWORD administrativo fica no arquivo operacional e é entregue somente ao DB. Host/CLI utiliza URLs adequadas a localhost; jobs Compose usam DNS interno db. Operador precisa proteger os dois arquivos e não exportar segredos administrativos no ambiente da Web.

## Alternativas e limites

- Mesma conexão para tudo: menor configuração, mas runtime retém DDL/ownership; rejeitada para o objetivo aprovado.
- Aplicação como membro da role migrator: elimina a fronteira por SET ROLE; rejeitada.
- Novo usuário admin/comum na UI: não resolve privilégios PostgreSQL e está fora do escopo.
- Migrations com superusuário: autoridade desnecessária para as migrations atuais; bootstrap administrativo continua separado.

Não há isolamento de dados contra uma Web comprometida que já tem leitura/escrita financeira autorizada. Roles limitam DDL e escalada, não substituem validação de domínio, credenciais, backup ou rede privada. Owners de objetos continuam podendo alterá-los; por isso a identidade de migrations não é entregue ao processo Web.

Critério de revisão: novas migrations devem atualizar grants quando precisarem de acesso runtime e passar testes positivos/negativos. Se surgir necessidade de vários deployments no mesmo cluster, parametrizar nomes e identidade de ownership em decisão separada, sem ampliar silenciosamente esta política.

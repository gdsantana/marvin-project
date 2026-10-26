# ADR 0003 — Deploy no homelab com Docker Compose

- Data: 2026-10-25
- Status: aceito; implementação e validação no homelab pendentes.

## Contexto

O projeto é pessoal, privado e self-hosted. A stack definida no [ADR 0002](0002-application-stack.md) reúne frontend e API no Next.js e mantém o servidor MCP separado. Precisamos de uma implantação simples, com persistência e fronteiras de acesso explícitas.

## Decisão

Usar Docker Compose em uma VM dentro do Proxmox, com três serviços permanentes, inicialmente um container por serviço:

- `web`: frontend e backend/API Next.js no mesmo processo/container; único serviço permanente da aplicação com acesso ao PostgreSQL.
- `mcp`: servidor MCP independente, acessado pelo Hermes e consumidor da API HTTP autenticada do `web`; sem acesso à rede ou às credenciais do banco.
- `db`: PostgreSQL com volume persistente próprio, sem publicar a porta no host.

Separar uma rede de aplicação (`web` e `mcp`) e uma rede de banco (`web` e `db`). O MCP usará o DNS de serviço do Compose para chamar o web. Acesso externo ao Compose será restrito à LAN/VPN, por reverse proxy, reutilizando o existente no homelab se disponível. O proxy não é um quarto serviço obrigatório deste projeto; sua localização ainda será definida.

Configurar health checks, política de reinício e espera pelas dependências saudáveis na inicialização. Os clientes também deverão tratar indisponibilidade e reconectar durante a execução. Health check não implica reinício automático por estado `unhealthy`.

Usar imagens com versões identificáveis, secrets fora das imagens/repositório e backups periódicos do PostgreSQL fora do volume de dados, com restauração testada. Migrations serão uma etapa explícita, executada uma vez por deploy, por comando/container temporário com acesso controlado ao banco; não serão um serviço permanente nem executadas por cada instância ao iniciar.

## Alternativas consideradas

- Frontend e API em containers separados: adicionaria operação sem necessidade atual; os limites de código permanecem nos workspaces.
- Todos os processos em um container: acoplaria atualização, ciclo de vida e credenciais dos serviços.
- Kubernetes ou implantação em vários hosts: complexidade sem requisito atual de alta disponibilidade ou escalabilidade.

## Consequências e limites

Web e MCP poderão ser atualizados separadamente, respeitando compatibilidade de contratos. O host será um ponto único de falha; Compose não oferece alta disponibilidade entre hosts nesta topologia. Volume persistente não substitui backup, e rollback de imagem não desfaz migrations.

Recursos da VM, proxy, DNS, portas de entrada, armazenamento, política de backup e entrega de secrets continuam pendentes em [deployment.md](../deployment.md). Esta decisão não cria Compose, Dockerfiles, migrations ou deploy real.

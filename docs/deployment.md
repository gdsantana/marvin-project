# Deploy no homelab — plano aprovado

> **Status:** decisão documentada, ainda sem Compose/Dockerfiles implementados ou deploy validado. Este documento não é um runbook executável.

Referências: [ADR 0003](adr/0003-homelab-deployment.md), [stack](adr/0002-application-stack.md) e [arquitetura, §2](../ARCHITECTURE.md#2-visão-de-execução-container-level).

## Serviços e comunicação

Docker Compose gerenciará três serviços permanentes em uma VM dentro do Proxmox, inicialmente um container por serviço:

- `web`: Next.js com frontend e API HTTP, composição do domínio e acesso ao PostgreSQL.
- `mcp`: servidor MCP Node.js/TypeScript, recebendo chamadas autenticadas do Hermes e chamando a API do `web` com credencial própria.
- `db`: PostgreSQL com volume persistente; sem porta publicada no host.

O navegador usa o endereço do web via proxy. O Hermes usa um endereço MCP alcançável na LAN/VPN, também via proxy. Nomes de serviço Docker não são endereços para navegador ou Hermes fora do Compose.

Internamente, MCP → web usará o DNS do serviço (exemplo conceitual: `http://web:3000`, porta ainda a configurar). Web → banco usará `db` e a porta interna do PostgreSQL. Os contratos de entrada, saída e erro são os mesmos para web e MCP; a autenticação de cada cliente é distinta.

## Redes e entrada

- Rede de aplicação compartilhada por `web` e `mcp`.
- Rede de banco compartilhada somente por `web` e `db`, isolada dos demais serviços.
- Apenas o web recebe credenciais de acesso ao banco em execução normal; MCP não recebe credenciais DB nem participa da rede do banco.
- Reverse proxy à frente de web e MCP, com HTTPS e limites de requisição; preferir reutilizar o proxy do homelab, se disponível. Não há acesso público à internet previsto.
- Se o proxy estiver no mesmo Docker, conectá-lo à rede apropriada de entrada, sem acesso à rede DB. Se estiver fora, definir portas do host vinculadas à interface privada adequada e firewall. Evitar exposição irrestrita por padrão.
- Validar encaminhamento e timeouts necessários ao transporte MCP escolhido, sem interromper respostas longas/streaming quando aplicável.

## Assets da aplicação

Imagens e assets ficam em `apps/web` e são entregues pelo próprio web, incluídos em sua imagem de container. Não há serviço separado de arquivos ou CDN previsto. Essa decisão trata de assets da aplicação; uploads de usuário não foram definidos.

## Persistência, configuração e credenciais

O volume PostgreSQL deve sobreviver à substituição dos containers. Não remover o volume durante atualizações. Não persistir dados financeiros apenas na camada gravável do container.

Configuração será documentada em `.env.example` no bootstrap, sem valores reais. Prever conexão DB somente no web (e na execução temporária de migrations), endereço interno da API no MCP, credenciais distintas para Hermes → MCP e MCP → API, configuração de sessão web e endereços externos. Nomes finais das variáveis serão definidos na implementação.

Secrets serão fornecidos no runtime, fora do Git, das imagens e dos logs. O mecanismo concreto (arquivos protegidos/secrets do Compose ou configuração protegida no host) está pendente. Não enviar secrets para variáveis públicas do Next.js ou ao bundle do navegador. A imagem DB terá configuração administrativa própria, sem compartilhá-la com o MCP.

## Inicialização e recuperação

Configurar health checks para os três serviços e dependências com espera por estado saudável quando necessárias: web depende de DB disponível; MCP depende de API pronta. Definir verificações de disponibilidade sem dados privados; endpoints e comandos ainda não existem.

Configurar política de reinício, inicialmente `unless-stopped`. Um health check marcado `unhealthy` não reinicia por si só um container; política de reinício trata saída do processo. Web e MCP devem tratar perda posterior de dependências, reconexão e erros temporários; retries de escritas preservam idempotência.

## Atualizações e migrations

Procedimento futuro a transformar em comandos validados no bootstrap:

1. Identificar a versão de destino de web/MCP/DB e revisar compatibilidade de contratos, migrations e possibilidade de rollback.
2. Garantir backup recuperável antes de alterações de banco; bloquear escritas quando a migration exigir janela de manutenção.
3. Executar migrations versionadas uma única vez, via comando ou container temporário com acesso controlado à rede DB. Não iniciar um migrador permanente nem executar migrations simultâneas ao subir cada aplicação.
4. Atualizar web/MCP com imagens de versão identificável e verificar saúde e comunicação autenticada. Não usar atualização automática irrestrita de imagens.
5. Em falha, avaliar compatibilidade antes de voltar a imagem. Migrations aplicadas não são desfeitas automaticamente; restauração de backup é recuperação controlada e pode perder escritas posteriores.

Atualizações de versão major do PostgreSQL terão procedimento próprio, validado antes de produção. Não trocar a versão major apenas reutilizando o volume sem planejar a migração.

## Backup e restauração

Prever backup lógico periódico do PostgreSQL, com ferramenta compatível com sua versão, armazenamento fora do volume do banco e cópia fora do host para recuperação de falha do servidor. Proteger os arquivos por conterem dados financeiros e restringir acesso às credenciais necessárias. Não versionar dumps.

Definir frequência e retenção conforme perda de dados tolerável. Antes do uso real e periodicamente, restaurar em ambiente isolado e verificar integridade e cenários financeiros. Volume persistente ou snapshot isolado não substitui uma estratégia de backup validada.

## Decisões pendentes e limites

- Recursos da VM no Proxmox e caminhos/volumes de armazenamento; hospedagem na VM já definida.
- Proxy existente, DNS, certificados, portas e interfaces de entrada para navegador e Hermes.
- Entrega/rotação de secrets; login web já definido por senha local e sessão.
- Build local ou CI/registry, tags/digests e política de atualização das imagens.
- Frequência, retenção, destino protegido dos backups e objetivos de recuperação.
- Comandos de health check, limites de recursos e rotação de logs na implementação.

Um host único é ponto único de falha. Não há Kubernetes, replicação ou alta disponibilidade previstos. Não há Compose, Dockerfiles, endpoints de health check ou automação de backup criados por esta documentação.

## Referências

- [Next.js: self-hosting e reverse proxy](https://nextjs.org/docs/app/guides/self-hosting).
- [Docker Compose: ordem de inicialização e saúde das dependências](https://docs.docker.com/compose/how-tos/startup-order/).

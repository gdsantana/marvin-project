# ADR 0013 — Distribuir releases por imagens GHCR

- Data: 2026-11-13
- Status: aceito; publicação e deploy no homelab pendentes de validação.

## Contexto

O Marvin terá releases para instalações self-hosted. Construir imagens em cada host exige checkout e ferramentas de build; Web e MCP precisam usar contratos compatíveis e migrations precisam acompanhar a revisão instalada.

## Decisão

Manter uma versão de release para todo o repositório. O Release Please cria a tag e release; o mesmo workflow constrói e publica imagens Web e MCP identificadas por essa tag no GHCR para amd64 e arm64. Após ambas serem publicadas, anexa um bundle de instalação com o Compose, atualizador e exemplos de configuração. O único instalador, `scripts/install.sh`, é anexado à release sem transformação e permite baixar o bundle por HTTPS e executar toda a configuração interativa. Ele não executa instaladores de dentro do bundle. O bundle sinaliza que a publicação terminou, não que o deploy ou recuperação tenham sido verificados. As tags publicadas não devem ser sobrescritas após a disponibilização do bundle.

O host usa a imagem Web também para jobs temporários de migration e administração, mantém secrets locais e escolhe explicitamente a release. Para uma instalação nova, o instalador gera credenciais e as entrega às roles por arquivo temporário restrito, além de pedir interativamente as credenciais do proprietário e entregá-las por stdin ao job operacional que chama `provisionOwner` na imagem Web; ele recusa ambientes existentes. A atualização é manual, com janela de manutenção, backup e migration antes de recriar Web/MCP. PostgreSQL segue usando imagem oficial e volume persistente, com ciclo de atualização separado. Releases não disparam deploy nem atualização automática do banco.

## Alternativas consideradas

- Build em clone no host: continua possível para desenvolvimento, mas exige checkout e build em todas as instalações.
- Versões independentes por serviço: reduziria recriações em algumas mudanças, mas aumenta combinações de compatibilidade e complexidade operacional sem necessidade atual.
- Atualização automática de containers: não garante backup e ordem das migrations para dados financeiros.

## Consequências

Instalações dependem de acesso ao GHCR, às releases e de autenticação enquanto os pacotes forem privados. Releases e imagens precisam ser mantidas disponíveis; tags não são imutáveis por construção, de modo que registrar digests acrescenta rastreabilidade. O PostgreSQL, backups, proxy, credenciais e recuperação continuam sob responsabilidade do operador. A implementação precisa ser validada em GitHub e em ambiente descartável antes de dados reais.

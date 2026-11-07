# ADR 0011 — Usuário local e sessões no PostgreSQL

- Data: 2026-11-07
- Status: aceito para a implementação solicitada do login.
- Substitui a decisão de senha local via ambiente do ADR 0004.

## Contexto

O proprietário solicitou username e senha validados no banco, antes de separar finanças por usuário. A separação futura está na issue #9. Arquitetura §3 e modelo §18 descrevem os limites.

## Decisão

Manter autenticação local, sem dependência adicional, cadastro público ou novos serviços. Uma única conta é imposta por constraint. O comando administrativo cria a conta ou redefine explicitamente a senha do mesmo usuário, revogando as sessões. IDs UUID identificam o usuário autenticado no servidor sem introduzir isolamento financeiro.

Hash scrypt com salt aleatório de 16 bytes, N=32768, r=8, p=3 e saída de 64 bytes, com custos explícitos no formato. Não reutilizar silenciosamente hashes antigos com parâmetros diferentes. Username é ASCII, normalizado, único; senha não é normalizada.

Cookies opacos aleatórios de 32 bytes identificam sessões de sete dias. Guardar somente hash SHA-256 do identificador no banco. Toda autorização web consulta sessão e usuário ativo. Logout revoga no servidor, e reset de senha revoga todas as sessões em transação. Manter validação de Origin, CSRF e cookies protegidos; MCP continua independente.

Reservar atomicamente até cinco tentativas globais por janela de 15 minutos no banco antes do trabalho criptográfico, inclusive para usuário desconhecido. Sucesso limpa a janela. Não confiar em IP inferido de headers. Este limite persiste entre reinícios/réplicas, mas permite bloqueio temporário do proprietário sob abuso; controle por origem exigirá configuração explícita de proxy confiável.

## Alternativas

Better Auth oferece username, Drizzle e gestão de sessões, mas adiciona estrutura e dependências para uma única conta e seu fluxo padrão mantém e-mail. Reavaliar se passkeys/MFA se tornarem requisito. Não implementar isolamento financeiro nesta mudança.

## Operação

Migration aditiva 0003, seguida de provisionamento interativo do proprietário antes de liberar acesso. Cookies e variáveis antigos deixam de autenticar, sem fallback à senha de ambiente. Nenhuma migration foi autorizada em banco real pelo desenvolvimento desta alteração. Backup protege também as tabelas de autenticação. Seed financeiro preserva identidade.

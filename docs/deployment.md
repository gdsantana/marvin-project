# Deploy no homelab

Deploy via Docker Compose em uma VM. Esta infraestrutura implementa os serviços e comandos abaixo; o deploy e a restauração de um backup real ainda não foram validados no homelab. Existe um ensaio descartável descrito em [recovery-validation.md](recovery-validation.md).

## Topologia

- `web`: Next.js, único serviço permanente com acesso à rede PostgreSQL.
- `mcp`: MCP HTTP Streamable, rede de aplicação e API HTTP autenticada; não recebe `DATABASE_URL` nem participa da rede DB.
- `db`: PostgreSQL com volume persistente, sem porta publicada.
- `migrate`: serviço temporário no profile `ops`, criado somente ao executar a migration explicitamente.

O Compose cria uma rede `application` para web/MCP e outra rede interna `database` para web/DB. Web e MCP publicam portas no loopback do host por padrão; um reverse proxy privado instalado no host pode encaminhá-las. Para outro proxy dentro de container, configure os endereços de bind e a rede privada do proxy de modo explícito. Não exponha as portas à internet.

O acesso à Web ocorre somente pela LAN ou, fora de casa, após entrar na VPN. Hermes roda no mesmo homelab e acessa MCP pela LAN; Discord é a única entrada externa indireta de comandos ao agente. Web, MCP e PostgreSQL não são publicados diretamente na internet. A seção [HTTPS privado com Nginx Proxy Manager](#https-privado-com-nginx-proxy-manager) descreve como usar um proxy privado no Proxmox nessa topologia.

## Pré-requisitos e preparação para build local

- VM Linux no Proxmox com Docker Engine e plugin Docker Compose, Git e acesso ao repositório privado e aos registries usados pelos Dockerfiles.
- Disco persistente para o volume `postgres_data`, espaço para builds e dumps e destino de backup fora da VM. Dimensione CPU, memória e disco conforme o uso; o projeto não tem capacidade mínima medida.
- DNS privado e reverse proxy com HTTPS confiável pelo navegador e pelo Hermes, acessíveis somente pela LAN/VPN. No host da VM, o proxy pode usar os binds loopback padrão. Um proxy em outra máquina precisa de binds no IP privado da VM e firewall restrito aos clientes/proxy autorizados.
- Acesso administrativo ao Docker e ao diretório de backup. Node.js 24 e pnpm 12.15.0 no host são necessários apenas se executar os scripts pnpm fora dos containers; os builds Docker já incluem o runtime.

Escolha uma revisão aprovada do código e registre `git rev-parse HEAD`, a tag PostgreSQL e o destino do backup no registro privado da implantação. Execute os comandos deste guia na raiz desse checkout. Não aplique `infra/compose.dev.yml` em produção.

Antes da primeira implantação, defina o destino externo, a frequência e retenção dos backups e a perda de dados/tempo de recuperação aceitáveis. Não há agendamento automático no repositório. Snapshot da VM e volume persistente não substituem dump restaurável.

## Configuração e primeira subida

As instruções desta seção usam um checkout e build local. Para instalar imagens prontas, siga [Primeira instalação sem clone](#primeira-instalação-sem-clone); o instalador gera essas variáveis automaticamente.

Requer Docker com Compose plugin. No diretório raiz do repositório:

```bash
cp .env.example .env
cp .env.ops.example .env.ops
chmod 600 .env .env.ops
```

Edite os arquivos no host de operações. `.env` contém a conexão `DATABASE_URL` de `marvin_app`, `APP_ORIGIN` e os dois tokens MCP. `.env.ops` contém `POSTGRES_PASSWORD` da identidade administrativa de inicialização, `DATABASE_ADMIN_URL` para provisionar roles e `MIGRATION_DATABASE_URL` de `marvin_migrator`. Use três senhas PostgreSQL distintas; gere cada uma com `openssl rand -hex 32`. As senhas das roles técnicas devem ter 32 a 128 caracteres URL-safe. Configure senhas literais e correspondentes nas URLs; Node não expande `${...}` nesses arquivos.

Em volume já inicializado, preserve `POSTGRES_USER` e a senha administrativa existentes: mudar essas variáveis não renomeia nem redefine usuários de um volume existente. A separação de roles não exige trocar essa identidade administrativa.

`APP_ORIGIN` deve ser a origem HTTPS usada pelo navegador no proxy privado. Web recebe somente a conexão de aplicação e seu token de API; MCP recebe os dois tokens e a URL HTTP interna, sem credenciais PostgreSQL. O job `migrate` recebe somente `MIGRATION_DATABASE_URL`; o job `provision-roles` recebe somente `DATABASE_ADMIN_URL`. A senha administrativa de inicialização é entregue ao serviço `db`, nunca a Web/MCP. Não coloque `.env.ops` em `apps/web`, nas imagens ou no ambiente do serviço Web.

Depois de preencher os dois arquivos, valide sem imprimir a configuração resolvida, pois ela contém secrets:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml config --quiet
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml build web mcp migrate provision-roles
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml up -d db
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml --profile ops run --rm provision-roles
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml run --rm migrate
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml --profile ops run --rm migrate pnpm db:provision-owner
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml run --rm migrate pnpm --filter @finance/db db:bootstrap-categories
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml up -d web mcp
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml ps
```

O provisionamento pede e confirma as senhas de `marvin_app` e `marvin_migrator` sem eco. Elas precisam corresponder às URLs configuradas; o comando não imprime nem grava credenciais em arquivos. Roles existentes gerenciadas não têm senhas alteradas sem `--rotate-passwords`. Roles preexistentes não gerenciadas, elevadas ou associadas a outras roles são recusadas. Em banco existente, consulte a transição explícita na seção de privilégios abaixo antes de executar.

O serviço `migrate` é uma execução única sob demanda, não é iniciado em `up`. Execute-o após o backup e antes de atualizar web/MCP. A migration usa `MIGRATION_DATABASE_URL` e os arquivos versionados de `packages/db`. Não prossiga se ela falhar; revise logs sem copiar valores sensíveis.

Após as migrations, `db:bootstrap-categories` cadastra 10 categorias de despesa e 3 de receita, sem contas ou lançamentos fictícios. Pode ser repetido: insere somente categorias raiz ausentes por nome e tipo, comparando nomes sem diferença de maiúsculas/minúsculas e espaços externos. Categorias existentes, inclusive arquivadas, não são alteradas. A carga é atômica e bloqueia escritas na tabela de categorias brevemente para serializar execuções concorrentes. Não execute `db:seed` em produção: ele limpa dados e cria uma carga fictícia.

Health checks consultam `pg_isready`, `/api/health` e `/healthz`, sem retornar dados privados. `unhealthy` não reinicia container por si só; `unless-stopped` reinicia processos que saírem. Web depende de DB saudável e MCP depende de web saudável.

## HTTPS privado com Nginx Proxy Manager

O Nginx Proxy Manager (NPM) pode rodar em uma VM ou LXC dedicado no Proxmox e encaminhar HTTPS para Web/MCP por HTTP na LAN. Essa opção reutiliza o reverse proxy previsto na arquitetura; não adiciona um serviço obrigatório ao Compose do Marvin nem requer instalar software no nó do hipervisor. O procedimento abaixo é orientação de configuração, ainda não validada no homelab.

### Endereços e DNS privado

Exemplo: NPM em `192.168.1.10` e VM Marvin em `192.168.1.20`. Substitua esses IPs e os nomes `example.com` pelos valores reais do homelab e de um domínio sob seu controle.

| Nome no DNS privado | Resolve para | Destino no NPM |
|---|---|---|
| `marvin.example.com` | `192.168.1.10` | `http://192.168.1.20:3000` |
| `mcp.example.com` | `192.168.1.10` | `http://192.168.1.20:3001` |

Configure esses registros no DNS usado pela LAN. Os clientes da VPN também precisam usar esse DNS e ter rota para o IP privado do NPM. Hermes deve resolver `mcp.example.com` pelo DNS privado. Não é necessário criar registros públicos A/AAAA apontando para sua casa nem encaminhar portas WAN 80/443 para essa aplicação. A entrada remota do proprietário continua sendo a VPN.

### Certificado sem publicar a aplicação

Para usar Let's Encrypt, tenha um domínio próprio com DNS público sob seu controle. No NPM, em **SSL Certificates**, solicite um certificado para os dois nomes, habilite **Use a DNS Challenge** e selecione o provedor DNS compatível. Forneça uma credencial de API com o menor escopo necessário para editar os registros de validação da zona, sem copiá-la para o `.env` do Marvin ou para o Git.

A validação DNS-01 usa um registro TXT público em `_acme-challenge`; os endereços da aplicação continuam resolvidos apenas no DNS privado. Emissão e renovação precisam de saída do NPM para DNS, API do provedor e serviço ACME, mas não de entrada da internet até Web/MCP. Consulte o [suporte a plugins DNS do NPM](https://nginxproxymanager.com/certbot/) e a [validação DNS-01 do Let's Encrypt](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge).

Se usar somente um nome interno como `finance.example.lan`, a alternativa é importar no NPM um certificado de uma CA interna e instalar a confiança dessa CA nos navegadores e no runtime do Hermes. Não desabilite a validação do certificado para contornar falta de confiança.

### Bind da VM Marvin e firewall

O NPM em outra VM/LXC não alcança o `127.0.0.1` da VM Marvin. Nesse cenário, ajuste somente os valores correspondentes no `.env` do Marvin:

```dotenv
APP_ORIGIN=https://marvin.example.com
WEB_BIND_ADDRESS=192.168.1.20
WEB_HOST_PORT=3000
MCP_BIND_ADDRESS=192.168.1.20
MCP_HOST_PORT=3001
MCP_API_URL=http://web:3000/api/
```

Mantenha os dois tokens fortes e distintos já configurados. `APP_ORIGIN` é a origem HTTPS da Web, sem path; não use o nome do MCP nesse campo. `MCP_API_URL` permanece na rede interna do Compose: não aponte o cliente MCP para o endereço do Hermes nem para o proxy público/privado.

Restrinja as portas publicadas 3000/3001 da VM Marvin à origem NPM (`192.168.1.10` no exemplo), com regras efetivas para o tráfego Docker no firewall da VM/Proxmox. Permita HTTPS do NPM apenas aos clientes LAN/VPN previstos; restrinja o host MCP ao Hermes conforme a política local. Mantenha também o painel administrativo do NPM, normalmente na porta 81, restrito à administração pela LAN/VPN. PostgreSQL continua sem porta publicada; não aplique o overlay de desenvolvimento para resolver acesso do proxy.

Se as aplicações já estiverem em execução, valide e recrie somente Web/MCP após ajustar o ambiente, em uma janela sem operações em andamento:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml config --quiet
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml up -d --force-recreate web mcp
```

Um simples `restart` não aplica os valores novos. Se o proxy rodar diretamente no host da VM Marvin, mantenha os binds loopback originais; um proxy dentro de outro container precisa de rede/destino alcançável explícito, mesmo quando compartilha a VM.

### Proxy Hosts e transporte MCP

No NPM, crie dois **Proxy Hosts**, conforme a tabela de endereços: **Domain Names** recebe somente o nome DNS, **Scheme** é `http`, **Forward Hostname / IP** é o IP privado da VM Marvin e **Forward Port** é 3000 ou 3001. Na aba **SSL**, selecione o certificado correspondente e habilite **Force SSL**. Mantenha **Cache Assets** desativado nos dois hosts. A [documentação do NPM](https://nginxproxymanager.com/guide/) descreve proxy hosts e terminação TLS.

Para o host MCP, preserve o path `/mcp`, métodos POST/GET/DELETE e o header `Authorization: Bearer ...`. Não acrescente HTTP Basic Authentication nesse host: ela disputa o mesmo header usado pelo bearer do Hermes. As restrições de rede/IP complementam a autenticação própria do MCP.

MCP usa HTTP Streamable, não WebSocket; mantenha **Websockets Support** desativado nesse host. Para encaminhar streaming sem cache/buffering e permitir intervalos maiores entre leituras, use na aba **Advanced** do host MCP:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

Os 300 segundos são um valor inicial operacional, não garantia de duração total; os timeouts se aplicam aos intervalos entre operações de leitura/escrita. Não crie outro `location /` ou `proxy_pass` nesse campo: o NPM gera o encaminhamento. Confira a configuração efetiva e sua sintaxe na versão instalada antes de liberar uso; custom locations existentes podem alterar a herança dessas diretivas. Referência: [módulo proxy do Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

Configure Hermes com `https://mcp.example.com/mcp` e a credencial `MCP_HERMES_BEARER_TOKEN`. O NPM não substitui o login web, o CSRF ou os bearers. Nesse arranjo, TLS termina no NPM; NPM → Web/MCP usa HTTP na LAN e MCP → Web continua HTTP na bridge Docker. Reavalie esses saltos se passarem por um segmento não confiável.

### Verificação dessa configuração

Após configurar, verifique pela LAN e repita pela VPN:

1. Os dois nomes resolvem para o IP privado do NPM; o navegador abre a Web com certificado confiável. Login e consulta funcionam; `APP_ORIGIN` corresponde à URL utilizada e o cookie de sessão é `Secure`.
2. Pelo endpoint HTTPS do MCP, `/healthz` responde e `/mcp` sem bearer é recusado. Pelo Hermes, uma consulta de leitura autenticada funciona sem quebra de streaming; não use lançamentos fictícios no banco real para testar o proxy.
3. As regras de rede permitem ao NPM alcançar os backends e impedem o acesso direto indevido às portas 3000/3001. Não há encaminhamento WAN para esses serviços; VPN e clientes internos autorizados mantêm o acesso previsto.
4. Registre expiração/renovação do certificado e proteja o estado do NPM, incluindo dados de configuração, certificados, chaves e credencial DNS. Não inclua bearer ou payload financeiro completo em logs customizados do proxy.

Registre os resultados no controle privado de implantação. A inclusão deste roteiro não comprova emissão de certificado, configuração do NPM ou funcionamento de LAN/VPN no ambiente real.

## Controles a aplicar nos hosts do homelab

Hermes e os componentes de rede não rodam no computador usado para editar este repositório. Esta seção é um roteiro para execução posterior pelo proprietário nos hosts corretos; não pressupõe a existência de arquivos do Hermes nesta máquina e não registra controles como já aplicados.

| Configuração | Onde aplicar |
|---|---|
| Usuários, canais e destinos de mensagens do bot | Ambiente/perfil efetivamente usado pelo gateway no host ou LXC do Hermes |
| Certificados, Proxy Hosts e restrição por IP do host MCP | Instância do Nginx Proxy Manager no homelab |
| Binds de Web/MCP e credenciais da aplicação | `.env` do checkout de deploy na VM Marvin |
| Regras de acesso às portas da VM | Firewall Proxmox/VM que controla a interface da VM Marvin |
| Encaminhamentos WAN, acesso IPv6, rotas e DNS da VPN | Roteador/firewall e serviço VPN do homelab |

### Autorizar somente o proprietário no Discord/Hermes

Use o ID numérico da sua conta Discord e um canal privado visível apenas para você e o bot. Confira as opções disponíveis na versão instalada do Hermes. No arquivo de ambiente realmente carregado pelo gateway **no host do Hermes**, configure os valores equivalentes a:

```dotenv
DISCORD_ALLOWED_USERS=SEU_ID_DISCORD
DISCORD_ALLOWED_CHANNELS=ID_CANAL_PRIVADO
DISCORD_HOME_CHANNEL=ID_CANAL_PRIVADO
DISCORD_ALLOW_ALL_USERS=false
GATEWAY_ALLOW_ALL_USERS=false
DISCORD_ALLOW_BOTS=none
```

Os valores acima são placeholders. `~/.hermes/.env` é o caminho padrão indicado pela documentação do Hermes, não um caminho a criar ou editar no computador deste repositório. Uma instalação com perfil, volume ou serviço pode carregar outro local; identifique esse ambiente antes de alterar qualquer arquivo. Preserve o token existente sem imprimi-lo. Reinicie somente o gateway correto, pelo supervisor usado nessa instalação, para carregar os ajustes.

Revise também `DISCORD_ALLOWED_ROLES` e configurações equivalentes que autorizem cargos: elas podem permitir usuários além da lista individual. A lista de canais não bloqueia DMs por si só; a restrição por usuário continua necessária. Confira destinos explícitos de tarefas agendadas/notificações, além do canal padrão, para que dados financeiros não sejam enviados a canais compartilhados. Referência: [configuração oficial do Discord no Hermes](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/discord.md).

Valide com consultas de leitura: sua conta funciona no canal privado; uma conta não autorizada não consegue acionar ferramentas nem por DM; o bot não responde em canais fora da lista. Não use tokens reais em prints, logs ou exemplos de configuração compartilhados.

### Confirmação obrigatória antes das escritas do agente

Requisito definido pelo proprietário, ainda pendente de implementação e validação no fluxo completo: toda escrita solicitada pelo Hermes exige confirmação humana anterior à gravação, por reação de aprovação ou resposta `aprovado` vinculada ao resumo apresentado.

1. Hermes consulta as ferramentas e schemas MCP, resolve os recursos existentes e prepara o payload. Quando houver suporte a preview, consulta-o para apresentar também os efeitos calculados pelo backend.
2. Apresenta ao proprietário o que será gravado: operação, contas/cartão envolvidos, valor, datas, categoria e parcelas quando aplicáveis. Nenhuma ferramenta de escrita deve ser chamada nessa preparação.
3. Aguarda a aprovação do proprietário autenticado no Discord, por reação previamente definida ou resposta ao resumo específico. Mensagem de outra pessoa, reação sem identidade validada ou um `aprovado` sem vínculo inequívoco com a operação não autoriza gravação.
4. Grava somente o payload apresentado e aprovado. Se qualquer campo mudar, apresenta novo resumo e pede nova confirmação. Rejeição, cancelamento ou expiração não permitem gravar.
5. Usa uma chave de idempotência para a execução; repetição da mesma aprovação não deve criar outra operação. Registra a vinculação entre solicitação, resumo aprovado, identidade do aprovador e resultado, sem registrar tokens ou dados financeiros completos nos logs gerais.

O tipo de reação e o prazo de validade da aprovação precisam ser definidos antes da implementação. A integração Discord/gateway fica no host do Hermes; a aplicação atual não recebe nem verifica uma prova de reação/resposta humana. Se a exigência for imposta também pela API/MCP, será necessário implementar uma autorização vinculada à operação final, de uso único, com evidência fornecida pelo componente confiável que valida o evento Discord. Um campo `approved: true` produzido pelo LLM não comprova aprovação humana. Até esse trabalho, não considerar a exigência garantida pelo backend. Esta documentação não cria ferramentas, endpoints ou persistência de aprovações.

### Política de acesso à rede

Adapte os IPs da seção NPM ao ambiente real e preserve o acesso administrativo ao aplicar as regras. A política desejada é:

| Destino | Origens permitidas |
|---|---|
| NPM, HTTPS na porta 443 | Clientes LAN/VPN autorizados e Hermes |
| Host MCP no NPM | IP do Hermes, por Access List de IP, além do bearer obrigatório |
| VM Marvin, portas 3000/3001 | IP de origem do NPM; outros clientes não acessam diretamente |
| Painel NPM, normalmente porta 81 | Dispositivos administrativos autorizados pela LAN/VPN |
| PostgreSQL | Serviços autorizados na rede Docker `database`; sem porta publicada no host |

A Access List do host MCP deve usar a origem efetivamente vista pelo NPM. Não acrescente Basic Authentication ao endpoint MCP nem confie em headers de IP arbitrários. Verifique ausência de encaminhamentos WAN, inclusive automáticos, e de permissões IPv6 que contrariem o acesso privado.

Não considere apenas regras UFW dentro da VM como comprovação: portas publicadas pelo Docker podem seguir um caminho diferente do filtrado por essas regras. Use o firewall efetivo da interface no Proxmox e/ou regras compatíveis com o backend de firewall do Docker, sem remover as regras geradas pelo Docker. Referência: [integração de firewall do Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

O proprietário deve confirmar no homelab: Web funciona pela LAN e VPN; Hermes consulta MCP pelo NPM; outro dispositivo não consegue acessar diretamente 3000/3001; o endpoint MCP recusa chamada sem bearer mesmo a partir da origem permitida; e Web/MCP ficam inacessíveis de fora da LAN com VPN desligada. Execute verificações somente contra seus próprios endpoints e registre resultados sem credenciais ou dados financeiros. Nenhuma dessas verificações foi executada a partir deste checkout.

## Verificação e operação diária

Com os binds e portas padrão, verifique no host:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
curl --fail --silent --show-error http://127.0.0.1:3001/healthz
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml ps
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml logs --tail=100 web mcp
```

Adapte as URLs se alterar os binds/portas. O health check web comprova resposta HTTP, não consulta o banco. Pelo endereço HTTPS do proxy, faça login e consulte contas/categorias para verificar autenticação e persistência. Em produção o cookie é `Secure`; o login pelo endereço HTTP local não substitui esse teste. Não crie lançamentos fictícios para validar um banco real.

Configure o Hermes para usar `https://<endereco-privado-mcp>/mcp` com bearer `MCP_HERMES_BEARER_TOKEN`, e teste uma consulta de leitura. O proxy deve preservar `Authorization`, permitir POST/GET/DELETE usados pelo transporte Streamable HTTP e encaminhar streaming sem buffering que interrompa respostas. `http://web:3000/api/` é exclusivo do cliente MCP dentro do Compose, não é o endereço do Hermes. Ver [mcp.md](mcp.md).

Se houver erro, confira `ps`, logs restritos, DNS/TLS do proxy, correspondência de `APP_ORIGIN`, tokens e conexão com DB. Não compartilhe saída de `docker compose config`, `docker inspect` ou logs com credenciais/dados privados. Não use `down -v`: ele remove o volume de dados. Após reiniciar a VM, confira novamente saúde e acesso; containers parados explicitamente podem exigir `up -d`.

## Releases e deploy com imagens publicadas

O Release Please mantém um PR com a próxima versão a partir de Conventional Commits (`feat: adiciona relatório`, `fix: corrige saldo`). No squash merge, use a convenção no título que se tornará commit na `main`. Ao integrar o PR, o mesmo workflow cria a tag e a release e publica as imagens `ghcr.io/gdsantana/marvin-web:vX.Y.Z` e `ghcr.io/gdsantana/marvin-mcp:vX.Y.Z`, para `linux/amd64` e `linux/arm64`. Não existe deploy automático. Uma release só está pronta para instalação quando contém o anexo `marvin-deploy.tar.gz`, publicado depois das duas imagens. Se o build falhar, execute novamente o workflow manualmente com a tag estável no campo `tag`; depois que o anexo existir, o workflow recusa republicar essa versão. O primeiro changelog pode incluir o histórico anterior; revise-o antes de integrar o PR.

O workflow precisa de permissão para criar PRs nas configurações de Actions e de `packages: write`. Com o `GITHUB_TOKEN` padrão, eventos gerados pelo Release Please não iniciam outros workflows; se houver checks obrigatórios no PR de release, configure uma identidade GitHub App ou token apropriado conforme a [documentação do Release Please](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs). A publicação das imagens acontece no próprio workflow, sem depender de outro evento. A visibilidade dos pacotes GHCR deve ser configurada pelo mantenedor: enquanto privados, o host precisa autenticar o Docker com uma credencial autorizada a ler os pacotes; imagens públicas podem ser baixadas anonimamente. O workflow e o acesso ao registry ainda precisam ser validados no GitHub.

### Primeira instalação sem clone

Requer Bash, `ss` do iproute2, `curl`, `tar`, `openssl`, `flock`, `sha256sum`, Docker Compose com suporte a `up --wait` e acesso aos pacotes GHCR. O atualizador também requer GitHub CLI autenticado; releases privadas exigem GitHub CLI autenticado já na instalação. Para pacotes privados, autentique o Docker no GHCR com uma credencial de leitura adequada, usando `docker login ghcr.io`; não coloque tokens nos arquivos de exemplo ou em comandos salvos no histórico. O `gh` também precisa de acesso à release. Consulte as [instruções do GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Para releases públicas, execute o instalador diretamente com `curl | bash` em um terminal interativo. Ele consulta a release estável mais recente, baixa o pacote correspondente e inicia a instalação em `~/marvin`, que deve estar vazio ou ainda não existir:

```bash
curl -fsSL https://github.com/gdsantana/marvin-project/releases/latest/download/install.sh | bash
```

O instalador lê as respostas pelo terminal, separado do pipe. Não é necessário salvar o script manualmente; o pacote da release é baixado e extraído em uma pasta temporária interna, removida ao terminar. A instalação continua interativa e exige configuração.

Esse link de download pode ser divulgado na landing page. Ele aponta para a release marcada como mais recente no GitHub e só estará disponível após o primeiro workflow de publicação concluir. Se a release tiver acabado de ser criada, o pacote de deploy pode ainda não estar disponível; aguarde o workflow terminar. Para escolher uma versão e um diretório, use `curl -fsSL https://github.com/gdsantana/marvin-project/releases/latest/download/install.sh | bash -s -- vX.Y.Z /caminho/vazio`. O download também pode ser fixado a uma release, substituindo `latest/download` por `download/vX.Y.Z` na URL e passando a mesma tag ao instalador.

Enquanto o repositório for privado, a URL pública do `curl` não fornece o script anonimamente. Após autenticar `gh` com acesso à release, use:

```bash
gh release download vX.Y.Z --repo gdsantana/marvin-project --pattern install.sh
bash install.sh vX.Y.Z
```

O instalador tenta baixar o pacote por HTTPS e usa o GitHub CLI autenticado como alternativa para releases privadas. O Compose, o atualizador e os exemplos de configuração são copiados para o diretório de instalação; arquivos ou diretórios existentes não são sobrescritos. Para atualizar depois, mantenha o GitHub CLI disponível e autenticado, conforme explicado abaixo.

O instalador é exclusivo para **ambiente novo**: recusa `.env`, `.env.ops` ou `.marvin` existentes e verifica a existência do volume e dos containers do projeto. Não adota nem limpa bases existentes. Para uma base existente, siga a seção de separação de privilégios e não transfira ownership sem revisão e backup. O instalador precisa de `openssl` e usa a tag incluída no pacote; exige Docker disponível e acesso às imagens.

Informe a origem HTTPS da interface, sem caminho ou barra final, como `https://marvin.example.lan`. O instalador cria `.env` e `.env.ops` com permissões restritas, três senhas PostgreSQL distintas e dois tokens MCP independentes. As roles técnicas são provisionadas com um arquivo temporário restrito, montado somente no job operacional e removido ao terminar; as senhas não são passadas por argumentos. Depois das migrations, escolha interativamente o usuário e a senha de acesso à interface. As categorias iniciais são criadas sem lançamentos fictícios. Os serviços são iniciados aguardando seus health checks.

Ao concluir, o instalador mostra **somente o token bearer que o agente usa para acessar o MCP**. Configure-o no cliente do agente junto do endereço HTTPS privado do servidor MCP, terminado em `/mcp`. Ele também permanece em `MCP_HERMES_BEARER_TOKEN` no `.env`: proteja o terminal, esses arquivos e seus backups. O token `MCP_API_TOKEN` é diferente e serve somente à comunicação MCP → Web; não o forneça ao agente. O instalador usa binds locais por padrão e não configura proxy, DNS, TLS ou firewall: conclua essa configuração privada conforme este guia e valide login, leituras e MCP antes de usar.

Se a instalação falhar, arquivos e recursos já criados são preservados; não execute o instalador novamente nem remova volume ou arquivos sem antes diagnosticar o estado e definir uma recuperação segura. O instalador não agenda backups. Defina destino externo e retenção e teste restauração antes de usar dados reais.

Para instalações por release, os exemplos deste guia que usam `-f infra/compose.yml` devem usar `.marvin/releases/<tag>/compose.yml` e `MARVIN_VERSION` com a mesma tag; não execute os comandos `build`. Os arquivos `.env` e `.env.ops` permanecem no diretório de instalação.

### Atualização de instalação existente

No diretório de instalação, execute:

```bash
./update-homelab.sh vX.Y.Z
```

O script exige uma tag estável explícita, consulta a release no GitHub e só continua se conseguir baixar seu anexo de deploy. Baixa as imagens Web/MCP da mesma tag, verifica que o banco está disponível e pede confirmação. Revise as notas, migrations e compatibilidade antes de confirmar; bloqueie o acesso pelo proxy e Hermes, pois o script não controla esses acessos. Ele para Web/MCP, cria um dump, confere seu catálogo, aplica migrations com a imagem Web e inicia Web e MCP em sequência, aguardando seus health checks. A aplicação de migrations usa `--no-deps`: o script não baixa, reinicia ou atualiza o container PostgreSQL. Atualizar a versão da imagem do banco é uma operação separada; trocar a major requer migração de dados específica.

O dump fica em `/srv/backups/marvin`, ou em `MARVIN_BACKUP_DIR` se definida; mantenha esse diretório fora do volume do banco, com acesso restrito. O script registra a última versão concluída em `.marvin/deployed-version` e usa um lock local. A tag é uma referência de imagem que pode ser alterada no registry; a política do workflow recusa republicar uma versão após anexar o bundle. Para rastreabilidade adicional, registre os digests das imagens implantadas. Depois da atualização, copie o dump e checksum para outro host e teste restaurações periodicamente. O catálogo e os health checks não substituem restore e testes funcionais.

Se alguma etapa falhar, o script para. Falhas de backup ou migration deixam Web/MCP parados; falhas de inicialização podem deixar novos containers em execução. Confira o banco e os serviços antes de intervir. A versão registrada não representa necessariamente o estado após uma falha. Não instale uma versão anterior nem retome imagens antigas sem verificar se são compatíveis com o schema; consulte a seção de restauração. O script instalado não se substitui automaticamente: revise e atualize-o a partir do anexo da nova release quando as notas solicitarem, preservando `.env`, `.env.ops` e `.marvin`.

O fluxo, o proxy e a restauração ainda precisam de ensaio no homelab com dados descartáveis. Não há agendamento ou retenção automática de backups.

## Atualização manual a partir do código-fonte

Registre a revisão atual e escolha a revisão aprovada de destino em um checkout limpo. Revise migrations, contratos e notas de compatibilidade; imagens web/MCP/migrate são construídas do código local, sem tags de release próprias. Não faça upgrade major do PostgreSQL apenas alterando `POSTGRES_IMAGE_TAG`: isso exige um procedimento separado de migração de dados e restauração ensaiada.

Construa as imagens da revisão de destino antes da janela de manutenção. Inclua `migrate` explicitamente, pois tem build próprio e não deve usar uma imagem antiga:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml config --quiet
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml build web mcp migrate provision-roles
```

Pause o acesso pelo proxy e o Hermes; pare os dois processos para interromper também o timer de fechamento de faturas. Faça o backup da seção seguinte **após** a parada e só prossiga se o dump terminar e passar pela inspeção. Guarde também a revisão e uma cópia protegida do `.env` e da configuração do proxy, fora do repositório.

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml stop mcp web
```

Com backup confirmado, mantenha DB disponível, aplique migrations uma única vez e recrie aplicações:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml up -d db
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml run --rm migrate
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml up -d web mcp
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml ps
```

Execute cada etapa apenas se a anterior tiver sucesso. Se a migration falhar, mantenha web/MCP parados e revise o erro; não retome a versão antiga sem conferir o estado do schema. Após sucesso, repita as verificações de login, leitura e MCP antes de liberar o proxy/Hermes. A janela de manutenção abrange backup, migration e verificações.

Não use atualização automática irrestrita. Voltar a uma imagem antiga não desfaz migration aplicada; restauração é um procedimento controlado, que pode descartar gravações posteriores.

## Backup PostgreSQL

Salve o dump fora do volume PostgreSQL e do repositório, em armazenamento com acesso restrito. O exemplo cria dump custom-format em um caminho de backup no host:

```bash
umask 077
mkdir -p /srv/backups/marvin
chmod 700 /srv/backups/marvin
MARVIN_BACKUP="/srv/backups/marvin/marvin-$(date -u +%Y%m%dT%H%M%SZ).dump"
if docker compose --env-file .env --env-file .env.ops -f infra/compose.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$MARVIN_BACKUP.partial"; then
  if docker compose --env-file .env --env-file .env.ops -f infra/compose.yml exec -T db pg_restore --list < "$MARVIN_BACKUP.partial" > /dev/null; then
    mv "$MARVIN_BACKUP.partial" "$MARVIN_BACKUP"
  fi
fi
```

Confirme que o arquivo final existe e não está vazio (`test -s "$MARVIN_BACKUP"`). Qualquer erro interrompe a atualização: um `.partial` não é backup válido. A listagem valida o catálogo do dump, mas somente uma restauração confirma sua recuperabilidade. O usuário do host precisa de permissão em `/srv/backups/marvin`; provisione o diretório antes, se necessário.

```bash
sha256sum "$MARVIN_BACKUP" > "$MARVIN_BACKUP.sha256"
```

Copie o dump e seu checksum para outro destino/host e aplique a política de retenção aprovada. Dumps contêm dados financeiros: não os envie a Git, logs ou serviços sem proteção. O projeto ainda não agenda backups nem define retenção.

## Restauração isolada

Faça primeiro um restore em base nova para validar o arquivo, sem sobrescrever a base em uso. Abaixo, substitua o caminho pelo dump desejado; `marvin_restore` deve ainda não existir:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml exec -T db sh -c 'createdb -U "$POSTGRES_USER" marvin_restore && pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d marvin_restore' < /srv/backups/marvin/arquivo.dump
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d marvin_restore -c "select count(*) from accounts"'
```

A base nova está separada logicamente, mas compartilha o servidor/volume: não execute o ensaio sob carga sem avaliar recursos. Se o restore falhar, não use a base parcial; preserve-a para diagnóstico e repita em outra base nova.

O segundo comando depende da tabela `accounts` existir após a migration incluída no dump. Confirme integridade adicional antes de qualquer recuperação. Compare também contas, saldos, faturas, histórico e integridade com os registros anteriores ao incidente; uma contagem isolada não basta.

Para ativar a recuperação:

1. Bloqueie o proxy/Hermes e execute `docker compose --env-file .env --env-file .env.ops -f infra/compose.yml stop mcp web` antes da troca. Registre quais escritas posteriores ao dump serão perdidas e confirme essa perda antes de prosseguir.
2. Use código/imagens da revisão compatível com o dump. Altere o nome da base nas URLs `DATABASE_URL` de `.env` e `MIGRATION_DATABASE_URL`/`DATABASE_ADMIN_URL` de `.env.ops` para `marvin_restore`, preservando as conexões anteriores em registro protegido. Não altere `POSTGRES_DB`: ele inicializa volumes vazios e não renomeia bases existentes.
3. O restore usa `--no-owner --no-acl`: roles globais não vêm no dump e grants antigos não são reaplicados. Com as URLs apontando explicitamente para a base restaurada, execute o job `provision-roles` com `--adopt-existing`, usando o código compatível, para criar/verificar roles e aplicar ownership/grants da política atual. Não acrescente `--rotate-passwords` se apenas estiver recuperando a base com as mesmas credenciais.
4. Execute `docker compose --env-file .env --env-file .env.ops -f infra/compose.yml up -d --force-recreate web mcp`. Um simples `restart` não aplica variáveis alteradas. Não aplique migrations novas ao dump sem revisar a compatibilidade.
5. Repita as verificações de saúde, login e consultas web/MCP antes de liberar acesso. Preserve a base anterior até concluir a revisão. Se precisar voltar e ainda não houver novas escritas, restaure a URL e a revisão compatível anteriores e recrie os serviços; com novas escritas, planeje reconciliação antes da troca.

Em perda da VM, provisione outra com os mesmos pré-requisitos, recupere a release e imagens compatíveis (ou o checkout e imagens construídas localmente), `.env` e proxy protegidos, e suba somente DB. Copie e confira o checksum do dump, restaure na base nova e siga a ativação acima antes de iniciar aplicações. O dump inclui schema e histórico de migrations, mas não secrets, configuração do host/proxy nem roles globais; o usuário definido pelo Compose deve existir no destino. Este procedimento precisa de ensaio no homelab antes de dados reais.

### Ensaio descartável de recuperação

Para validar migrations, dump/restauração e replay idempotente sem tocar no banco persistente, execute na raiz do repositório:

```bash
bash scripts/validate-recovery.sh
```

O script usa dois clusters temporários PostgreSQL 18.6 em loopback, uma fixture criada pelo domínio e remove apenas seus próprios processos/diretório no encerramento. Requisitos e limites estão em [Validação de backup e restauração](recovery-validation.md). Esse ensaio não substitui o restore periódico do dump real em ambiente isolado.

## Fechamento automático de faturas

O `apps/web` inicia um timer no runtime Node do Next.js. Ele executa catch-up ao iniciar e tenta novamente periodicamente; se o web estiver parado, não há execução até a próxima inicialização. Cada cartão usa seu `billingTimezone`, e ciclos abertos com `closingOn` na data local ou anterior são fechados. Somente cartões configurados como `automatic` participam; o padrão continua `manual`. A rotina não cria lançamentos nem altera faturas encerradas. Detalhes em [ADR 0007](adr/0007-automatic-statement-closing.md).

## Separação de privilégios PostgreSQL

Implementada conforme [ADR 0012](adr/0012-database-runtime-and-migration-roles.md), em continuidade à arquitetura §2/§8 e ao modelo de dados §10.1/§18. PostgreSQL usa roles; uma role com `LOGIN` é um usuário técnico de banco. Elas não alteram sua conta de login na interface e não substituem os bearers HTTP. Referência: [roles PostgreSQL 17](https://www.postgresql.org/docs/17/user-manag.html).

| Identidade | Consumidor | Permissões |
|---|---|---|
| Administração existente | Operador e job temporário `provision-roles` | Criar/verificar roles e transferir ownership explicitamente; nunca recebida pela Web/MCP |
| `marvin_migrator` | Job `migrate` e comandos administrativos de dados | Dono de `public`, `drizzle` quando existir e objetos do Marvin; pode executar DDL nesta base. Sem superusuário, criação de roles/bancos ou associação privilegiada |
| `marvin_app` | Web | `CONNECT`, uso de `public` e grants por tabela/função necessários ao login e finanças. Sem DDL, `TRUNCATE`, concessão de privilégios ou acesso ao histórico de migrations |

`pnpm db:provision-roles` usa `DATABASE_ADMIN_URL`, exige terminal interativo e uma conexão administrativa com superusuário para esse provisionamento inicial. Cria as duas roles fixas, verifica atributos/associações, revoga permissões públicas de conexão/criação temporária da base dedicada e aplica a política da aplicação em transação. Não usa `REASSIGN OWNED` genérico: só transfere os objetos conhecidos do Marvin. A base deve ser dedicada; objetos inesperados em `public`/`drizzle` são recusados para revisão.

O comando `pnpm db:migrate` usa exclusivamente `MIGRATION_DATABASE_URL`, exige a identidade `marvin_migrator` e aplica as migrations pelo migrator Drizzle, preservando os arquivos e journal existentes. `DATABASE_URL` nunca é fallback para migrations. Ao final, reaplica os grants explícitos de runtime em `packages/db/src/database-roles.ts`. Funções futuras não recebem execução por `PUBLIC`; tabelas/sequências futuras não recebem grants automáticos à aplicação. Uma migration que acrescente objetos deve atualizar a política quando runtime precisar deles: acesso novo fica negado até revisão. A sequência serial do journal acompanha o proprietário da tabela.

Histórico financeiro recebe leitura/inclusão conforme o uso atual; não recebe exclusão. Tabelas mutáveis de fatura/configuração/previsões e idempotência recebem os updates necessários. `auth_sessions` e `auth_login_attempts` permitem limpeza/revogação. `auth_users` permite leitura e `UPDATE(id)` somente para o lock da emissão de sessão, não troca de senha/username pelo runtime; locks dos triggers também exigem `UPDATE(id)` em contas/transações. As constraints e triggers financeiros continuam ativos. Referências: [privilégios](https://www.postgresql.org/docs/17/ddl-priv.html) e [privilégios padrão](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

### Transição de uma base existente

Não aplique automaticamente ao banco real. Após backup verificado e com Web/MCP parados, revise os objetos, a identidade administrativa atual e o ambiente alvo. O provisionamento sem flags recusa objetos cujo dono ainda não seja `marvin_migrator`. Para adotar **somente os objetos conhecidos do Marvin**, execute no host de operações:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml --profile ops run --rm provision-roles pnpm db:provision-roles --adopt-existing
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml run --rm migrate
```

A adoção altera ownership/grants, não valores financeiros, senhas da conta Web ou histórico de migrations. A credencial administrativa anterior permanece para manutenção. Depois de alinhar as URLs e verificar a política, recrie Web/MCP e teste login e leituras pelo endereço privado. Não retome uma versão antiga/configuração anterior sem revisar os grants e o estado do schema.

Para rotação técnica, use o mesmo comando com `--rotate-passwords` (e `--adopt-existing` somente se a adoção for necessária), em janela controlada, atualizando as URLs dos consumidores e recriando os processos. Sem a flag, senhas existentes são preservadas mesmo que outras sejam informadas no prompt. Não passe senhas por argumentos; o provisionamento envia verificadores SCRAM ao PostgreSQL e sanitiza os erros do CLI.

No host de desenvolvimento, configure URLs operacionais locais em `.env.ops`, usando `127.0.0.1` e a porta publicada, em vez do host Docker `db`. Owner/bootstrap/seed/clean carregam também `.env.ops`; seed/clean continuam bloqueados em produção e exigem opt-in de desenvolvimento, preferindo a conexão operacional para poder executar a limpeza. Não carregue esse arquivo no processo Web. Criação de roles, grants, migrations e adoção foram exercitados em PostgreSQL descartável; confira as evidências em [verification.md](verification.md). Ainda exigem revisão e janela de operação antes de qualquer alteração no homelab.

## Variáveis

| Variável | Consumidor | Finalidade |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `db` | Inicialização do PostgreSQL |
| `DATABASE_URL` | `web` | Conexão restrita de `marvin_app` |
| `MIGRATION_DATABASE_URL` | `migrate` e CLIs operacionais | Conexão de `marvin_migrator`, somente em `.env.ops` |
| `DATABASE_ADMIN_URL` | `provision-roles` | Conexão administrativa, somente em `.env.ops` |
| `APP_ORIGIN` | `web` | Origem permitida para login e CSRF |
| `APP_ORIGIN` | `web` | Origem confiável configurada para o proxy |
| `MCP_API_TOKEN` | `web`, `mcp` | Autenticação MCP → API web |
| `MCP_HERMES_BEARER_TOKEN` | `mcp` | Autenticação Hermes → MCP |
| `MCP_API_URL` | `mcp` | Base da API HTTP interna |
| `WEB_BIND_ADDRESS`, `WEB_HOST_PORT` | Compose | Bind local da porta web |
| `MCP_BIND_ADDRESS`, `MCP_HOST_PORT` | Compose | Bind local da porta MCP |
| `POSTGRES_IMAGE_TAG` | Compose | Tag da imagem PostgreSQL |

Não passe secrets como argumentos de build. O `.env` é carregado pelo Compose em runtime, não copiado para imagens. Mantenha o arquivo fora do controle de versão e use canal protegido para provisioná-lo no host.

## Limites pendentes

O deploy, proxy, rotação de credenciais, política de retenção e teste periódico de restore não foram validados no homelab. A entrega de secrets por Compose environment também depende da segurança do host; usar Docker secrets/file mounts poderá ser apropriado conforme o ambiente.

## PostgreSQL para desenvolvimento local

Para executar scripts pnpm do host usando o banco Docker existente, execute `pnpm db:up`. Esse comando aplica também `infra/compose.dev.yml`, publica a porta apenas em `127.0.0.1` e mantém o volume. A configuração é exclusiva do desenvolvimento; os comandos de deploy acima continuam usando apenas `infra/compose.yml`.

Configure `DEVELOPMENT_DATABASE_URL` com credenciais literais e host `127.0.0.1`, porta `DEV_DB_HOST_PORT` ou 5432. Seed e limpeza preferem `MIGRATION_DATABASE_URL` local de `.env.ops` quando configurada, com fallback para essa URL de desenvolvimento. Mantenha `DATABASE_URL` no `.env` da raiz com host `db` para o Compose; para executar Next.js no host, configure a URL local como `DATABASE_URL` em `apps/web/.env.local`. Para migrations locais, configure `MIGRATION_DATABASE_URL` local em `.env.ops`. Os arquivos `.env` são excluídos do contexto de build e não são copiados às imagens. Instruções e efeitos da limpeza estão no README; decisão em [ADR 0009](adr/0009-local-development-database.md).

## Conta proprietária e atualização do login

Aplique a migration aditiva `0003_local_auth` antes de iniciar a versão nova. Não altera dados financeiros. Não há migração automática da senha de ambiente: `WEB_PASSWORD_HASH`, `SESSION_SECRET` e cookies antigos deixam de autenticar.

Crie a conta pelo terminal com `pnpm db:provision-owner`, usando `MIGRATION_DATABASE_URL` de `.env.ops`. O helper preserva fallback legado para `DEVELOPMENT_DATABASE_URL` fora de produção e `DATABASE_URL`, mas a conexão restrita de runtime não pode criar/resetar a conta; no deploy separado, use a identidade operacional. Antes de pedir a senha, verifica conexão e tabelas de autenticação. Para executar no host, `pnpm db:up` publica a porta local do PostgreSQL. Username admite 3 a 64 caracteres ASCII, começando por letra ou número e continuando com letras, números, ponto, sublinhado ou hífen; é convertido para minúsculas. Senha tem 12 a 1024 caracteres e confirmação, sem eco no terminal. Comprimento inválido ou confirmação diferente solicita uma nova senha sem encerrar a instalação; use Ctrl+C para cancelar. O comando não substitui uma conta existente. Para recuperação, `pnpm db:provision-owner --reset-password` exige o mesmo username e revoga todas as sessões atomicamente. Não passe senhas por argumentos ou arquivos versionados.

No Compose, use o serviço temporário de operações com terminal interativo:

```bash
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml --profile ops run --rm migrate pnpm db:provision-owner
# Recuperação:
docker compose --env-file .env --env-file .env.ops -f infra/compose.yml --profile ops run --rm migrate pnpm db:provision-owner --reset-password
```

O serviço usa a mesma imagem de ferramentas das migrations. Backups devem incluir `auth_users`, `auth_sessions` e `auth_login_attempts`; proteja-os como credenciais. O seed/clean financeiro preserva essas tabelas. A conta e as sessões persistem também quando o banco é populado com dados fictícios. A revogação no logout depende de PostgreSQL disponível; a UI informa falha e permite tentar novamente. Permanece uma conta proprietária, sem cadastro público nem isolamento financeiro, planejado na issue #9.

### Conexão web no desenvolvimento

Após carregar o ambiente, o Next.js fora de produção substitui `DATABASE_URL` pelo valor de `DEVELOPMENT_DATABASE_URL` somente quando o host original é `db`. Isso evita usar o endereço interno do Compose no processo executado no host. URLs explícitas com outro host, inclusive bancos descartáveis de testes, são preservadas. Produção não aplica essa substituição. O banco local deve estar publicado com `pnpm db:up`.

### Correção de entradas nos prompts operacionais

O instalador repete a pergunta do endereço HTTPS quando o formato é inválido. O provisionamento interativo repete usuário inválido, senha fora dos requisitos ou confirmação diferente; para roles técnicas, também rejeita senhas iguais entre roles. Na atualização, respostas diferentes de `s`, `n` ou Enter repetem a confirmação; `n` e Enter cancelam. Ctrl+C ou encerramento da entrada cancelam a execução. Falhas de banco, Docker ou configuração não são repetidas automaticamente.

O instalador verifica as portas TCP da Web e do MCP no host, incluindo publicações de containers Docker. Por padrão, usa Web 3000 e MCP 3001. Se qualquer uma estiver ocupada, solicita outra porta para a Web, de 1024 a 65534; o MCP usa sempre a porta seguinte, por exemplo Web 4000 e MCP 4001. Entradas inválidas ou conflito em qualquer porta repetem a pergunta. As escolhas são salvas em `WEB_HOST_PORT` e `MCP_HOST_PORT` no `.env`; as portas internas continuam 3000 e 3001. A verificação não reserva as portas: outro processo pode ocupá-las antes da inicialização.

O único instalador é `scripts/install.sh`: ele contém o download do bundle, a configuração HTTPS, a seleção de portas e os prompts de usuário e senha. O workflow publica esse mesmo arquivo como `install.sh` na release, sem gerar outro instalador. O bundle fornece Compose, atualizador, versão e exemplos de configuração; um `install-homelab.sh` legado presente em releases antigas é ignorado. Assim, o instalador obtido da `main` usa seus próprios prompts mesmo ao instalar imagens estáveis anteriores. A versão publicada na release preserva o código da revisão daquela release.

A criação de usuário valida as entradas no instalador e envia as credenciais por stdin ao job operacional sem TTY. A imagem executa a função `provisionOwner`, preservando validação de backend, hash e persistência transacional; senhas não são passadas por argumentos, variáveis de ambiente ou arquivos. Ctrl+C cancela os prompts. Erros operacionais não reiniciam automaticamente a instalação.

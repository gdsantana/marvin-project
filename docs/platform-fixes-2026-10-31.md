# Correções da auditoria — 31/10/2026

Implementação coordenada pelo agente principal com três executores `gpt-6-luna`. O relatório original foi preservado como diagnóstico histórico. A arquitetura de web/API, MCP, domínio e adapter PostgreSQL permanece; não foram adicionadas dependências.

## Entregas por achado

| Auditoria | Correção entregue | Evidência |
|---|---|---|
| 1 — Docker e secrets | Cópias explícitas, exclusões na raiz e nos dois arquivos específicos dos Dockerfiles; credenciais em runtime; conexão local de desenvolvimento documentada | Builds e inspeção de imagens registrados na matriz de verificação |
| 2 — Abertura da conta | Saldo individual/lista/agregado respeitam corte anterior à abertura; resumo omite contas ainda não abertas | Regressão de domínio com cortes temporais |
| 3 — Vencimento no preview | Preparação de compra compartilhada; fatura existente mantém vencimento persistido | Preview e commit sobre fatura com template diferente |
| 4 — Estorno de despesa revertida | Preparação de estorno compartilhada, incluindo elegibilidade, saldo restante, categorias e destino do crédito | Ambos os caminhos recusam a mesma operação |
| 5 — Fechamento exclusivo | Crédito no dia do fechamento segue para próximo ciclo, considerando postagem | Regressão de estorno na fronteira do fechamento |
| 6 — Snapshot do resumo | Uma transação carrega os dados e produz totais e saldos | Teste PostgreSQL confirma escrita concorrente sem misturar estados |
| 7 — BRL | Contratos, serviço e migration incremental aceitam apenas BRL; selector removido; envelopes monetários continuam esparsos | Rejeição de EUR e migration com registros incompatíveis preservados |
| 8 — Faturas | Status efetivo de abertura, quitação, atraso e pagamento parcial; `creditBalanceMinor` informa excedente | Testes de fatura zerada, crédito e pagamento parcial |
| 9 — DRY dos relatórios | Projeção compartilhada para resumo/categorias/série; seis leituras em lote; uma requisição de série na UI | Contadores de carga/transação e reconciliação de valores |
| 10 — Calendário e histórico | Data civil de São Paulo, filtros de período e inclusão opcional de pendências antigas | Testes de virada de ano/UTC e navegação mobile/desktop |
| 11 — Adapter de testes | Corte temporal e rollback, incluindo registros de idempotência, no fake | Suíte de domínio e integrações reais em PostgreSQL |
| 12 — Documentação | Modelo, arquitetura, API, MCP, operação e ADR 0010 atualizados; esta matriz liga diagnóstico a entregas | Resultados atuais centralizados em `verification.md` |

## Simplificações adicionais do plano

- Preview e gravação compartilham preparação por operação, inclusive receita, despesa, transferência, cashback e pagamento. Gravação revalida em transação.
- Criação de conta, categoria e instituição não sobrescreve ID existente. Replay usa o resultado idempotente; nova chave para ID já existente gera conflito.
- Cancelamento usa compensação e preserva histórico. “Mostrar cancelados” recupera original e compensação na listagem. A elegibilidade `canReverse` é calculada pelo backend com o histórico completo.
- Devolução real mantém parcelas e pagamentos; crédito de estorno não duplica despesa e não é distribuído automaticamente entre faturas.
- Tipos de apresentação reutilizam contratos públicos. A interface não implementa elegibilidade financeira própria.
- Testes passam pelo carregador Node/tsx sem depender do socket IPC do CLI tsx; o gate provisiona PostgreSQL local ou Docker descartável.
- Inspeção visual encontrou compressão de valor com descrição longa no celular. A linha reserva espaço ao valor e trunca a descrição; novas capturas confirmaram legibilidade.

## Verificação e operação

Comandos, resultados e limitações datados estão em [verification.md](verification.md). Decisões financeiras estão no [ADR 0010](adr/0010-platform-consistency-and-brl.md), evitando duplicar aqui a fonte normativa.

A migration 0002 foi exercitada somente em bancos descartáveis, incluindo atualização das migrations anteriores. Não foi aplicada ao banco do usuário. Nenhum deploy, commit, push ou worktree foi realizado. Configurações reais de ambiente não foram editadas.

Para operar a versão nova: revisar backup e dados incompatíveis, aplicar migrations explicitamente e iniciar web/MCP com variáveis em runtime conforme [deployment.md](deployment.md). Se houver dados não BRL, a migration recusa a aplicação; sua destinação requer decisão explícita, sem conversão automática.

## Limites mantidos

- Rate limit permanece global e local ao processo, conforme a aplicação privada atual.
- `db:generate` continua exigindo baseline/snapshots revisados; migrations existentes não foram reescritas.
- Os relatórios ainda carregam o histórico em lote na memória. A quantidade de consultas deixou de crescer por lançamento; particionamento/agregação adicional deve ser motivado por medição.
- O driver pg 8 emite aviso de depreciação para consultas simultâneas no mesmo client; testes passam. Adoção futura de pg 9 exige revisar esses pontos.
- O primeiro build Docker parcial revelou `.env.local` antes da correção dos arquivos de exclusão específicos. Não houve leitura ou impressão de seu conteúdo. O build foi cancelado; cache intermediário local pode conter o arquivo. Não houve prune global porque não foi possível isolar com segurança os registros dessa execução.
- Recuperação de backup no homelab, auditoria de dependências e validação com leitor de tela/dispositivo físico não foram executadas nesta entrega.

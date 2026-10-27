# ADR 0007 — Invocação do fechamento automático de faturas

- Data: 2026-10-25
- Status: implementado no checkout; operação no homelab pendente

## Contexto

O ADR 0004 define fechamento manual como padrão e permite escolher fechamento automático por cartão. Essa escolha não pode reescrever faturas/ciclos anteriores. O método de domínio existente recebe uma data de corte única, insuficiente para cartões com fusos diferentes; também faltava um invocador operacional.

## Decisão

- O modo permanece `manual` por padrão. Somente cartões cujo `billingMode` persistido é `automatic` participam do fechamento agendado.
- O processo Node.js do `apps/web` inicializa um timer leve por instância via `src/instrumentation.ts`. A rotina executa catch-up na inicialização e repete a cada 60 segundos, sem serviço permanente adicional. A instrumentação ignora o runtime Edge e a fase de build; o timer não mantém o processo vivo (`unref`).
- O domínio calcula a data civil atual no `billingTimezone` de cada cartão. Em cada execução, fecha faturas abertas com `closingOn` menor ou igual a essa data, inclusive ciclos atrasados. A alteração não cria lançamento, dívida ou pagamento e não altera faturas já fechadas.
- O fechamento é atômico e seguro com execuções repetidas ou múltiplas instâncias; falhas transitórias são tentadas novamente no próximo intervalo. O processo usa uma guarda local para evitar sobreposição do próprio timer, e a persistência/domínio é responsável pela concorrência entre instâncias.
- Logs registram somente estado agregado da execução (sucesso/erro e quantidade fechada); não incluem valores, payloads financeiros, detalhes de exceções ou mensagens do banco.
- A configuração persistida do cartão controla ativação. O job não introduz uma variável de ambiente de produto.

## Consequências

Cartões configurados como automáticos passam a fechar ciclos após o fechamento local, com atraso limitado pelo intervalo e pela disponibilidade do serviço. Após indisponibilidade, a próxima execução processa o backlog persistido. O modo manual e a alteração de configuração continuam sem reescrever o passado.

O timer roda em cada réplica web. Segurança entre réplicas depende da operação atômica/idempotente do domínio e das garantias de concorrência do repositório. Como o timer é processo-local, a execução não ocorre quando não há processo web ativo; o catch-up na inicialização compensa a pausa.

## Referência operacional

Next.js 15 reconhece `instrumentation.ts` na raiz do projeto ou em `src/` e chama `register` quando uma instância do servidor inicia. O código runtime é importado condicionalmente para Node.js. Referência: [Instrumentation no Next.js 15](https://nextjs.org/docs/15/app/guides/instrumentation).

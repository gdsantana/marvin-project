# ADR 0010 — Centralizar regras temporais e restringir a plataforma a BRL

- Data: 2026-10-31
- Status: aceito; implementação no checkout, aplicação em banco persistente pendente

## Contexto

A auditoria identificou diferenças entre preview e gravação, inclusão de saldo inicial em cortes anteriores à abertura e leituras de resumo em snapshots separados. O produto pessoal passa a suportar apenas reais. O mantenedor escolheu preservar histórico no cancelamento de lançamentos.

## Decisão

- Contratos, domínio e banco aceitam apenas BRL. Valores permanecem inteiros em centavos. A migration incremental 0002 recusa dados não BRL antes de instalar constraints; nunca converte ou apaga valores automaticamente.
- Cancelar um lançamento elegível usa a reversão compensatória existente, com motivo, autoria e idempotência. Original e compensação ficam ocultos por padrão na UI e acessíveis em “Mostrar cancelados”. Não há exclusão física. Pagamentos de fatura e compras no cartão continuam fora desse cancelamento.
- Devolução real usa estorno vinculado. No cartão, o crédito reduz o passivo e a categoria original, preservando parcelas e pagamentos anteriores. Não existe transferência automática de crédito entre faturas.
- Saldo inicial só vigora a partir da abertura. Cortes anteriores retornam zero; agregados omitem contas ainda não abertas.
- Preparação financeira é compartilhada entre preview e gravação; a gravação prepara novamente dentro da transação. Datas persistidas de faturas prevalecem sobre templates atuais. O fechamento é exclusivo para compras e estornos, usando postagem quando disponível.
- A leitura deriva a situação da fatura de fechamento, cobrança, pagamentos e data civil do cartão. Fatura fechada sem valor positivo a pagar é quitada; excedente é exposto como `creditBalanceMinor`. Não reescrever histórico para atualizar apenas a apresentação.
- Relatórios usam uma projeção de operações efetivas e seis leituras em lote na mesma transação. Série mensal é calculada em uma chamada, mantendo envelopes por moeda para compatibilidade, mas permitindo apenas a chave BRL.
- A data civil geral da UI é America/Sao_Paulo. Consultas com `includePending` recuperam pendências fora do período selecionado. O backend determina elegibilidade de cancelamento com o histórico completo.
- Criação de contas, categorias e instituições é insert-only. Reutilização de ID fora de replay é conflito.
- Credenciais são fornecidas em runtime. O contexto Docker exclui arquivos privados; configurações locais não são incorporadas às imagens.

## Consequências

A arquitetura de monólito modular e a porta de persistência permanecem. Não são introduzidos serviços, frameworks ou câmbio. Consumidores que enviavam outras moedas devem migrar explicitamente; dados incompatíveis bloqueiam a migration, sem mudança silenciosa.

O estado persistido da fatura controla fechamento, enquanto o detalhe apresenta a situação efetiva. A API mantém rotas existentes e acrescenta série mensal, inclusão opcional de pendências e campos derivados. A UI não decide regras financeiras.

## Verificação e revisão da decisão

Evidências atuais e limites operacionais estão em [verification.md](../verification.md). Rever BRL-only somente mediante necessidade explícita de outra moeda e definição de escala; rever consulta integral do histórico quando medições justificarem paginação/limites adicionais no adapter de relatórios.

Relacionado: ADRs 0004, 0005, 0006 e 0007; [auditoria inicial](../platform-audit-2026-10-31.md).

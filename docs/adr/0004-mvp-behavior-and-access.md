# ADR 0004 — Comportamento financeiro e acesso do MVP

- Data: 2026-10-25
- Status: aceito; implementação pendente.

## Contexto

As decisões abertas do modelo precisam de regras explícitas antes da implementação. A aplicação é pessoal, com acesso pela rede local e hospedagem em VM no Proxmox.

## Decisão

- Compras no dia de fechamento entram no próximo ciclo de fatura.
- Cada cartão oferece fechamento manual (padrão) e automático, com configuração alterável a qualquer momento. Alterar o modo não reescreve ciclos ou faturas encerradas. Agendamento e ativação com ciclos vencidos serão detalhados na implementação.
- Estornos geram crédito imediato vinculado à compra e à categoria original; parcelas futuras permanecem, sem crédito duplicado.
- Limite disponível parte do limite configurado e desconta a dívida comprometida, incluindo parcelas futuras ainda não quitadas.
- Orçamentos, metas e competência orçamentária ficam fora do escopo inicial. Categorias classificam o total da operação original, sem alocação por parcela.
- Cada conta tem uma moeda-base. Relatórios ficam separados por moeda; câmbio não faz parte do escopo atual.
- Previsões aparecem como débitos projetados nos próximos meses, sem movimentação efetiva de conta. A realização deve conciliar a previsão para evitar duplicação.
- Web terá login com uma senha local e sessão, sem cadastro multiusuário ou autenticação complexa. Guardar hash da senha e usar cookie de sessão protegido; não registrar senha em logs.
- MCP terá autenticação diferente da web. Transporte e detalhes serão decididos na implementação; sugestão inicial de HTTP com streaming e bearer token próprio, sujeita à compatibilidade com Hermes.
- Docker Compose rodará em uma VM no Proxmox. Imagens e assets da aplicação ficarão no projeto web e serão servidos por ele.

## Consequências e pendências

O fechamento operacional não prolonga o período de compras de uma fatura. Projeções e saldo efetivo devem ser distinguíveis na UI e nos contratos; previsões não criam `account_entries`. O limite do cartão não é ativo patrimonial.

Correções de histórico, calendário de meses curtos, estrutura de recorrências e detalhes operacionais ainda precisam de definição. Investimentos continuam fora do MVP. Este ADR documenta decisões e não cria schema, migrations, endpoints, jobs ou funcionalidades.

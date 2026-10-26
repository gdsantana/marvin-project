# ADR 0001 — Separar caixa, posições e avaliações de investimentos

- Data: 2026-10-25
- Status: aceito para planejamento; implementação futura, fora do MVP/bootstrap.

## Contexto

O modelo atual deriva saldos monetários de `accounts` e `account_entries`. Tratar compras de ativos como despesas, resgates integrais como receitas ou o valor da carteira como caixa disponível distorceria orçamento e patrimônio.

## Decisão

Preservar o livro monetário existente. A conta `investment` representará caixa disponível; lotes e operações representarão posições e custo de aquisição; avaliações históricas representarão valor patrimonial sem movimentar dinheiro. Instituições agrupam contas; ativos são instrumentos, com classificação independente de categorias financeiras. Condições de renda fixa variáveis pertencem ao lote/aplicação.

Aportes reutilizarão transferências próprias. Compras transformarão caixa em posição. Saídas liberarão custo e separarão principal, resultado, taxas e impostos. Operações e consumo de lotes terão vínculos auditáveis com transações e caixa, atomicidade, idempotência e controle de concorrência. O patrimônio incluirá caixa e posições uma vez, mais passivos assinados, com FX explícito para consolidação.

A extensão seguirá as fronteiras existentes: contratos públicos, domínio financeiro e portas, persistência no DB, composição/API no web e MCP como adaptador HTTP autenticado. Não haverá acesso direto ao PostgreSQL pelo MCP nem cálculo financeiro no agente.

## Alternativas consideradas

- Guardar todo o patrimônio no saldo da corretora: confunde liquidez e posição, e facilita dupla contagem.
- Tratar aplicações/resgates como despesa/receita integral: infla fluxos econômicos e perde o custo do principal.
- Usar avaliações para alterar caixa: transforma valorização não realizada em recebimento fictício.

## Consequências e limites

Será necessário conciliar caixa, custo e avaliação na mesma data, preservar alocações entre operações e lotes e estender os contratos de transação antes de implementar. Não há garantia de schema final sem ajustes: o objetivo é extensão compatível, com migrations futuras revisadas, preservando histórico e sem reformular as fronteiras atuais.

Método de custo, valorização, reconhecimento de rendimentos, eventos corporativos, taxas/impostos e liquidação permanecem abertos em [docs/data-model.md §17](../data-model.md#17-investimentos--proposta-futura). Nenhuma dependência, migration, endpoint, ferramenta MCP ou interface é criada por esta decisão.

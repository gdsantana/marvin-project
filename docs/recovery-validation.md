# Validação de backup e restauração PostgreSQL

`scripts/validate-recovery.sh` executa um ensaio local e descartável de backup/restore. Ele inicializa dois clusters PostgreSQL temporários (origem e destino), cria a base apenas na origem, aplica as migrations versionadas, grava uma fixture pelo `FinanceService`, exporta com `pg_dump`, restaura na base destino e valida igualdade de estrutura, constraints, saldos e replay idempotente. Nenhum banco persistente, volume Compose ou dado do usuário é acessado.

## Pré-requisitos

- Node.js e pnpm instalados conforme o README.
- PostgreSQL 18.6 compatível com o runtime user-space em `/tmp/marvin-pg-runtime/usr/bin` (ou `PG_BIN_DIR` apontando para `initdb`, `pg_ctl` e `postgres`, com `pg_dump`, `pg_restore`, `createdb` e `psql` 18.6 no `PATH`; `PG_LIB_DIR` seleciona o diretório de bibliotecas do runtime quando necessário).
- Acesso de escrita ao diretório temporário do sistema e às dependências do workspace já instaladas.

## Execução

Na raiz do repositório:

```bash
bash scripts/validate-recovery.sh
```

O script não solicita nem imprime credenciais. Os clusters usam autenticação `trust` somente em sockets/portas loopback temporários, não publicam portas externamente, e os dumps ficam dentro do diretório temporário privado do ensaio. Saída inclui apenas fases e resultados agregados. Ao terminar ou falhar, o cleanup para somente os processos dos clusters criados pelo próprio ensaio e remove apenas seu diretório temporário e fixture temporária.

Uma aprovação confirma o caminho de migration, dump e restore neste ambiente de teste; não substitui ensaio com o volume real nem validações de proxy, retenção ou recuperação do homelab.

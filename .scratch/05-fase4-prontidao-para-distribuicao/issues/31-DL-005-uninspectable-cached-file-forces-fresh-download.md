# DL-005: Arquivo em cache que não dá para inspecionar é tratado como válido
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum

- Primary files:
  - `electron/services/download.service.ts` (só `checkAndClearCorruptFile` dentro de `downloadFile`, `:70-86`)
  - New: `tests/unit/audit-download-inspect.test.ts`

Passo 4 da ordem recomendada de `docs/audits/2026-09-09-40a0d01.md`. Ficou fora
do handoff de 2026-09-11; cortado no mesmo dia. Está no `downloadFile` **vivo**
do fallback Playwright, não no lote morto do `CLEAN-003`.

#### What to build

`checkAndClearCorruptFile` lê a cabeça do arquivo já em disco para decidir se
reaproveita. Se a leitura ou a validação lançam (`EACCES`, arquivo travado,
`EIO`), o `catch` só loga e a função cai em `return true`: o download é dado
como concluído com um arquivo que ninguém conseguiu ler. Falha ao inspecionar
deve forçar download novo.

#### Acceptance criteria

1. Com `readHeadSync` lançando para o caminho existente, `checkAndClearCorruptFile`
   devolve `false` e o `downloadFile` segue para baixar de novo em vez de
   devolver o caminho antigo.
2. Comportamento com arquivo legível continua: cabeça válida reaproveita,
   cabeça inválida apaga e baixa.

#### Verification

    npx vitest run tests/unit/audit-download-inspect.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `checkAndClearCorruptFile` é uma closure dentro de `downloadFile`. Se não
  houver seam para testar sem Playwright, extraí-la como função de módulo
  exportada é a menor mudança que abre o seam, e fica dentro do Primary file.
  Teste chama a função de produção com `fs` real em pasta temporária e um
  arquivo sem permissão de leitura, ou com `readHeadSync` mockado lançando.

## Comments

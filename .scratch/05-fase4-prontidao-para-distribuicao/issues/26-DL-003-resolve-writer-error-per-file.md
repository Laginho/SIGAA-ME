# DL-003: `reject` no erro de escrita derruba o lote inteiro
Status: open
Stage: implementing
Priority: P1
Blocked by: nenhum

- Primary files:
  - `electron/services/http-scraper.service.ts` (só o `writer.on('error')` de `downloadFile`, `:956`)
  - New: `tests/integration/audit-download-disk.test.ts` (só o caso `resolves a writer error`)

Achado Broken #1 da auditoria `docs/audits/2026-09-09-40a0d01.md`, primeiro da
ordem recomendada. Estado confirmado no master em 2026-09-11.

#### What to build

Um erro de disco ao gravar um arquivo (pasta sumiu, `ENOSPC`, `EPERM`) vira
uma falha **daquele arquivo** no relatório do lote, com a mensagem legível. Os
outros arquivos do lote continuam. Hoje `writer.on('error')` faz
`reject({ success: false, error })` enquanto os handlers irmãos fazem
`resolve(...)`: a Promise rejeita com um objeto simples, o `downloadAllFiles`
aborta e o usuário vê `[object Object]`.

#### Acceptance criteria

1. `HttpScraperService.downloadFile` com a pasta de destino removida antes do
   stream resolve (não rejeita) com `{ success: false, error }` e `error`
   contém o código do erro de disco (`ENOENT`).
2. O parcial `.part` é descartado (comportamento já existente de
   `descartarParcial`, não regredir).

#### Verification

    npx vitest run tests/integration/audit-download-disk.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Colher de `codex/fix-audit-2026-09-09`: `git checkout 6aeb67c --
  tests/integration/audit-download-disk.test.ts`. Manter **só** o `it('resolves
  a writer error with a readable per-file failure')`; o `it.each` de colisão
  é do `DL-004` e sai deste commit (entra lá). Vermelho: hoje o
  `await expect(...).resolves` falha porque a Promise rejeita.
- O vermelho foi provado contra `40a0d01`; reprovar contra o master de hoje
  antes de commitar. Se passar sem mudança, o achado morreu e o ticket fecha
  sem código.

## Comments

- Fix esperado: uma linha, `reject` → `resolve`. Não amplie.

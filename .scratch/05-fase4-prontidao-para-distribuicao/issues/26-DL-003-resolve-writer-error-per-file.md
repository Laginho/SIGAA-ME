# DL-003: `reject` no erro de escrita derruba o lote inteiro
Status: resolved
Stage: done
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
- Fix esperado confirmado na revisão: o diff de produção é uma linha só.

#### Resolution (2026-09-11)

**Decisão:** aprovado. Critério 1 fechado; critério 2 aceito com ressalva.

**Arquivos:** `electron/services/http-scraper.service.ts` (`writer.on('error')`,
`:958`, e o `new Promise((resolve))` em `:929` que perdeu o parâmetro `reject`);
`tests/integration/audit-download-disk.test.ts` (novo).

**Vermelho-verde.** Reprovado contra o código do master de hoje, como o ticket
pedia, e não só contra `40a0d01`:

    AssertionError: promise rejected "{ success: false, …(1) }" instead of resolving
     ❯ tests/integration/audit-download-disk.test.ts:88

Com a correção, verde. O achado não tinha morrido.

**Critério 1, traçado até a ponta.** Antes: o `reject` de um objeto simples
saía do `await this.httpScraper.downloadFile(...)` como throw, passava por fora
do `if/else` por arquivo no laço de `_downloadAllFilesInternal`
(`sigaa.service.ts:464`), caía no `catch` externo e chegava em `errorMessage()`
(`shared/errors.ts:104`), que faz `String(error)` em valor que não é `Error` —
daí o `[object Object]`, e o lote inteiro morria no primeiro erro de disco.
Depois: resolve normal, o `else` do laço roda (`failed++`,
`results.push({ status: 'failed' })`), o laço segue para o próximo arquivo e
nenhum texto cru de erro chega ao chamador.

**Critério 2, a ressalva.** O `.part` não regrediu — o diff não toca
`descartarParcial` nem a chamada dela, e o `resolve` acontece depois do `await`.
Mas o teste novo não prova isso: ele apaga a pasta de destino inteira, então o
`createWriteStream` falha no `open()`, o `.part` nunca existe e o `unlink` de
`descartarParcial` erra em silêncio dentro do próprio `try/catch`. Nenhum outro
teste da suíte cobre o descarte do parcial nesse ramo. Registrado como comentário
no `DL-004`, que já edita este arquivo de teste. Não reabre o `DL-003`: o ticket
nunca pediu esse teste.

**Achados corrigidos nesta revisão** (dentro dos Primary files, sem teste novo):
comentário órfão `/** PDF válido mínimo ... */` e helper morto
`arquivosNoDestino`, os dois sobra do corte do caso de colisão do `DL-004`, mais
o `readdirSync` que ficou importado sem uso.

**Achados encaminhados:** `CLEAN-005` (retorno de `downloadFile` com campos
opcionais em vez de união discriminada, regra 6; quatro checagens duplas em
`sigaa.service.ts`) e `QA-008` (`tests/unit/sync-selection.test.ts` falha por
corrida — apareceu numa rodada do gate aqui, passou na seguinte).

**Gate:**

    ✖ 62 problems (0 errors, 62 warnings)   # no-explicit-any pré-existentes
    Test Files  52 passed (52)
    Tests  636 passed | 4 skipped (640)

Números acima são de antes de trazer o `master` para a branch. Depois do merge
do `CLEAN-004`, com o gate rodado de novo antes de fechar: 0 erros de lint,
53 arquivos, 637 passed | 4 skipped (641).

Mérito direto no `master` a pedido do autor, em vez do PR que o loop pede
quando a etapa 3 mexe em código — o que ela mexeu foram três linhas mortas num
arquivo de teste.

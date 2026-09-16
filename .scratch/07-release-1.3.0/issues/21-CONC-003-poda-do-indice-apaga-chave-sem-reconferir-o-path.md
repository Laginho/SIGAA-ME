# CONC-003: A poda do índice de downloads apaga por chave sem reconferir o `path`
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/course-detail.ts` (`:243`, `:269-273`)
  - `tests/unit/course-detail.test.ts`

Achado da revisão do `CONC-002` (2026-09-15), registrado no verdict "Needs your
call" daquele ticket e confirmado pelo autor em 2026-09-16. O `CONC-002` fechou
a janela de read-modify-write para chave **acrescentada** durante o `await`; a
mesma janela continua aberta para chave que **já existia**.

#### What to build

A poda colhe `staleKeys: string[]` durante o laço, espera
`checkFilesExistence`, relê `readAccountItem('downloads')` e apaga essas chaves
da cópia fresca. O `delete` não confere que `freshCourseDownloads[key].path`
ainda é o caminho que o `checkFilesExistence` reportou como ausente.

Se o mesmo `fileId` for baixado de novo durante o `await`, o registro novo e
válido é apagado junto. Efeito visível: o arquivo está no disco e a UI mostra
como não baixado; um novo download conserta. Baixo impacto, janela estreita,
mas é perda de dado real e o conserto é de uma linha.

#### Acceptance criteria

1. Antes do `delete`, a poda compara `freshCourseDownloads[key].path` com o
   `path` que foi passado ao `checkFilesExistence` para aquela chave. Se forem
   diferentes, a chave não é apagada — o registro é mais novo que a checagem.
2. Nenhuma outra mudança de comportamento na poda: chave ausente do índice
   fresco continua sendo ignorada, e chave cujo `path` bate continua sendo
   apagada.
3. `account-storage.ts` não é tocado — o `CONC-002` já decidiu que a poda é o
   único `writeAccountItem('downloads', ...)` cru que sobra, e ele relê.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/course-detail.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/course-detail.test.ts`: índice com `fileId` X apontando para
  `/a/x.pdf`; `checkFilesExistence` reporta `/a/x.pdf` ausente; durante o
  `await`, outro contexto grava X apontando para `/b/x.pdf`. Depois da poda, X
  continua no índice com `/b/x.pdf`. Vermelho porque hoje X é apagado.

## Comments

- Cosmético, sem ação (herdado do `CONC-002`): `freshDownloads[courseId] =
  freshCourseDownloads` (`:272`) cria um `{}` vazio para a disciplina se outro
  contexto tiver limpado o índice durante a espera.
- Também herdado do `CONC-002` e **fora deste ticket**: `course-detail.ts` abre
  a forma crua do índice `downloads` em três lugares (`:243`, `:269-273`,
  `:458`) enquanto `account-storage.ts` é dono do formato. Um
  `forgetDownloads(courseId, fileIds)` irmão do `recordDownloads` recolheria
  isso. São dois call sites, então não é abstração para um caso — mas é
  `CLEAN-*` próprio, não retrofit aqui.

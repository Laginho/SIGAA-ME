# CONC-003: A poda do índice de downloads apaga por chave sem reconferir o `path`
Status: resolved
Stage: done
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

#### Resolution (2026-09-16)

Verdict: Approve

Implementação: `course-detail.ts` colhe `staleKeyPaths: Map<string, string>` junto
com `staleKeys` durante o laço e, na releitura, só apaga quando
`freshCourseDownloads[key]?.path === staleKeyPaths.get(key)`.

Critérios:

1. ✅ O `path` comparado é `res.path`, e o handler
   `check-files-existence` (`electron/ipc/register-handlers.ts:231`) devolve
   `path: filePath` verbatim — o valor comparado é exatamente o que foi enviado
   ao `checkFilesExistence`, não uma versão normalizada.
2. ✅ Chave ausente do índice fresco: `?.path` é `undefined`, nunca igual a uma
   string, então não é apagada — mesmo efeito líquido do `delete` num campo
   inexistente. Chave com `path` igual continua sendo apagada (os testes do
   `CONC-002` cobrem os dois e continuam verdes).
3. ✅ `account-storage.ts` não foi tocado — `diff --stat` do branch lista só
   `course-detail.ts`, `course-detail.test.ts` e este ticket.
4. ✅ Gate verde.

Commits: `1f1f1c2` (teste, vermelho) e `2ae01c0` (correção). O `diff --stat`
confirma a separação: o commit de teste não toca `src/`, o de código não toca
`tests/`.

Prova red-green — com `src/pages/course-detail.ts` revertido para `1f1f1c2`:

    FAIL tests/unit/course-detail.test.ts > ... (CONC-003) >
      mesmo fileId regravado com novo path durante o await sobrevive à poda
    AssertionError: expected undefined to deeply equal { path: '/b/x.pdf', downloadedAt: 1 }
    Tests  1 failed | 7 passed (8)

Vermelho pelo motivo certo: o registro novo foi apagado. Com a correção,
`npm run quality`:

    eslint: 0 errors, 40 warnings (no-explicit-any, pré-existentes)
    Test Files  72 passed (72)
    Tests  791 passed | 5 skipped (796)

Ressalva, sem ação: a cópia em memória `courseDownloads` (`:260`) continua tendo
a chave apagada incondicionalmente, então **este** render ainda pinta o arquivo
como não baixado. O índice persistido agora sobrevive e o próximo render mostra
baixado — a perda de dado, que é o que o ticket ataca, está fechada. Mudar o
render seria mudança de comportamento que o critério 2 proíbe.

Observação de estilo, sem ação: `staleKeys` e `staleKeyPaths` são duas coleções
com a mesma chave que precisam ficar em sincronia; um `Array<[string, string]>`
faria o mesmo. Dez linhas, legível, e trocar seria refatoração fora do pedido.

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

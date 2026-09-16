# CONC-002: Índice de downloads sem read-modify-write cruzado
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/course-detail.ts` (poda por existência `:243-268`; download único `:377-392`)
  - `src/data/account-storage.ts` (`recordDownloads`, `:116-127`; reutilizar, não duplicar)
  - `tests/unit/course-detail.test.ts`

Item 4 do gabarito. Opus e Astra, independentes.

#### What to build

No download único, o índice `downloads` é lido antes do `await` do IPC e
gravado depois; dois downloads concorrentes (dois cliques, um lento) gravam
cada um a sua cópia do índice e o segundo apaga o registro do primeiro. A poda
por existência tem a mesma janela: lê, `await checkFilesExistence`, grava. O
`recordDownloads` do `dashboard.ts:70` é síncrono e não participa; a
verificação refutou essa parte do achado.

#### Acceptance criteria

1. Dois `downloadFile` cujos IPCs resolvem intercalados deixam os dois
   registros no índice.
2. A poda relê o índice depois do `await` e antes de gravar; um registro
   acrescentado durante a espera é preservado.
3. O download único grava pelo `recordDownloads` de `account-storage.ts`
   (que já relê dentro), sem segunda cópia da lógica de escrita.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/course-detail.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/course-detail.test.ts`: dois cliques de download com
  `window.api.downloadFile` controlado por promessas manuais; resolve o
  segundo antes do primeiro; o índice tem os dois `fileId`. Vermelho porque o
  primeiro a resolver por último sobrescreve.
- Poda: durante o `await checkFilesExistence`, gravar um registro novo no
  índice; depois da poda ele continua lá. Vermelho porque a poda grava a cópia
  antiga.

#### Resolution (2026-09-15)

Verdict: Needs your call: o critério 2 fica cumprido para registro de chave
nova, mas a poda apaga por chave sem reconferir o `path`, então um re-download
da *mesma* chave durante a espera é apagado. Ver a observação abaixo e decida
se vira ticket.

Decisão: o download único parou de manter a cópia própria do índice e passou a
gravar pelo `recordDownloads` de `account-storage.ts`, que relê dentro — some a
segunda cópia da lógica de escrita (critério 3) e some a janela entre o read e
o `await window.api.downloadFile` (critério 1). A poda trocou o booleano
`changed` por `staleKeys: string[]`, colhidos durante o laço, e relê
`readAccountItem('downloads')` depois do `await checkFilesExistence` para
apagar só essas chaves da cópia fresca (critério 2). `account-storage.ts` não
foi tocado, como o Primary file pedia ("reutilizar, não duplicar").

Cobertura conferida subindo a cadeia, não pela prosa do ticket: os três pontos
que gravam `downloads` no renderer são `course-detail.ts:397` (download único,
agora `recordDownloads`), `course-detail.ts:481` ("Baixar todos", já era
`recordDownloads`) e `dashboard.ts:76` (background, já era). O único
`writeAccountItem('downloads', ...)` cru que sobra é o da poda, que agora relê.
O `known` de `downloadAllFiles` (`course-detail.ts:458`) também lê antes do
`await`, mas só para não rebaixar — não grava, e foi deixado em paz.

Arquivos: `src/pages/course-detail.ts` (+13/-13),
`tests/unit/course-detail.test.ts` (+99/-1). Nada fora dos Primary files.

Vermelho, no commit só de testes (4e607e5, com o código ainda antigo):

    npx vitest run tests/unit/course-detail.test.ts
    Test Files  1 failed (1)
         Tests  2 failed | 5 passed (7)
    - dois downloadFile fora de ordem → expected ['20'] to deep equal ['20','21']
    - poda relê o índice → expected undefined to be defined

Verde, gate completo em b3844e6:

    npm run quality
    eslint: 0 errors, 52 warnings (no-explicit-any, pré-existentes)
    Test Files  66 passed (66)
         Tests  752 passed | 5 skipped (757)

Critérios 1 a 4: ✓.

Observação, fora dos critérios e sem teste: a poda apaga `freshCourseDownloads[key]`
sem conferir que `freshCourseDownloads[key].path` ainda é o caminho que o
`checkFilesExistence` achou faltando (`course-detail.ts:271`). Se o mesmo
`fileId` for rebaixado durante o `await`, o registro novo e válido morre. É a
mesma janela do critério 2 para uma chave que já existia, em vez de uma
acrescentada — por isso o verdict é "Needs your call" e não "Approve".
Comparar o `path` antes do `delete` fecha; precisa de teste novo, então não
entrou aqui.

## Comments

- Isto é `localStorage` síncrono num só renderer; a janela é só o `await`. Não
  precisa de lock, precisa de reler depois de esperar.
- Candidato a `CLEAN-*` (revisão, 2026-09-15): `course-detail.ts` abre a forma
  crua do índice `downloads` em três lugares (`:243`, `:269-273`, `:458`),
  enquanto `account-storage.ts` é dono do formato. Um `forgetDownloads(courseId,
  fileIds)` irmão do `recordDownloads` recolheria o read-parse-mutate-write da
  poda para o módulo que já tem a lógica. Dois call sites, não é abstração para
  um caso.
- Cosmético, sem ação: `freshDownloads[courseId] = freshCourseDownloads`
  (`:272`) cria um `{}` vazio para a disciplina se outro contexto tiver limpado
  o índice durante a espera.

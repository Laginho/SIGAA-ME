# SEC-004: Material `link` nunca entra no pipeline de download
Status: resolved
Stage: done
Priority: P0
Blocked by: nenhum
Review: human

- Primary files:
  - `electron/services/background-sync.service.ts` (bloco de auto-download, `:234-239`)
  - `electron/services/sigaa.service.ts` (`_downloadAllFilesInternal`: fila `:393-405`, entrada na turma `:410-438`, ramo "not found on course page" `:482-488`, laço de último recurso `:588-606`)
  - `electron/services/download.service.ts` (`downloadFile`: ramo `href` do `freshAction`, `:136-140`)
  - `tests/integration/audit-background-sync-downloads.test.ts`
  - `tests/unit/sigaa-service.test.ts`
  - New: `tests/unit/audit-download-external-url.test.ts`

Itens 7 e 15 do gabarito (`docs/audits/release-1.3.0/README.md`); detalhe em
`docs/audits/release-1.3.0/2026-09-15-d5bb393-merged.md`. Bloqueador de release.

#### What to build

Com `autoDownloadUpdates` ligado (padrão), um material novo do tipo `link`
numa turma não pode abrir um Chrome visível. Hoje `diff.newFiles` vai inteiro a
`downloadAllFiles`; o link não tem script e vira `failed`; o retry HTTP pula por
falta de script; o laço de último recurso chama `downloadViaPlaywright`, que
abre o navegador com `headless: false`, navega pela turma, não acha a linha e
lança `Link not found and no script provided in fallback` depois do overhead
todo. O caminho manual já filtra (`course-detail.ts:462`); o background não.

**Correção (revisão do PR #32):** a versão original deste parágrafo dizia que o
fallback fazia `page.goto(href)` na URL externa que o professor colou. Não faz —
o ramo `href` do `freshAction` é inalcançável (`download.service.ts:90` exige um
`onclick` casando por id antes de olhar o `href`, e linha de `link` não tem
`onclick`), e o outro `page.goto` do fallback (`else if (fileUrl && ...)`)
recebe sempre `fileUrl: ''` de `downloadViaPlaywright`
(`sigaa.service.ts:204`). O dano real é o browser visível, a navegação na turma
e a espera. O P0 continua de pé pelo comportamento em background; só o pior caso
estava descrito errado. O critério 4 vira defesa em profundidade: fecha o ramo
antes que `DL-007` (casamento por id) o torne alcançável.

Junto, o item 15: uma fila que esvazia inteira por `skipped` ainda entra na
turma (`enterCourseAndGetHTML`), e offline isso devolve erro e descarta os
`skipped`. Depois do filtro de link, "lote só de links" vira exatamente esse
caso.

#### Acceptance criteria

1. O background passa a `downloadAllFiles` só os itens de `diff.newFiles` com
   `type === 'file'`. Um diff só com links não chama `downloadAllFiles` e não
   loga "Auto-downloading".
2. Em `_downloadAllFilesInternal`, um item cujo par na página (por id) é
   `type: 'link'` sai como `skipped`, com log próprio, e não entra em `failed`;
   por consequência não vai ao retry HTTP nem ao fallback Playwright. Item sem
   par na página continua `failed`, como hoje.
3. Fila vazia depois do filtro de `known` devolve
   `ok({ downloaded: 0, skipped: n, failed: 0, results })` **sem** chamar
   `enterCourseAndGetHTML`. Offline, essa chamada é sucesso, e `results`
   carrega os `skipped`.
4. No `downloadFile` do fallback, o ramo `href` resolve a URL contra
   `page.url()` e só chama `page.goto` se o resultado for `https:` com
   hostname `si3.ufc.br`. Qualquer outra URL devolve `{ success: false }` com
   mensagem, sem `goto`, e fecha o navegador pelo caminho normal.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/integration/audit-background-sync-downloads.test.ts tests/unit/sigaa-service.test.ts tests/unit/audit-download-external-url.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/audit-background-sync-downloads.test.ts`: diff com um
  `file` e um `link` → `downloadAllFiles` recebe só o `file`; diff só com
  `link` → `downloadAllFiles` não é chamado. Vermelho porque hoje o array vai
  inteiro.
- `tests/unit/sigaa-service.test.ts`: (a) todos os itens em `known` e válidos
  → `enterCourseAndGetHTML` não é chamado e o resultado é `ok` com `skipped`;
  vermelho porque hoje entra na turma. (b) item cujo par parseado é
  `type: 'link'` → `status: 'skipped'`, `downloadViaPlaywright` não chamado;
  vermelho porque hoje é `failed` e cai no fallback.
- `tests/unit/audit-download-external-url.test.ts` (mesma montagem de página
  falsa de `tests/unit/audit-download-inspect.test.ts`): `evaluate` devolve
  `{ type: 'href', value: 'https://drive.google.com/x' }` → `goto` não é
  chamado e o resultado é falha; `https://si3.ufc.br/sigaa/verArquivo?...` →
  `goto` é chamado. Vermelho porque hoje `goto` roda em qualquer `href`.

## Comments

- `Review: human` porque o diff muda o que o app faz sozinho em background e
  põe uma allowlist de navegação no fallback.
- `electron/security/navigation-policy.ts` (`SEC-003`) tem a regra `ufc.br`
  para a janela do app. Aqui a regra é mais estreita (`si3.ufc.br`, só
  `https:`) e cabe numa comparação inline; não amplie a política da janela
  para servir a este caso.
- `DL-007` mexe no mesmo `freshAction` (casamento por id). Sem gate: blocos
  diferentes; quem chegar depois resolve o conflito dentro dos Primary files.
- **2026-09-16, `BUG-019`: a trava deste ticket foi removida, com autorização
  escrita do autor.** O `BUG-019` critério 5 apagou o ramo `href` inteiro do
  `freshAction` — e o `if (protocol !== 'https:' || hostname !== 'si3.ufc.br')`
  vivia dentro dele, sem `page.goto` sobrando para proteger. O
  `tests/unit/audit-download-external-url.test.ts` (`New:` daqui) foi apagado
  junto: ele mocka `page.evaluate` devolvendo `{ type: 'href' }`, forma que o
  código não produz mais. Não é regressão — o risco que a trava cobria era o
  `DL-007` tornar o ramo alcançável, e o ramo deixou de existir. A revisão do
  `BUG-019` confirmou que `download.service.ts` ficou sem navegação alcançável:
  o único `page.goto` restante (`:106`) recebe `fileUrl`, que o único chamador
  passa como `''` (`playwright-login.service.ts:847`). O `:106` é o `CLEAN-010`.

#### Resolution (2026-09-15)

Verdict: Approve

Revisão de etapa 3 sobre `master..sec-004` (3 commits), eixos Standards e Spec.
Nenhum achado que exija correção. PR aberto e segurando, porque `Review: human`.

**Critérios, um a um**

1. ✅ `background-sync.service.ts:235` filtra `f.type === 'file'` antes do
   `if`, então um diff só de links não loga "Auto-downloading" nem chama
   `downloadAllFiles`. `CourseFile.type` é obrigatório (`shared/domain.ts:75`),
   não opcional — o filtro não descarta arquivo legítimo por campo ausente.
2. ✅ `sigaa.service.ts:494-501`: o par é buscado por id, `type: 'link'` vira
   `skipped` com log próprio e `continue`, antes do retry HTTP e do
   `downloadViaPlaywright`. Item sem par continua `failed` (`:503-510`).
3. ✅ `sigaa.service.ts:415-417` devolve `ok` com os `skipped` já apurados sem
   chamar `enterCourseAndGetHTML`.
4. ✅ `download.service.ts:139-145` resolve contra `page.url()` e exige
   `https:` + `si3.ufc.br`; recusa devolve `{ success: false }` com mensagem e
   sem `goto`. `new URL` inválida cai no catch externo (`:296-302`), que também
   devolve falha, e o `localBrowser.close()` do chamador
   (`playwright-login.service.ts:831/835`) roda nos dois caminhos.
5. ✅ Gate verde.

**Separação de commits**: `8efb858` e `2ef0db7` só tocam `tests/` + o ticket;
`fa68ae6` só toca `electron/` + o ticket. Nenhum commit de código mexeu em teste.

**Prova red-green**: com `git checkout master -- electron/` (testes novos sobre
o código velho), `npx vitest run` nos três arquivos dá
`Test Files 3 failed (3) | Tests 5 failed | 31 passed (36)` — o diff do
`sigaa-service.test.ts` mostra `status: 'failed'` onde o esperado é `'skipped'`.
Com o código da branch, `npm run quality`: 0 erros de lint (52 warnings de
`no-explicit-any`, pré-existentes), `Test Files 66 passed (66)`,
`Tests 739 passed | 5 skipped (744)`.

**Observações, nenhuma bloqueante**

- A troca de `findScript(a) ?? findScript(b)` por
  `findParsedFile(a) ?? findParsedFile(b)` muda o curto-circuito: agora basta
  existir par por id em `parsedFiles` para a seção de arquivos não ser
  consultada. Só diverge se o mesmo id sair como `link` no Dashboard e como
  `file` na seção — e aí o resultado é `skipped`, o lado seguro. O parser não
  emite `type: 'file'` sem `script` (`http-scraper.service.ts:422,460`), então
  o caso que motivou o segundo parse (arquivo ausente do Dashboard) continua
  caindo no `??`.
- O gatilho do `navigateToFilesSection` (`sigaa.service.ts:473`) ainda usa
  `findScript`, então um link que chegue à fila pela via manual paga uma
  navegação extra antes de ser pulado. Custo, não correção; não vale ticket.

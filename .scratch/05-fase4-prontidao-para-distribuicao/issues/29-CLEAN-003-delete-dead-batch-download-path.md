# CLEAN-003: Apagar o caminho de download em lote morto
Status: resolved
Stage: done
Priority: P3
Blocked by: — (DL-004 e OBS-003 fechados)

- Primary files (linhas conferidas em 2026-09-14, depois de DL-004/CLEAN-005):
  - `electron/services/playwright-login.service.ts` (só `downloadAllFiles`, `:851` até o fim do método)
  - `electron/services/download.service.ts` (só `downloadCourseFiles`, `:316` até o fim; e o comentário de cabeçalho `:1-9`)
  - `electron/services/sigaa.service.ts` (só o comentário `ponytail:` em `:574`)

#### Leia antes: `downloadAllFiles` existe duas vezes

- `SigaaService.downloadAllFiles` (`sigaa.service.ts:320`) — **vivo**: handler
  IPC `register-handlers.ts:214`, `background-sync.service.ts:235`,
  `preload.ts:34` e `src/pages/course-detail.ts:453`.
- `PlaywrightLoginService.downloadAllFiles` (`playwright-login.service.ts:851`)
  — **morto**, nenhum chamador. É o único que alcança
  `DownloadService.downloadCourseFiles` (`download.service.ts:316`), pelo
  `await import('./download.service')` de `playwright-login.service.ts:870`.

O fallback Playwright de download **está ligado**, por
`PlaywrightLoginService.downloadFile:735` via
`SigaaService.downloadViaPlaywright` (`sigaa.service.ts:190`, chamado de
`:271`, `:312`, `:586`), que por sua vez carrega `DownloadService.downloadFile`
(`download.service.ts:50`) pelo `await import('./download.service')` de
`playwright-login.service.ts:750`. **Esses ficam.** O que morre é só a
variante em lote. Um subagente errou isso em 2026-09-11 antes de subir a
cadeia; não repita.

As duas cadeias são gêmeas — mesmo import dinâmico, mesmo comentário "launch a
dedicated browser" em `:752` e `:872`. A diferença é a aridade: a viva recebe um
arquivo, a morta recebe uma lista. Apagar a morta não toca no fallback.

#### What to build

Remover `PlaywrightLoginService.downloadAllFiles` e
`DownloadService.downloadCourseFiles` (~200 linhas somadas), atualizar o
comentário de cabeçalho de `download.service.ts` (que hoje cita o método morto)
e reescrever o `ponytail:` de `sigaa.service.ts:556`, que sugere trocar o
fallback por-arquivo pelo lote que deixará de existir.

#### Acceptance criteria

1. `grep -rn "downloadCourseFiles" electron src tests` não retorna nada;
   `grep -rn "downloadAllFiles" electron` só retorna `SigaaService`, o handler,
   o preload e o `background-sync`.
2. `PlaywrightLoginService.downloadFile` e `DownloadService.downloadFile`
   continuam intactos: `tests/unit/sigaa-service.test.ts` e
   `tests/integration/download-boundary.test.ts` passam sem alteração.
3. Nenhum `import` ou helper que só o código removido usava sobra
   (`tsc` e `eslint` limpos).

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts tests/integration/download-boundary.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: é remoção de código sem chamador. O critério 2 é a rede
  existente. Se o `tsc` mostrar um chamador que este ticket não listou,
  **pare** — a premissa caiu, volte para a etapa 1.

## Comments

- ~~Decisão pendente do autor~~ **RESOLVIDA em 2026-09-14: apagar.** O autor
  confirmou depois de ver a cadeia traçada (as duas gêmeas, a viva por arquivo
  e a morta por lista). Razão: as ~200 linhas nunca rodaram, não têm teste, e
  já atravessaram os refactors de `DL-004` e `CLEAN-005` sem serem exercitadas
  — não são vantagem inicial, seriam reverificação do zero. O conhecimento fica
  no `ponytail:` reescrito. Etapa 2 liberada; duas tentativas anteriores
  pararam aqui.
- `docs/PLANO.md` seção 2.5 diz "não remover `download.service.ts`". Continua
  verdade para o arquivo (o `downloadFile` dele é o fallback vivo); só a
  variante em lote sai. Nada a editar no plano.
- Bloqueado por `OBS-003` porque os dois editam
  `playwright-login.service.ts`; por `DL-004` porque ele decide se ainda mexe
  em `download.service.ts:332-346`.

- 2026-09-14 Attempt 1 failed: exit 0. Log tail: Both blockers on CLEAN-003 (DL-004, OBS-003) are closed, so the ticket is unblocked and its `Stage: to-implement` is current — no branch exists yet, so nothing stale to check. /  / Before dispatching to stage 2, there's an open decision in the ticket's `## Comments`: /  / > Apagar tira a otimização anotada no `ponytail:` (`sigaa.service.ts:556`) de trocar um browser por arquivo pelo lote quando o retry falhar em massa. Se quiser guardar essa porta, o ticket vira "documentar como morto" em vez de apagar. **Confirmar antes da etapa 2; o ticket assume apagar.** /  / The ticket defaults to **delete** the dead batch-download path (`PlaywrightLoginService.downloadAllFiles` and `DownloadService.downloadCourseFiles`, ~200 lines), rewriting the `ponytail:` comment instead of keeping it as a documented future optimization. /  / Confirm: proceed with **delete** (the ticket's default), or do you want to switch it to "document as dead" instead? /

- 2026-09-14 Attempt 2 failed: exit 0; blocked after two attempts. Log tail: CLEAN-003 is unblocked (DL-004, OBS-003 both closed) and its `Stage: to-implement` is current — no branch exists yet. Stage 2 is Sonnet, which matches this session. /  / Before I dispatch to the `tdd` skill, the ticket has an open decision in `## Comments` that a previous run already stopped on: /  / > Apagar tira a otimização anotada no `ponytail:` (`sigaa.service.ts:556`) de trocar um browser por arquivo pelo lote quando o retry falhar em massa. Se quiser guardar essa porta, o ticket vira "documentar como morto" em vez de apagar. /  / The ticket defaults to **delete**: remove `PlaywrightLoginService.downloadAllFiles` and `DownloadService.downloadCourseFiles` (~200 lines), and rewrite the `ponytail:` comment at `sigaa.service.ts:556` instead of keeping it as a documented future optimization. /  / Confirm: proceed with **delete** (the ticket's default), or switch it to "document as dead" instead? /

- 2026-09-14 Attempt 3: the `## Comments` block already carried the resolution
  ("RESOLVIDA em 2026-09-14: apagar") that the first two attempts were waiting
  on, so this run proceeded straight to stage 2 on branch `clean-003`.
  No new test: this ticket removes code with no caller and no existing test
  (criterion 2 is the pre-existing regression net, unchanged). Removed
  `PlaywrightLoginService.downloadAllFiles` (`playwright-login.service.ts`),
  `DownloadService.downloadCourseFiles` (`download.service.ts`, plus its
  now-stale header comment), and rewrote the `ponytail:` at
  `sigaa.service.ts:574` to record that the batch path is gone rather than a
  future swap target. Proof: `grep -rn "downloadCourseFiles" electron src
  tests` returns nothing; `grep -rn "downloadAllFiles" electron` returns only
  `SigaaService`/handler/preload/`background-sync` call sites (criterion 1).
  `tests/unit/sigaa-service.test.ts` + `tests/integration/download-boundary.test.ts`:
  37 passed, unchanged (criterion 2). `npm run quality`: typecheck clean, lint
  0 errors/50 pre-existing warnings, 705 passed/5 skipped (criterion 3). Commit
  `c181232`, 3 files changed, 5 insertions(+), 244 deletions(-). `Stage:
  to-review`.

#### Resolution (2026-09-14)

Aprovado na primeira rodada de revisão, com uma correção só de comentário.

**Decisão:** apagar, como o `## Comments` resolveu. Saíram
`PlaywrightLoginService.downloadAllFiles` (`playwright-login.service.ts`, 118
linhas) e `DownloadService.downloadCourseFiles` (`download.service.ts`, 125
linhas), mais o cabeçalho `DOC-003` e o `ponytail:` que citavam a variante.

**Arquivos:** `electron/services/playwright-login.service.ts`,
`electron/services/download.service.ts`, `electron/services/sigaa.service.ts` —
todos dentro dos Primary files. Nenhum arquivo de teste tocado no branch inteiro.

**Critérios, conferidos pela revisão sem confiar no relatório da etapa 2:**

1. ✅ `downloadCourseFiles` zera em `electron/`, `src/` e `tests/`.
   `downloadAllFiles` em `electron/` volta só os sites vivos:
   `sigaa.service.ts:320/329/333/343`, `register-handlers.ts:43/214`,
   `preload.ts:34`, `background-sync.service.ts:235`.
2. ✅ `sigaa-service.test.ts` e `download-boundary.test.ts` passam sem alteração;
   `git diff master..clean-003 --stat` são 3 arquivos de código e o ticket.
3. ✅ Nada órfão. `chromium`, `Browser`, `Page`, `FILES_MENU` e o privado
   `navigateToCourse` continuam alcançados pelo `downloadFile` vivo
   (`playwright-login.service.ts:748-795`); `fs`/`Page` seguem em uso no
   `download.service.ts`. `tsc` limpo, eslint 0 erros.

**As gêmeas:** a revisão refez a cadeia em vez de aceitar a do ticket. A viva
recebe um arquivo, a morta recebia uma lista, e só a de lista alcançava
`downloadCourseFiles`. O chamador não listado que a etapa 2 deveria esperar não
apareceu.

**Vermelho-verde:** não há. É remoção de código sem chamador e sem teste, como o
ticket declara; o critério 2 é a rede pré-existente, intacta e verde.

**Correção da revisão (`f6f018b`, só comentário):** o `c181232` manteve a prosa
do `ponytail:` mas apagou o prefixo, e o compromisso anotado — um browser por
arquivo no fallback de retry — continua existindo. `ponytail:` é o índice de
compromissos conhecidos deste repositório (7 pontos no fonte; `BUG-004` e
`DOC-003` citam o marcador pelo nome), então sem o prefixo este sumiria do grep.
Prefixo restaurado, texto da etapa 2 mantido. Dentro dos Primary files e sem
teste novo — pequena pelo teste mecânico, não voltou para a etapa 2.

**Nota de processo, não achado:** a etapa 2 commitou `Stage: to-review` num
commit de docs à parte (`8884e0b`) em vez do último commit de código.

**Gate** (`npm run quality` no branch, depois da correção): typecheck limpo,
eslint 0 erros / 50 warnings pré-existentes, **705 passed | 5 skipped (710)** em
62 arquivos. CI do PR #28 verde nos três jobs.

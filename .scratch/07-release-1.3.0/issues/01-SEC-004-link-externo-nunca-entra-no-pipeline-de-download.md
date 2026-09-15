# SEC-004: Material `link` nunca entra no pipeline de download
Status: open
Stage: to-implement
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
numa turma não pode abrir um Chrome visível nem navegar para a URL que o
professor colou. Hoje `diff.newFiles` vai inteiro a `downloadAllFiles`; o link
não tem script e vira `failed`; o retry HTTP pula por falta de script; o laço de
último recurso chama `downloadViaPlaywright`, que abre o navegador com
`headless: false` e faz `page.goto(href)` na URL externa, esperando até 65 s por
um download que não vem. O caminho manual já filtra
(`course-detail.ts:462`); o background não.

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

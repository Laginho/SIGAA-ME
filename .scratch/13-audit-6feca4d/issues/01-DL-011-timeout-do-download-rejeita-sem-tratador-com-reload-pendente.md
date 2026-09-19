# DL-011: Timeout da espera de download rejeita sem tratador enquanto o reload do popup está pendente
Status: resolved
Stage: blocked
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/download.service.ts` (bloco `try` do reload do popup: `reloadDownloadPromise`, `await popup.reload().catch(...)`)
  - `tests/unit/download-fallback-popup-reload.test.ts` (caso novo; ou arquivo novo ao lado, etapa 2 escolhe)

Achado 1 (Broken) da auditoria `docs/audits/2026-09-19-6feca4d.md`,
reproduzido pelo auditor com Chrome real e servidor local lento: primeiro
documento do popup é HTML, o reload demora mais de 15s e nenhum download
chega. `waitForEvent('download')` rejeita por timeout antes de existir
tratador (o `await` dela só vem depois do `await popup.reload()`), gerando
`unhandledRejection` no main; 15s depois o reload expira, o método consome a
rejeição e devolve falha, com `PromiseRejectionHandledWarning`. Regressão
introduzida pela ordenação do DL-010.

#### What to build

Quando o fallback Playwright recarrega o popup e nenhum download chega dentro
do prazo, o método devolve `success: false` assim que a espera expira, sem
rejeição global, mesmo que `popup.reload()` ainda esteja pendente. Quando o
download chega durante o reload, continua salvo e finalizado como hoje
(DL-010 preservado).

Correção mínima: guardar a promise do reload (já com `.catch` que anota
`reloadError`) e dar `await` primeiro em `reloadDownloadPromise`, depois na
do reload. Ambas ficam com tratador desde a criação; a rejeição do timeout
cai direto no `catch` externo existente.

#### Acceptance criteria

1. Page falsa cujo `reload()` fica pendente e só resolve depois que
   `waitForEvent('download')` rejeitou por timeout: retorno `success: false`,
   nenhum `.part` sobrando, nenhum `unhandledRejection` (vitest reprova o
   arquivo se houver).
2. Os dois casos já existentes em `download-fallback-popup-reload.test.ts`
   (reload rejeita + download resolve; reload rejeita + download rejeita)
   continuam passando sem edição.
3. `reloadError` continua anexado ao `log.warn('Reload strategy failed.', …)`
   quando o reload rejeita antes do timeout.
4. `JSF_SESSION_EXPIRED` vindo de `finalizeDownload` continua subindo como
   exceção.
5. Teste vermelho sem a correção para o critério 1.
6. `download-fallback-early-exit.test.ts`,
   `audit-download-fallback-identity.test.ts`,
   `audit-download-identity.test.ts` e `audit-download-inspect.test.ts`
   passam sem edição.
7. `playwright-login.service.ts` e `sigaa.service.ts` não são tocados.
8. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/download-fallback-popup-reload.test.ts tests/unit/download-fallback-early-exit.test.ts tests/unit/audit-download-fallback-identity.test.ts tests/unit/audit-download-identity.test.ts tests/unit/audit-download-inspect.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Caso novo na mesma costura de `download-fallback-popup-reload.test.ts`
  (mock de `electron` e do logger, `DownloadService` real, `basePath` em
  `mkdtempSync`). A Page do popup tem `reload()` que devolve uma promise
  controlada externamente, resolvida só depois que `waitForEvent('download')`
  rejeitou (`Error('page.waitForEvent: Timeout 15000ms exceeded ...')`).
  Usar `vi.useFakeTimers()` ou resolução por ordem de eventos; não esperar
  15s reais. Conferir com array de eventos que `download-timeout` vem antes
  de `reload-resolve` e que o resultado já é `success: false`.

#### Resolution (2026-09-19)

Verdict: Approve

Decisão: a correção mínima do ticket, aplicada como escrita. `popup.reload()`
passa a ser guardada em `reloadPromise` (com o mesmo `.catch` que anota
`reloadError`) e o `await` vai primeiro em `reloadDownloadPromise`, depois em
`reloadPromise`. As duas promises têm tratador desde a criação; a rejeição do
timeout de 15s cai direto no `catch` externo que já existia, que fecha o popup
e devolve `success: false`.

Arquivos:

- `electron/services/download.service.ts` (linhas 218-227): 2 linhas de código
  e o comentário que explica por que a ordem é carga.
- `tests/unit/download-fallback-popup-reload.test.ts`: `fakePopupPageSlowReload`
  e um caso novo, sem tocar nos dois do DL-010.

Prova vermelho-verde:

    # sem a correção (download.service.ts de master, teste novo no lugar)
    npx vitest run tests/unit/download-fallback-popup-reload.test.ts
    → exit != 0, "Unhandled Rejection: Timeout 15000ms exceeded ..."
      em download.service.ts:213, mais PromiseRejectionHandledWarning

    # com a correção
    npx vitest run tests/unit/download-fallback-popup-reload.test.ts
    → exit 0

    npx vitest run tests/unit/download-fallback-popup-reload.test.ts \
      tests/unit/download-fallback-early-exit.test.ts \
      tests/unit/audit-download-fallback-identity.test.ts \
      tests/unit/audit-download-identity.test.ts \
      tests/unit/audit-download-inspect.test.ts
    → 5 passed (5), 19 passed (19)

Gate (`npm run quality`): typecheck limpo, ESLint 0 erros / 40 warnings
`no-explicit-any` pré-existentes, vitest 77 arquivos, 840 passed | 5 skipped.
CI do PR #56 verde nos três jobs (typecheck+lint+testes, E2E sem credencial,
scanner de segredo).

Critérios 1 a 8: todos atendidos. Commits separados como manda o fluxo —
`dcbeb15` só teste (+46), `49b3490` só código e ticket (+10/-2).

Notas sem ação:

- O commit só-de-teste não carregou `Stage: implementing`; a transição veio
  junto com o commit de código. Desvio de processo, não de código.
- A asserção de ordem do teste novo usa um evento empurrado na criação da
  espera, não na rejeição dela. O que prova o DL-011 é a ausência de
  `unhandledRejection`, que é o que fica vermelho sem a correção.
- `await reloadPromise` agora roda depois do download chegar. O conjunto de
  awaits antes de `saveAs` é o mesmo; sem mudança no caminho de sucesso.

## Comments

- 2026-09-19 Attempt 1 failed: exit 0. Log tail: DL-011 is already `Stage: done` — resolved and merged via PR #56, ledger recorded. Nothing to do. /
- 2026-09-19 Sessão do driver na branch `sweatshop/2026-09-19-2001` estava
  4 commits atrás de `master` quando recebeu este ticket; DL-011 tinha sido
  mergeado direto em `master` via PR #56, fora do fluxo de sessão (deveria ter
  ido para a branch da sessão, sem PR). Resolvido fazendo merge de `master`
  para dentro da sessão, trazendo o código e o `Stage: done` já corretos.

- 2026-09-19 Attempt 2 failed: exit 0; blocked after two attempts. Log tail: **DL-011 is `Stage: done`** — nothing to implement. The session branch was 4 commits behind master because a prior stage-3 session merged DL-011's fix straight into master via PR #56 instead of into `sweatshop/2026-09-19-2001`. That left this branch's copy of the ticket stuck reading `Stage: to-implement`, which is why Attempt 1 bounced. /  / I merged `origin/master` into the session branch to sync it (one conflict, in the ticket file itself — resolved by keeping master's Resolution block and appending the sync note), reran the gate (typecheck clean, 0 lint errors/40 pre-existing warnings, 840 passed | 5 skipped), and committed. The ticket now correctly reads `Stage: done` on this branch too. Nothing left to do on DL-011. /

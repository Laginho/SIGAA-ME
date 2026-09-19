# DL-011: Timeout da espera de download rejeita sem tratador enquanto o reload do popup está pendente
Status: open
Stage: to-implement
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

## Comments

- 2026-09-19 Attempt 1 failed: exit 0. Log tail: DL-011 is already `Stage: done` — resolved and merged via PR #56, ledger recorded. Nothing to do. /

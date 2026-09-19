# DL-010: Reload do popup que vira download é tratado como falha e descarta o arquivo
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/download.service.ts` (estratégia de reload do popup, `reloadDownloadPromise` e o `catch` `:211-245`)
  - `tests/unit/` — teste novo com Page falsa (etapa 2 escolhe o nome; modelo `download-fallback-early-exit.test.ts`)

Achado 2 (Broken) da auditoria `docs/audits/2026-09-19-e3d29e6.md`,
reproduzido pelo auditor com Chrome real e servidor local: primeiro pedido
do popup devolve HTML, o reload devolve `application/pdf`, a rota força
attachment, o evento de download ocorre e `popup.reload()` rejeita com
`net::ERR_ABORTED`; o `catch` fecha o popup e devolve "Could not force
download from popup" sem `saveAs`. Pasta final vazia. Decisões 5 a 7 de
`../spec.md`.

#### What to build

Quando o fallback Playwright abre um popup sem download e o recarregamento
com attachment forçado dispara o download, o arquivo é salvo e finalizado
antes de o popup fechar, e o método devolve `success: true` com o caminho.
Quando o reload rejeita e nenhum download chega, o método continua
devolvendo `success: false` sem rejeição global.

Correção mínima: aguardar `reloadDownloadPromise` e `popup.reload()` juntos,
ignorando a rejeição do reload quando a espera de download resolver. A
espera continua criada antes do reload. `saveAs`, `rejectIfTooLarge` e
`finalizeDownload` rodam como hoje, antes de `popup.close()`.

#### Acceptance criteria

1. Page falsa cujo `reload()` rejeita com `Error('page.reload: net::ERR_ABORTED')`
   e cujo `waitForEvent('download')` resolve com Download falso: retorno
   `success: true`, arquivo final existe na pasta da disciplina, `popup.close()`
   chamado depois de `saveAs`.
2. Page falsa cujo `reload()` rejeita e cujo `waitForEvent('download')`
   rejeita por timeout: retorno `success: false`, nenhum `.part` sobrando,
   sem `unhandledRejection`.
3. Reload que resolve normalmente e download que chega em seguida (caminho
   que já existia) continua devolvendo `success: true`.
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

    npx vitest run tests/unit/<teste novo> tests/unit/download-fallback-early-exit.test.ts tests/unit/audit-download-fallback-identity.test.ts tests/unit/audit-download-identity.test.ts tests/unit/audit-download-inspect.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste novo em `tests/unit/`, mesma costura de
  `download-fallback-early-exit.test.ts` (mock de `electron` e do logger,
  `DownloadService` real, `basePath` em `mkdtempSync`). A Page principal
  resolve `waitForEvent('popup')` com a Page do popup e deixa
  `waitForEvent('download')` pendente. A Page do popup expõe `url()`,
  `route()`, `unroute()`, `reload()`, `waitForEvent()` e `close()`; o
  Download falso expõe `saveAs(path)` (escreve `%PDF-1.4\n...`) e
  `suggestedFilename()`. Caso 1: `reload` rejeita, download resolve. Caso 2:
  `reload` rejeita, download rejeita por timeout. Conferir ordem de
  `close()` com um array de eventos.

#### Resolution (2026-09-19)

Verdict: Approve.

Decisão: `await popup.reload()` virou `await popup.reload().catch(...)`, e
quem decide o desfecho passa a ser `reloadDownloadPromise` — criada antes do
reload, como já era. `saveAs`, `rejectIfTooLarge` e `finalizeDownload`
continuam antes de `popup.close()`, sem reordenação.

Uma correção do revisor, dentro dos Primary files e sem teste novo: a
rejeição do reload era descartada sem deixar rastro, então um reload que
falhasse de verdade só aparecia no log como timeout de 15s de
`waitForEvent('download')`. Ela é guardada em `reloadError` e anexada ao
`log.warn('Reload strategy failed.', …)` que já existia. Sem mudança de
comportamento — regra 3 do `CLAUDE.md`.

Arquivos: `electron/services/download.service.ts:211-218,248` e
`tests/unit/download-fallback-popup-reload.test.ts` (novo, 108 linhas).
`playwright-login.service.ts` e `sigaa.service.ts` não foram tocados
(critério 7).

Prova red-green — com `await popup.reload()` de volta no lugar:

    Test Files  1 failed (1)
         Tests  1 failed | 1 passed (2)
        Errors  1 error   (Unhandled Rejection: Timeout 15000ms … "download")

O critério 1 cai, e o critério 2 também é coberto: sem a correção o caso de
timeout vaza uma rejeição não tratada, que o vitest reporta como erro de
execução e reprova o arquivo. Com a correção:

    Test Files  5 passed (5)     (o teste novo + os quatro do critério 6)
         Tests  18 passed (18)

Gate (`npm run quality`): typecheck limpo, ESLint `0 errors, 40 warnings`
(todos `no-explicit-any` pré-existentes), `76 passed`, `835 passed | 5
skipped (840)`.

Critérios 3 e 4 (reload que resolve; `JSF_SESSION_EXPIRED` subindo) não
ganharam teste — a seção "Tests stage 2 writes" só pedia os dois casos. São
regressões cobertas por leitura: quando o reload resolve, o `catch` novo é
no-op e o fluxo é byte a byte o de antes; o `throw` de `session-expired` e o
re-throw no `catch` não foram tocados.

Nota de processo, sem impacto no código: a etapa 2 moveu `Stage: to-review`
num commit `chore(scratch)` separado do último commit de código, em vez de
dentro dele.

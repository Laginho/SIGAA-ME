# DL-010: Reload do popup que vira download é tratado como falha e descarta o arquivo
Status: open
Stage: reviewing
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

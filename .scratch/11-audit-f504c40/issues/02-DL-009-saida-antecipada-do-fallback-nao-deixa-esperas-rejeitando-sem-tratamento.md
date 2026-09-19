# DL-009: Saída antecipada do fallback não deixa esperas rejeitando sem tratamento
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/download.service.ts` (criação de `downloadPromise`/`popupPromise` `:68-69`)
  - `tests/unit/` — teste novo com Page falsa (etapa 2 escolhe o nome; modelo `audit-download-fallback-identity.test.ts`)

Achado 1 (Broken) da auditoria `docs/audits/2026-09-19-f504c40.md`,
reproduzido pelo auditor em Chrome real: página sem link, `script` ausente,
browser fechado depois do retorno → duas rejeições globais
`Target page, context or browser has been closed`. Decisões 5 e 6 de
`../spec.md`.

#### What to build

Um download pelo fallback Playwright que falha antes de disparar a ação JSF
(link não encontrado sem script, ou erro no `evaluate`) devolve
`{ success: false }` e nada mais: quando o chamador fecha o browser dedicado,
nenhuma promise rejeita sem tratamento.

Correção mínima: anexar `.catch(() => {})` a `downloadPromise` e
`popupPromise` logo após criá-las. O `Promise.race` continua consumindo as
promises originais, então o evento de download não se perde e a ordem
(esperas antes do clique) não muda.

#### Acceptance criteria

1. Page falsa cujo `evaluate` devolve `null`, sem `script`: retorno
   `success: false`; depois de simular o fechamento (as duas esperas
   rejeitam), a suíte termina sem `unhandledRejection`.
2. Page falsa cujo `evaluate` lança na execução do script: mesmo resultado
   do critério 1.
3. Caminho feliz inalterado: `audit-download-fallback-identity.test.ts`,
   `audit-download-identity.test.ts` e `audit-download-inspect.test.ts`
   passam sem edição.
4. As esperas continuam sendo criadas antes do `evaluate` que dispara a ação.
5. Teste vermelho sem a correção (o vitest falha sozinho em rejeição não
   tratada; o teste não instala `process.on`).
6. `playwright-login.service.ts` não é tocado.
7. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/<teste novo> tests/unit/audit-download-fallback-identity.test.ts tests/unit/audit-download-identity.test.ts tests/unit/audit-download-inspect.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste novo em `tests/unit/`, mesma costura de
  `audit-download-fallback-identity.test.ts` (mock de `electron` e do logger,
  `DownloadService` real, `basePath` em `mkdtempSync`). A Page falsa expõe
  `url()`, `route()`, `unroute()`, `evaluate()` e `waitForEvent()`; cada
  `waitForEvent` devolve uma promise guardada e um `close()` do teste rejeita
  todas com `Error('Target page, context or browser has been closed')`.
  Sequência: chamar `downloadFile`, conferir `success: false`, chamar
  `close()`, aguardar dois ticks (`await new Promise(r => setImmediate(r))`).

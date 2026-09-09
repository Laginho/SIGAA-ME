# OBS-004 — Migrate the scraping pipeline to the logger
Status: open
Priority: P2
Blocked by: OBS-001

- Owner: —
- Dependencies: `OBS-001`
- Primary files:
  - `electron/services/http-scraper.service.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/download.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/ipc/register-handlers.ts` (só `sigaaService.clearDiagnostics` sai
    do clear-all e de `IpcDeps`)
  - `eslint.config.js` (os quatro serviços entram na zona `no-console`)
  - New: `tests/integration/logging-boundary.test.ts`
  - Editados: `tests/unit/sigaa-service.test.ts`,
    `tests/integration/clear-all-data.test.ts`; mocks de `logger` ganham
    `scope()` em `parser-real`, `download-boundary`, `download-real`,
    `portal-selector-resilience`, `background-sync-serialization`,
    `account-context`, `course-verification`, `sigaa-service`;
    `background-sync`, `background-sync-account` e `background-sync-cancel`
    ganham o mock para não escrever `test-userdata/logs/`

Fatiado de `OBS-001` em 2026-09-08 (`/to-tickets`, segunda rodada): primeiro
lote do migrate. Seam: conteúdo do SIGAA nunca interpolado na mensagem de log,
provado pelos serviços reais escrevendo no singleton em modo produção. Os
fatos, decisões, contrato e tabela de redação estão em `OBS-001`; este ticket
não os repete.

#### What to build

- `HttpScraperService`: `this.log(msg)` vira `logger.scope('HttpScraper')`;
  `scraper.log`, o `createWriteStream` com `flags: 'w'` e `resetLog()` somem.
  O `catch` que hoje faz `console.error('...', error)` com o `AxiosError`
  inteiro passa o erro em `meta` (`{ error }`), nunca interpolado nem
  posicional: o logger o reduz a `{ name, message, code }` e o cookie do
  `config.headers` não chega ao disco (`OBS-001`, releitura item 4).
- `SigaaService`: 18 `console.*` e 49 chamadas ao logger antigo viram
  `logger.scope('Sigaa')` com `(message, meta?)`; `clearDiagnostics()` some e
  o handler `clear-all-data` deixa de chamá-lo.
- `DownloadService` → `logger.scope('Download')`; `BackgroundSyncService` →
  `logger.scope('BackgroundSync')`.
- Regra dos call sites (`OBS-001`, decisão 6): mensagem literal; id, contagem,
  código de erro e duração podem ir na mensagem; nome de disciplina, arquivo
  ou notícia, caminho, usuário, HTML e script JSF vão em `meta` ou não vão.
- `eslint.config.js`: os quatro arquivos entram na zona `no-console: error`.

#### Acceptance criteria

1. **Conteúdo fora do log de produção, nos serviços reais.**
   `tests/integration/logging-boundary.test.ts`, com o singleton real em modo
   produção escrevendo numa pasta temporária: `getCourseFiles` com fixture;
   falha de rede com `axios` rejeitando um `AxiosError` cujo `config.headers`
   carrega `Cookie`; `downloadFile` HTTP; `SigaaService.downloadFile` caindo
   no plano B até o `DownloadService` real com `Page` falsa (hoje grava
   `Starting download for "Lista 3.pdf"` e o caminho completo);
   `BackgroundSyncService.syncNow` em cold start **e** com baseline em
   `getCourseState`, `diffCourseState` com uma notícia nova,
   `autoDownloadUpdates: true` e `getNewsDetail` devolvendo conteúdo (hoje
   grava `Cached content for news "Prova Remarcada"`). Cada cenário exige que
   **algo** tenha sido logado no escopo do componente: um logger mudo passa no
   negativo e falha no positivo. O ciclo com notícia exige também que
   `getNewsDetail` tenha sido chamado (auditoria cega de 2026-09-07, achados 4
   e 5).
2. **`scraper.log` não existe mais.** Nenhum arquivo além de `logs/` é criado
   pelos quatro serviços; `resetLog` e `clearDiagnostics` não existem;
   `clear-all-data.test.ts` prova que o handler não toca caminho de log por
   conta própria.
3. **Lint.** `npm run lint` verde com `no-console: error` nos quatro arquivos.
4. Nenhum `try/catch` novo que só chame `logger.error` (regra 3).

#### Verification

```text
npx vitest run tests/integration/logging-boundary.test.ts tests/integration/clear-all-data.test.ts tests/unit/sigaa-service.test.ts
npm run quality
```

## Testes que a etapa 2 escreve (commit próprio, vermelhos)

- `tests/integration/logging-boundary.test.ts` — `HttpScraperService` com as
  fixtures de `parser-real.test.ts`; `downloadFile` no padrão de
  `download-boundary.test.ts`; plano B com `PlaywrightLoginService` mockado só
  na navegação e o `downloadFile` do mock entregando uma `Page` falsa ao
  `DownloadService` real; `BackgroundSyncService.syncNow` no padrão de
  `background-sync.test.ts`, com timers reais (o ciclo dorme 2 s por
  disciplina). Um `beforeEach` (não `beforeAll`) confere que o singleton expõe
  `scope`, pelo motivo registrado em `OBS-001`.
- Vermelho pelo motivo certo: antes da migração, os serviços escrevem em
  `console` e em `scraper.log`, e o arquivo `logs/app.log` do teste fica sem
  linha no escopo esperado. O positivo falha; é ele que prova a migração.

## Para o revisor (o que os testes não cobrem)

- Grep no diff por interpolação de conteúdo em chamada de log:
  `\$\{[^}]*(\.name|\.title|fileName|courseName|basePath|filePath|Path\b)` dentro
  de `logger.*(`/`log.*(`. Deve dar zero nos quatro arquivos.
- `AxiosError` nunca como argumento posicional nem interpolado; só como valor
  de `meta`.
- Nenhum vararg novo: a assinatura de transição de `OBS-001` ainda aceita, mas
  `OBS-005` a estreita e cada vararg que sobrar vira erro de tipo lá.
- Os dumps `debug_*.html` de `http-scraper.service.ts` ficam intocados
  (`OBS-003`); só o `console.log('Saved debug_...')` ao lado migra.

## Fora de escopo, com ticket

- `OBS-005` — `playwright-login` e o contract.
- `OBS-003` — dumps de HTML cru e limpeza de legado.
- `OBS-002` — `[op:<id>]`.

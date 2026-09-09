# OBS-004 — Migrate the scraping pipeline to the logger
Status: resolved
Stage: done
Priority: P2
Blocked by: OBS-001

- Owner: —
- Dependencies: `OBS-001`
- Primary files:
  - `electron/services/logger.service.ts` (só o `clear()`, pelo critério 5)
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
- **Herdado da revisão do `OBS-001` (2026-09-09):** um write enfileirado
  *durante* `logger.clear()` se perde e dispara o `console.error` de "sink
  desligado" — `clear()` zera `this.stream` enquanto `initialized` segue
  `true`, e o `writeLine` pendente cai num `TypeError`. Reproduzido por sonda:
  linha "durante" não chega ao disco, a seguinte chega, o sink é religado pelo
  `finally`. Hoje não dispara porque o handler `clear-all-data` aguarda cada
  passo e nada loga em paralelo; quando o pipeline passar a logar pelo mesmo
  objeto, corrigir encadeando o `clear()` na mesma `chain` dos writes
  (`const p = this.chain.then(doClear); this.chain = p.catch(() => {}); return p;`)
  em vez de só aguardar o `flush()`, com teste que enfileira um write durante
  o `clear()` e exige a linha no arquivo novo.

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
5. **Write durante o `clear()` não se perde.** O `clear()` de
   `logger.service.ts` entra na mesma `chain` dos writes
   (`const p = this.chain.then(doClear); this.chain = p.catch(() => {}); return p;`).
   Teste que enfileira um write sem `await` e chama `clear()` no mesmo tick
   exige a linha no arquivo novo e nenhum `console.error` de sink desligado.
   Vem do bullet herdado da revisão do `OBS-001`, acima; dobrado em critério na
   reabertura de 2026-09-09 porque a etapa 2 lê a lista de arquivos e os
   critérios, não a prosa.

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
- `tests/unit/logger-redaction.test.ts` — write enfileirado durante o `clear()`
  (critério 5), em commit vermelho antes da correção do `clear()`.
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

## Revisão da etapa 3 (Opus, 2026-09-09) — reaberta

Base `master` (`d1d2f4e`), HEAD revisado `3995ee9`, worktree
`.claude/worktrees/obs-004-scraping-logger`. Nenhum código de produção ou teste
alterado nesta revisão. Sem PR: um achado bloqueante.

Gate no Windows: `npm run quality` verde — 0 erros de lint, 62 warnings
`no-explicit-any` (caiu de 77), `47 arquivos | 601 passed | 4 skipped (605)`.

Prova de vermelho: `git checkout master -- electron/services electron/ipc` e
`npx vitest run tests/integration/logging-boundary.test.ts` → **6 failed (6)**,
cada um na asserção positiva (`expected '' to contain '[HttpScraper]'`,
`'[Download]'`, `'[BackgroundSync]'`). Sem a migração o `logs/app.log` fica
vazio. Vermelho pelo motivo certo, verde com a correção.

Separação de commits respeitada: `0be0c17` só `tests/`, `3995ee9` só
`electron/` + `eslint.config.js`.

### Confirmado

- Os quatro serviços sem nenhum `console.*`; os quatro na zona `no-console:
  error` do `eslint.config.js` (AC3).
- Greps do "Para o revisor": zero interpolação de `.name`/`.title`/`fileName`/
  `courseName`/`basePath`/`filePath`/`Path` em chamada de log nos quatro
  arquivos; zero erro posicional ou interpolado — sempre `{ error }`; zero
  vararg novo. O único posicional que sobra é
  `playwright-login.service.ts:637`, escopo do `OBS-005`.
- `AxiosError` reduzido a `{ name, message, code }` por `sanitizeError`: o
  `config.headers.Cookie` não alcança o disco, provado pelo cenário de falha
  de rede.
- `scraper.log`, `resetLog()` e `clearDiagnostics()` não existem mais; nenhum
  caminho de log é tocado pelo handler por conta própria (AC2).
- Nenhum `try/catch` novo que só loga (AC4). Os que só logam
  (`download.service.ts:83`) são pré-existentes e não foram criados aqui.
- Cada cenário do AC1 presente, com a asserção positiva que um logger mudo
  reprovaria, e o `expect(getNewsDetail).toHaveBeenCalledTimes(1)` do ciclo com
  notícia.

### Spec

- ❌ **"What to build", último item — a corrida do `clear()` não foi
  corrigida.** `git diff master...HEAD -- electron/services/logger.service.ts`
  é **vazio**. `clear()` continua fazendo `await this.flush()` e depois zerando
  `this.stream` **fora** da `chain`: um `enqueue` nessa janela encadeia em uma
  `chain` já resolvida, `ensureInit()` retorna de imediato porque `initialized`
  ainda é `true`, e `this.stream!.write` estoura em `TypeError` → a linha se
  perde e o `console.error` de "sink desligado" dispara. Exatamente o bug que
  o ticket herdou da revisão do `OBS-001` e mandou fechar aqui, com o
  encadeamento `const p = this.chain.then(doClear); this.chain = p.catch(() => {}); return p;`
  e **teste que enfileira um write durante o `clear()`**. Não há código nem
  teste. O `await logger.clear()` do `beforeEach` de
  `logging-boundary.test.ts` é reset sequencial entre testes, não a corrida.

  Contexto para quem retomar: o handler `clear-all-data` continua drenando
  antes de limpar (`operations.cancel('background')` aguarda
  `runningOfKind.done`), então o caminho do clear-all em si segue seguro. O que
  a migração abriu foi todo o resto do pipeline logando no mesmo singleton —
  qualquer operação interativa concorrente com o clear-all agora cai na janela.

- ❌ **`logging-boundary.test.ts` sem a asserção de contrato no `beforeEach`.**
  O ticket pede, em "Testes que a etapa 2 escreve": "Um `beforeEach` (não
  `beforeAll`) confere que o singleton expõe `scope`, pelo motivo registrado em
  `OBS-001`" (`OBS-001`, releitura: "Um `beforeEach` em cada arquivo novo faz
  asserção sobre a existência dos membros do contrato... um `beforeAll` que
  falha marca a suíte inteira"). Não existe nenhuma asserção sobre
  `logger.scope` no arquivo.

### Standards

- **Sobra morta.** `tests/integration/background-sync-serialization.test.ts:45`
  e `:89` ainda declaram e criam `resetLog` no `HttpFake`, método que não existe
  mais em `HttpScraperService`. Inofensivo (é fake), mas é sobra da remoção.
- **Nit, regra de call site.** `http-scraper.service.ts:873` interpola
  `contentType` na mensagem; a regra do `OBS-001` (decisão 6, repetida no
  "What to build" daqui) admite na mensagem só id, contagem, código de erro e
  duração. Não é conteúdo do SIGAA nem dado sensível — só desvio literal da
  regra.

## Revisão da etapa 3 (Opus, 2026-09-09) — segunda passada, fechada

Base `master` (`8eeeb4f`), HEAD revisado `adb193c`. Escopo: o delta da
reabertura (`90eb58d..adb193c`), mais os dois ❌ e os dois itens de Standards da
primeira passada. Nenhum código de produção ou teste alterado nesta revisão.

#### Resolution (2026-09-09)

Os quatro itens da primeira passada estão fechados.

- ✅ **Critério 5, a corrida do `clear()`.** `logger.service.ts:172-198`:
  `clear()` deixou de ser `async` com `await this.flush()` e passou a
  encadear na fila — `const p = this.chain.then(doClear); this.chain =
  p.catch(() => undefined); return p;`. Um `enqueue` chamado durante o clear
  lê a `chain` já apontando para `p`, então o `writeLine` roda **depois** do
  `doClear`, com `initialized` já `false`, e re-inicializa em vez de achar
  `this.stream` nulo. `p` continua rejeitando com o erro do `rm` (o `catch` só
  protege a `chain`), e `flush()` segue sem rejeitar.
  Verificado que nada mais escapa da fila: `rotate()` só é alcançável de dentro
  de `writeLine`, que roda na `chain`; `openStream()` só de `ensureInit`/`rotate`.
- ✅ **Critério 5, o teste.** `tests/unit/logger-redaction.test.ts:319-337`
  enfileira `logger.info('durante o clear')` sem `await`, no mesmo tick de
  `logger.clear()`, e exige a linha no arquivo novo, a ausência da anterior e
  zero `console.error`.
- ✅ **`beforeEach` de contrato.** `logging-boundary.test.ts:138`,
  `expect(typeof logger.scope).toBe('function')` — `beforeEach`, não
  `beforeAll`, como o `OBS-001` pede.
- ✅ **Sobra morta.** `resetLog` saiu do `HttpFake` e do mock em
  `background-sync-serialization.test.ts`. Grep por
  `resetLog|clearDiagnostics|scraper.log` em `electron/`, `src/` e `tests/`:
  só dois comentários históricos em `tests/e2e/clear-all.spec.ts`.
- ✅ **Nit do call site.** `http-scraper.service.ts:873` passou `contentType`
  para `meta`; na mensagem sobrou `Content-Length`, que é contagem e a regra
  admite.

Prova de vermelho: `git checkout master -- electron/services/logger.service.ts`
e `npx vitest run tests/unit/logger-redaction.test.ts` → **1 failed | 25
passed (26)**, com
`TypeError: Cannot read properties of null (reading 'write')` dentro do
`[Logger] falha ao gravar log, sink desligado:`. É exatamente o bug descrito no
bullet herdado do `OBS-001`. Com a correção restaurada, os quatro arquivos de
verificação do ticket: **4 passed | 72 passed (72)**.

Separação de commits respeitada: `e404135` só `tests/`, `adb193c` só
`electron/`.

Gate: `npm run quality` verde — typecheck limpo, `eslint` com 0 erros e 62
warnings `no-explicit-any` (caiu de 77 antes do ticket), `47 arquivos | 602
passed | 4 skipped (606)`. O +1 sobre os 601 da primeira passada é o teste da
corrida.

Greps do "Para o revisor" refeitos no HEAD final: zero `console.*` nos quatro
serviços, zero interpolação de conteúdo em chamada de log, zero vararg novo.

Merge direto: a etapa 3 não mudou código.

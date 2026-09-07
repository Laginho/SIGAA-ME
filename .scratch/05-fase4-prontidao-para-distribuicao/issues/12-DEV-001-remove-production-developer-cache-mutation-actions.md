# DEV-001 — Remove production developer cache mutation actions
Status: resolved
Priority: P2
Tracker status at migration: `PARTIAL`

- Owner: —
- Dependencies: none
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/vite-env.d.ts`
  - `tests/e2e/app.spec.ts`
  - `electron/ipc/register-handlers.ts`
  - `tests/integration/dev-cache-mutation-boundary.test.ts`
  - `tests/unit/preload-dev-gate.test.ts`

#### Current state

- Inspected at `2997820` on 2026-09-07. The migrated description was stale:
  the tray and IPC handler already use `!app.isPackaged`. The main injects
  `--sigaa-dev` through `BrowserWindow.webPreferences.additionalArguments`
  only when unpackaged. No private cache member access remains in this path.
- The preload exposes the simulation only as `window.testApi.simulateNewFile`,
  and only when its argv contains `--sigaa-dev`. `window.api` has no simulation
  method. `window.testApi` is already optional in `src/vite-env.d.ts`.
- Remaining gap under the accepted scope: the preload trusts the flag alone.
  If the packaged preload receives it, `testApi` is exposed even though the
  main has not registered the mutation handler. This is an exposure failure;
  it does not demonstrate a working production cache mutation via IPC.

#### Grilling (2026-09-07)

- The original criteria already hold for a normal packaged launch. Repeating
  them cannot honestly produce red tests.
- Asked Bruno whether production must also hide `testApi` when a packaged
  preload receives `--sigaa-dev`, while retaining the development bridge.
  Answer: **"Sim, cobrir também o flag em produção"**.
- Packaging is the authority. Neither a supplied flag nor `NODE_ENV` alone
  may grant development access. Preserve automatic bridge availability for
  unpackaged launches, including E2E against built files with no Vite server.
- The flag-at-preload test is an explicit boundary input. It does not claim
  that Electron forwards every main-process CLI argument into the renderer.
- Keep the current boolean simulation result. This task does not redesign
  sync, notification delivery, cache persistence, or the live E2E scenario.

#### Existing contract, verified in production sources

- `electron/main.ts` wires `registerIpcHandlers` to its `simulateNewFile`.
  `electron/ipc/register-handlers.ts` registers `test-simulate-new-file` only
  for an unpackaged app and applies the existing trusted-sender wrapper.
- The simulation has no request payload and returns `Promise<boolean>`.
  It reads `getActiveAccount()`, returns `false` without an active account,
  calls `cacheService.forgetLastFile(accountId)`, and returns `false` if there
  is nothing to forget. Otherwise it awaits `backgroundSyncService.syncNow()`
  and returns `true`. A rejected sync propagates.
- `CacheService.forgetLastFile` removes the last file from the first nonempty
  course of that account and persists it. Other accounts and news are preserved.
- `BackgroundSyncService.syncNow()` returns `Promise<void>` and can no-op when
  background sync is disabled or already running. Therefore `true` means the
  simulation forgot a file and the sync call resolved, not that a notification
  was delivered. No new IPC contract is introduced by this specification.

#### Acceptance criteria

- [x] **AC1 — Packaged surface:** with `app.isPackaged === true`, the tray
  contains only the existing ordinary actions `Abrir SIGAA-ME`,
  `Sincronizar Agora`, and `Sair`, plus separators. No developer simulation
  action is present. `test-simulate-new-file` is not registered.
- [x] **AC2 — Flag is insufficient:** after a packaged main launch, the preload
  exposes neither `testApi` nor any simulation member on `api`, including when
  its argv explicitly contains `--sigaa-dev`. Cover both `NODE_ENV=production`
  and `NODE_ENV=development`. Absence of the flag remains safe. Loading the
  preload must not mutate cache or trigger a sync to discover its permissions.
- [x] **AC3 — Development remains usable:** an unpackaged main launch without a
  Vite server still provides the explicit `testApi.simulateNewFile` bridge used
  by E2E, even under `NODE_ENV=production`. Retain the existing development tray
  action and registered handler. Calling the real bridge reaches the real
  handler and main simulation: it removes one file only from the active
  account, preserves news and other accounts, invokes sync, and returns `true`.
  No active account or no cached file returns `false` without invoking sync.
- [x] **AC4 — Boundary constraints:** `window.api` stays typed as `RendererApi`
  without simulation or generic IPC; `window.testApi` stays optional with the
  existing boolean return contract. Preserve `sandbox: true`,
  `contextIsolation: true`, and `nodeIntegration: false`. Do not import main-only
  Electron `app` into the sandboxed preload. Authorization must derive from
  the actual main packaging state, with no simulation call as a capability probe.
- [x] **AC5 — Scope and verification:** the two DEV-001 cases pass after the
  implementation and `npm run quality` is green. Preserve existing IPC
  validation and avoid private cache access. No changes to `docs/PLANO.md`,
  other issues, scraping, or sync behavior. No build, live login, or full E2E
  execution is required in this loop.

#### Verification

```text
npx vitest run tests/integration/dev-cache-mutation-boundary.test.ts
npx vitest run
npm run quality
```

The final command is the implementation/review gate. The specification commit
intentionally leaves the two new cases red. Set `RUN_LIVE_SIGAA_TESTS=false`
when running Vitest; do not run the credentialed E2E suite.

The integration test imports the real `electron/main.ts`, preload, handler
registration, account context and cache service. Electron, disk, startup
services and sync execution are mocked; disk uses an in-memory `Map`.
It supplies only renderer-available Electron exports to the preload.
There is no copied simulation or gate logic and no SIGAA request.

The old `preload-dev-gate.test.ts` assertion that argv alone guarantees
`testApi` was moved to the integrated main/preload scenario. Its assertions
that `api` never contains simulation or generic IPC remain. The existing
standalone preload tests do not start main and cannot authorize development
solely by supplying argv anymore.

#### Mecanismo

- O sinal de autorização vai por `process.env`. O main define a variável quando
  `!app.isPackaged`, **antes** de `new BrowserWindow(...)`, e a **apaga
  explicitamente** quando empacotado. O preload sandboxed lê `process.env` de
  forma síncrona e expõe `testApi` só com o sinal presente.
- Ordem importa: o renderer herda o ambiente do main no spawn. Sinal definido
  depois de `createWindow()` não chega ao preload. O dublê de `BrowserWindow` no
  teste captura `{ ...process.env }` na construção e o preload roda com esse
  snapshot, então definir tarde falha em AC3.
- Apagar quando empacotado não é opcional: os dois boots do teste correm no
  mesmo processo Node, e um valor deixado pelo boot dev vazaria para a leg
  empacotada.
- `argv` não serve: a leg empacotada recebe o mesmo argv que o main dev injetou
  (`[...productionArgs, ...devArgs]`), qualquer que seja o token.
- `ipcMain.on` + `ipcRenderer.sendSync` e um probe via `ipcRenderer.invoke` não
  servem: os dublês existentes (`ipcMain: { handle }` aqui, em
  `navigation-policy.test.ts` e `updater-consent.test.ts`; `ipcRenderer` sem
  `sendSync`; `invoke` devolvendo `undefined` em `preload-dev-gate.test.ts`)
  quebram, e o implementador não edita teste.

#### Implementation notes

- Specification only; production sources and `tests/e2e/app.spec.ts` remain
  unchanged. The E2E already consumes `testApi`; its legacy `as any` and
  empty-cache handling are recorded here but are not redesigned by DEV-001.
- Implementation must preserve the existing tests and make the new assertions
  pass without modifying their expectations. Keep the solution local; the
  criteria do not require a new renderer API or a new IPC channel.
- Branch: `dev-001-remove-dev-actions`, created from `master` at `2997820`.
- Specification commit subject:
  `test: specify dev-only cache mutation removal (DEV-001)`.

#### Specification verification (2026-09-07)

- Before adding the tests: `npx vitest run` exited 0 — **40 passed files;
  501 passed | 4 skipped (505)**.
- Final `npx vitest run` exited 1 — **1 failed | 40 passed files (41);
  2 failed | 501 passed | 4 skipped (507)**.
- Each new parameterized case failed by assertion at
  `expect.soft(harness.exposed.has('testApi')).toBe(false)`:
  `AssertionError: expected true to be false`. One case uses
  `NODE_ENV=production`, the other `NODE_ENV=development`.
  Both executed their imports, main startup, real development mutation,
  ordinary packaged launch and post-failure side-effect checks successfully.
  No import, setup, timeout or unhandled-error failure accounts for the red.
- `npm run typecheck` exited 0. Targeted ESLint on both changed test files
  exited 0, with no warnings. `npm run quality` is intentionally not claimed
  green in this specification phase.
- The sandbox initially blocked esbuild from reading the config path;
  verification was repeated outside it. This infrastructure failure is not
  counted as red evidence. All Vitest runs explicitly disabled live SIGAA tests.
- Only this issue and the two test files changed. No implementation, build,
  live E2E, push, or changes to the plan or another issue.

## Auditoria cega do spec (Fable)

Sessão separada, 2026-09-07, em `474a5f2`. Lido: issue, diff, `electron/main.ts`,
`electron/preload.ts`, `electron/ipc/register-handlers.ts`, `sender-policy.ts`,
`cache.service.ts`, `account-context.service.ts`, `src/vite-env.d.ts`,
`tests/e2e/app.spec.ts`, `tests/unit/preload-dev-gate.test.ts`,
`tests/unit/preload-contract.test.ts`, e os dois outros testes que importam o
main (`navigation-policy.test.ts`, `updater-consent.test.ts`).

`RUN_LIVE_SIGAA_TESTS=false npx vitest run`: **1 failed | 40 passed (41);
2 failed | 501 passed | 4 skipped (507)**. Os dois casos novos falham por
asserção em `dev-cache-mutation-boundary.test.ts:164`
(`expected true to be false`), depois de executarem com sucesso o boot dev, a
mutação real, o boot empacotado e a checagem de tray/handler. Confere com o
registro da especificação.

Contrato descrito na issue bate com o código: `simulateNewFile` em
`main.ts:103-117` (sem payload, `Promise<boolean>`, `false` sem conta ou sem
arquivo, `await syncNow()` e `true`); registro condicional em
`register-handlers.ts:336-340` com `noPayload` e `() => false` no inválido;
tray em `main.ts:266-272` com os três rótulos. Nenhum achado nesse eixo.

### A1 — Teste passa sem implementar o critério: o flag é literal, não o que o main injeta

`dev-cache-mutation-boundary.test.ts:163` alimenta o preload empacotado com o
literal `'--sigaa-dev'`. A leg dev alimenta o preload com `devArgs`, capturado
de `additionalArguments`. Hoje os dois são iguais por coincidência de texto,
não por construção.

Cenário que passa verde e mantém a exposição: o implementador renomeia o token
nos dois lados (`additionalArguments: ['--sigaa-dev-bridge']` no main e
`process.argv.includes('--sigaa-dev-bridge')` no preload). Leg dev: `devArgs`
traz o token novo, `testApi` aparece. Leg empacotada sem flag: nada. Leg
empacotada com `'--sigaa-dev'`: o preload ignora o token antigo, `testApi`
ausente, `expect.soft` passa. Um preload empacotado que receba
`--sigaa-dev-bridge` expõe a ponte, que é exatamente o que AC2 proíbe
("argv alone cannot grant access").

Correção no teste, uma linha:
`await loadPreload([...productionArgs, ...devArgs])`. Com isso o preload
empacotado recebe argv idêntico ao do preload dev, qualquer que seja o token, e
argv deixa de poder ser a autoridade. Vale ajustar o comentário da linha 161.

### A2 — Os dublês fixam os primitivos de IPC; a solução síncrona natural exige editar testes fora do limite

A issue diz que os critérios não exigem canal novo e pede solução "local", mas
não nomeia um mecanismo pelo qual um preload sandboxed descubra
`app.isPackaged`. Os dublês existentes fecham as opções, e o implementador não
pode editar arquivo de teste:

- `ipcMain: { handle }` neste teste e em `navigation-policy.test.ts:82` e
  `updater-consent.test.ts:38`. Um gate síncrono via `ipcMain.on` +
  `event.returnValue` quebra os três arquivos no `import(main)` com
  `TypeError: ipcMain.on is not a function`.
- `ipcRenderer: { invoke, on, off }` em `loadPreload`. `ipcRenderer.sendSync`
  no preload é `TypeError` em `loadPreload`, embora seja export disponível no
  renderer, ao contrário do que a seção Verification afirma ("supplies only
  renderer-available Electron exports").
- `ipcMock.invoke` em `preload-dev-gate.test.ts:29` devolve `undefined`. Um
  probe assíncrono `ipcRenderer.invoke('...').then(expor)` no topo do preload
  quebra os cinco testes daquele arquivo com
  `Cannot read properties of undefined (reading 'then')`. Medi que
  `await import()` do Vitest esvazia a cadeia de microtasks, então o probe
  funcionaria neste harness, mas só embrulhado em `Promise.resolve(...)` para
  tolerar o dublê. E `preload-contract.test.ts` exige que todo canal invocado
  no preload tenha `handle('...')` em `register-handlers.ts`.

O que sobra sem tocar em teste: sinal controlado pelo main fora de argv, legível
de forma síncrona no preload sandboxed. Na prática é `process.env`, definido
quando `!app.isPackaged` e **apagado explicitamente** quando empacotado. O
apagamento não é opcional: os dois boots correm no mesmo processo Node, e um
`process.env` deixado pelo boot dev faria a leg empacotada expor `testApi` na
linha 156. Isso é um acerto do teste, mas a issue devia dizer isso ao
implementador em vez de deixá-lo redescobrir por eliminação.

### A3 — Sinal por `process.env` é verificado num processo só; o momento em que o main o define não é coberto

Consequência de A2. No Electron o renderer herda o ambiente do processo
principal **no spawn**, e o preload sandboxed lê `process.env`. Um sinal
definido antes de `new BrowserWindow(...)` chega ao preload. Um sinal definido
depois não chega.

Cenário: o implementador define `process.env.X` dentro de `whenReady().then`,
depois de `createWindow()` (por exemplo junto do tray, onde já existe um ramo
`app.isPackaged`). Neste teste, main e preload compartilham o mesmo `process`,
o valor está lá quando `loadPreload` roda, tudo verde. No app dev real o preload
não vê o sinal, `window.testApi` fica `undefined`, e o E2E morre em
`app.spec.ts:204` com `TypeError` em vez de cair no ramo "cache vazio".

Correção barata no harness: o dublê de `BrowserWindow` captura
`{ ...process.env }` no momento da construção, e `loadPreload` roda o preload
com **esse** snapshot em `process.env`, não com o ambiente vivo. Assim o teste
distingue "definido antes da janela" de "definido depois". Sem isso, AC3 fica
sem teste que falhe para o erro de ordem.

### Notas menores, sem cenário de falha

- `Primary files` lista `src/vite-env.d.ts` e `tests/e2e/app.spec.ts`, e
  Implementation notes diz que ambos permanecem inalterados. Uma das duas
  afirmações sobra.
- O boot empacotado corre com `process.argv` do main contendo `--sigaa-dev`
  (`bootMain`, linha 100). Isso pega qualquer implementação que passe a
  confiar no argv do main, porque `handlers.has('test-simulate-new-file')`
  precisa ser `false`. Acerto do spec, vale manter.
- A proibição de probe via simulação (AC4) está coberta pela leg dev: um
  `invoke('test-simulate-new-file')` no load do preload esqueceria um arquivo a
  mais e chamaria `syncNow` duas vezes, e as linhas 132 e 134 falham.

Sem implementação, sem ledger, sem outra issue tocada.

## Revisão (Opus, 2026-09-07)

Sessão limpa, sem ver a sessão que especificou. Lido: diff completo de
`2a31b0e`, `electron/main.ts`, `electron/preload.ts`,
`electron/ipc/register-handlers.ts`, `src/vite-env.d.ts`,
`tests/integration/dev-cache-mutation-boundary.test.ts`,
`tests/unit/preload-dev-gate.test.ts`, `tests/e2e/app.spec.ts`.

### Verificação empírica do mecanismo

A suíte inteira é mockada; ela não podia provar a única premissa que o diff
assume — que um preload **sandboxed** enxerga `process.env` definido no main
antes de `new BrowserWindow`. Rodei um app Electron mínimo com o binário deste
repositório, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`:

```text
PRELOAD sandboxed=true env="1" argv=["--sigaa-dev"]
```

O sinal chega. AC3 se sustenta no app real, não só no dublê.

### Achados

Um, cosmético, corrigido em cima:

- `src/vite-env.d.ts:23` ainda documentava `testApi` como "exposta só com
  `--sigaa-dev` (SEC-002)". Depois do diff isso é falso — o portão é
  `SIGAA_DEV_BRIDGE`. Este arquivo é justamente o que derivou do main e causou
  o `BUG-008` (regra 6 do `CLAUDE.md`); deixar a descrição errada aqui é o
  mesmo modo de falha em escala menor. Sem cenário de falha em runtime.

### Sem achado, registrado

- `main.ts:153` (`additionalArguments: ['--sigaa-dev']`) virou código morto:
  nada mais lê o token. Deixado de propósito. O teste usa o valor real de
  `additionalArguments` como entrada adversarial na leg empacotada
  (`loadPreload([...productionArgs, ...devArgs])`); removê-lo esvaziaria essa
  asserção ou obrigaria a voltar com um literal, que foi o achado A1 do audit.
  Custo de manter: zero em runtime.
- Vazamento de `SIGAA_DEV_BRIDGE=1` para processos filhos do main em dev
  (Playwright/Chrome, `execSync`). Nenhum consumidor no repositório;
  `grep` por `SIGAA_DEV` fora de `.scratch/` só encontra os três pontos do diff.
- `delete` no ramo empacotado cobre também o caso de o usuário exportar a
  variável no shell antes de abrir o app empacotado. Testei mentalmente o
  contrário — o main apaga antes de qualquer janela existir.
- `preload-dev-gate.test.ts:81` ainda se chama "com `--sigaa-dev`", entrada que
  hoje não significa nada. As asserções do arquivo (`api` sem simulação e sem
  IPC genérico) continuam válidas e o cabeçalho já aponta para DEV-001.
- Só existe um `new BrowserWindow` no repositório, depois do bloco do sinal.

### Gate em `2a31b0e` + correção

```text
tsc --noEmit: ok
eslint: 0 errors, 67 warnings (no-explicit-any legado)
vitest: Test Files 41 passed (41) · Tests 503 passed | 4 skipped (507)
```

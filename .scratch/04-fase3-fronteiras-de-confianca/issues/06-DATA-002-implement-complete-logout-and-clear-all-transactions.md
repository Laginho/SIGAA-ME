# DATA-002 — Implement complete logout and clear-all transactions
Status: resolved
Priority: P1
Blocked by: DATA-001
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `DATA-001`. (`CONC-001` was listed here and lists this task as
  its blocker — a cycle. Broken on 2026-09-06 by the spec session: this task
  ships the **minimal** cancellation it needs, `CONC-001` replaces it later.
  See "Decisions", 1.)
- Primary files (corrected 2026-09-06 by the spec session; see Contract):
  - `electron/ipc/register-handlers.ts` — the `logout` and `clear-all-data`
    handlers become the two transactions; `IpcDeps` grows
  - `electron/main.ts` — wires the new deps (`cache`, `logger`,
    `userDataPath`, `resetAppLog`, `clearBrowserStorage`); the file logger
    becomes resettable
  - `electron/services/background-sync.service.ts` — `cancel()`
  - `electron/services/sigaa.service.ts` — `logout()` forgets the Playwright
    session; new `clearDiagnostics()`
  - `electron/services/playwright-login.service.ts` — new `logout()`
    (`close()` is unchanged on purpose)
  - `electron/services/http-scraper.service.ts` — new `resetLog()`
  - `electron/services/persistence.service.ts` — `reset()`;
    `clearCredentials()` propagates failures
  - `electron/services/cache.service.ts` — `clear()`
  - `electron/services/logger.service.ts` — `clear()` already exists
  - `src/pages/dashboard.ts` — single sync listener, result-driven logout and
    clear-all, no double-click confirmation
  - `src/data/account-storage.ts` — unchanged (`clearAllLocalData` stays)
  - ~~`src/data/session-store.ts`~~ — does not exist; DATA-001 made
    `account-storage.ts` the only storage module
  - New: `tests/integration/clear-all-data.test.ts`,
    `tests/integration/background-sync-cancel.test.ts`,
    `tests/unit/dashboard-session-actions.test.ts`,
    `tests/e2e/clear-all.spec.ts`; extended: `tests/unit/persisted-schemas.test.ts`,
    `tests/unit/playwright-lifecycle.test.ts`, `tests/unit/sigaa-service.test.ts`

#### Logout transaction

1. Cancel background synchronization.
2. Wait for the active session operation to reach a safe boundary.
3. Close browser contexts and clear in-memory cookies.
4. Clear remembered credentials.
5. Clear active account/catalog context.
6. Unsubscribe renderer listeners.
7. Clear sessionStorage.
8. Preserve only inaccessible account-scoped cache if the product chooses to
   support fast return for the same account.

#### Clear-all transaction

In addition to logout, remove:

- All backend account caches.
- All renderer account namespaces.
- Settings and in-memory settings state.
- Download history metadata.
- Notification/read state.
- Browser storage for the application partition.
- Logs and diagnostic captures.

Downloaded documents outside Electron `userData` must not be deleted silently.
The confirmation UI must state that explicitly.

#### Acceptance criteria

- The handler returns success only after deletion completes.
- A restart after clear-all behaves like first launch.
- Clear-all cannot race a background write that recreates deleted state.
- Partial deletion returns a specific storage error and records safe recovery
  instructions.

#### Verification

```text
npx vitest run tests/integration/clear-all-data.test.ts tests/integration/background-sync-cancel.test.ts tests/unit/dashboard-session-actions.test.ts tests/unit/persisted-schemas.test.ts tests/unit/playwright-lifecycle.test.ts tests/unit/sigaa-service.test.ts
npm run quality
npx vite build && npx playwright test clear-all.spec.ts      # Windows; no credential needed
```

---

## What is actually there today (spec session, 2026-09-06)

Read before the contract; each line is a gap the tests below close.

- **`logout` handler** = `persistence.clearCredentials()` +
  `sigaaService.logout()`. The latter resets the HTTP scraper, nulls the active
  account and calls `playwrightLogin.close()`. `close()` releases the browser
  but **keeps `storedCookies`, `storedUsername` and `storedPassword`**, and
  `reloginWithStoredCredentials()` logs back in with them without passing
  through `SigaaService.login`. After "Sair", an in-flight sync (or the next
  `getCourses`) relaunches Chrome with the cookies and the password of the
  person who just left.
- **`clear-all-data` handler** is byte-for-byte the logout handler. Nothing
  under `userData` is removed: `cache.json`, `settings.json`, `sigaa-me.log`,
  `scraper.log`, `logs/app_*.log`, `debug_*.html|json`. `CacheService` and
  `PersistenceService` keep their in-memory state, so the next `saveCache()`
  or `saveSettings()` recreates the files. Electron's session storage is not
  touched. The renderer wipes `localStorage`/`sessionStorage` itself and
  **ignores the handler's result** (`try { await clearAllData() } catch {
  console.error }` — CLAUDE.md rule 3).
- **Confirmation** is a double-click on 🗑️ with a 4s toast that says nothing
  about downloaded files.
- **Background sync** has no cancellation at all; `isSyncing` only prevents
  two runs at once. The `BackgroundSyncService` is not even in the logout
  handler's deps.
- **`renderDashboardPage`** subscribes `onBackgroundSyncUpdate` on every mount
  and never unsubscribes: each visit to the dashboard adds one more listener,
  so one sync event is merged and toasted N times.
- **`clearCredentials()`** swallows `unlink` failures with `console.error`, so
  a logout can "succeed" with the credential file still on disk — and
  auto-login as the previous account on the next boot.

## Decisions (grilled with Bruno, 2026-09-06)

1. **Cancellation: minimal flag, checked between courses.** `CONC-001` and
   this task blocked each other. `BackgroundSyncService.cancel()` sets a flag
   that the sync loop checks before each course and before publishing; logout
   and clear-all await it, so the wait is bounded by one course. `CONC-001`
   replaces the flag with the coordinator's `AbortSignal` and keeps the tests
   in `background-sync-cancel.test.ts` green.
2. **Confirmation lives in the main process, inside the handler.**
   `dialog.showMessageBox` with the downloads warning in `detail`; declining
   returns `CANCELLED` and nothing is touched. The renderer's double-click
   goes away. The E2E stubs the dialog exactly as `security-boundaries.spec.ts`
   does.
3. **After clear-all the app stays open and returns to the login page.** Main
   resets its in-memory state (cache, settings to defaults, log streams
   reopened, scheduler restarted) and answers `ok()`; the renderer wipes its
   storage and navigates. No `app.relaunch()`.

Made by the spec session without asking (conservative, each pinned by a test):

- Logout does **not** stop the scheduler — settings still say
  `runInBackground`; without a credential file `syncNow()` no-ops.
- Logout keeps the account-scoped renderer cache (DATA-001's "fast return").
- The renderer, on a `STORAGE` failure from clear-all, still wipes its own
  storage and returns to login, after showing the recovery message. On
  `CANCELLED` it does nothing.
- Order of the destructive part is free, but **nothing destructive happens
  before the session is closed**, and the credential file goes first.

## Contract

### `BackgroundSyncService` (`background-sync.service.ts`)

- `cancel(): Promise<void>`. Resolves immediately when no run is in flight.
  Otherwise requests cancellation and resolves only when the in-flight
  `syncNow()` has stopped. A cancelled run: fetches no further course, sends
  no `background-sync-update`, shows no OS notification, commits no baseline
  (`cacheService.updateCourseState` not called) and does not write
  `lastBackgroundSync`. Whatever it already fetched is dropped — the next run
  re-diffs and the renderer dedupes notification ids.
- After `cancel()` resolves, the next `syncNow()` runs normally (the flag does
  not leak across runs).
- The check happens at least before each course's `getCourseFiles` (after the
  pacing delay is fine) and before the publish/commit block.

### `PlaywrightLoginService` (`playwright-login.service.ts`)

- New `logout(): Promise<void>`: `close()` **plus** forget `storedCookies`
  (→ `[]`), `storedUsername` and `storedPassword` (→ `null`). Afterwards
  `getCookies()` returns `[]`, `reloginWithStoredCredentials()` returns
  `{ success: false, error: 'No stored credentials available' }` and
  `getCourses()` fails without launching a browser.
- `close()` is **unchanged**: `getCourses()` calls `close()` and relaunches
  with `storedCookies`; clearing them there would break every sync.

### `HttpScraperService` (`http-scraper.service.ts`)

- New `resetLog(): void`: ends the current `scraper.log` write stream and opens
  a fresh one with `flags: 'w'` (truncate). Same state as first launch.

### `SigaaService` (`sigaa.service.ts`)

- `logout()` calls `playwrightLogin.logout()` (not `close()`), still resets
  the HTTP session and nulls the active account.
- New `clearDiagnostics(): void` → `httpScraper.resetLog()`.

### `PersistenceService` (`persistence.service.ts`)

- `clearCredentials()` **propagates** the `unlink` failure (no more
  `console.error` swallow). Absent file is still not an error.
- New `reset(): void`: in-memory settings back to `DEFAULT_SETTINGS`
  **before** touching the disk, then remove `settings.json` and
  `credentials.json` (absent is fine). A disk failure propagates, but the
  in-memory reset has already happened, so a later `saveSettings()` never
  resurrects old values.

### `CacheService` (`cache.service.ts`)

- New `clear(): void`: in-memory cache back to `{ schemaVersion: 2, accounts: {} }`
  **before** removing `cache.json` (absent is fine). Failure propagates. A
  later `updateCourseState()` writes a file containing only the new bucket.

### `LoggerService` — `clear()` already truncates `sigaa-me.log`. Unchanged.

### `electron/main.ts`

- The file logger (`logs/app_<ts>.log`) becomes resettable:
  `resetAppLog(): Promise<void>` closes the current stream (await `finish`),
  removes the whole `logs/` directory, recreates it and opens a new stream
  with a fresh name; the `console.*` wrappers write to the new stream. This is
  what makes the deletion safe on Windows, where an open handle blocks
  `unlink`.
- `registerIpcHandlers` receives, in addition to today's deps:
  `cache: cacheService`, `logger`, `userDataPath: app.getPath('userData')`,
  `resetAppLog`, `clearBrowserStorage: () => session.defaultSession.clearStorageData()`,
  and `backgroundSync` now exposes `stop`, `start` and `cancel` too.

### `IpcDeps` (`register-handlers.ts`)

```ts
sigaaService: Pick<SigaaService, ... | 'logout' | 'clearDiagnostics'>;
persistence: Pick<PersistenceService, ... | 'clearCredentials' | 'reset'>;
backgroundSync: Pick<BackgroundSyncService, 'restart' | 'stop' | 'start' | 'cancel'>;
cache: Pick<CacheService, 'clear'>;
logger: Pick<LoggerService, 'clear'>;
userDataPath: string;
resetAppLog: () => Promise<void>;
clearBrowserStorage: () => Promise<void>;
```

`tests/unit/ipc-validation.test.ts` builds an `IpcDeps` by hand; the
implementer adds the new fields there (typecheck), nothing else in that file
changes.

### `logout` handler

Order: `persistence.clearCredentials()` → `await backgroundSync.cancel()` →
`await sigaaService.logout()`. Credential first so that no new sync can start
in the gap (`syncNow` aborts on `loadCredentials() === null`). Does **not**
call `stop`, `cache.clear`, `persistence.reset`, `resetAppLog` or
`clearBrowserStorage`. Each step is attempted even if an earlier one threw; a
throw anywhere makes the result `fail('STORAGE', <error text>)` — the session
is still closed, but the renderer must know the credential is still on disk.

Build these failures with `fail('STORAGE', ...)`, not `failFromMessage`: its
regex classifies any message containing "credentials" as `SESSION_EXPIRED`
(that is what the current handler returns for a failed `clearCredentials`).

### `clear-all-data` handler

1. `dialog.showMessageBox(win, opts)` with `type: 'warning'`,
   `buttons: ['Apagar tudo', 'Cancelar']`, `defaultId === cancelId === 1`,
   `title: 'Limpar todos os dados'`, `message: 'Apagar todos os dados locais do SIGAA-ME?'`,
   `detail` that names what goes ("credenciais salvas, cache de disciplinas,
   notificações, configurações e logs desta máquina, de todas as contas") and
   ends with **"Os arquivos baixados na sua pasta de downloads não serão
   apagados."** `response !== 0` → `fail('CANCELLED', 'Limpeza cancelada.')`
   and no dep is called.
2. Close the session, in this order: `persistence.clearCredentials()`,
   `backgroundSync.stop()`, `await backgroundSync.cancel()`,
   `await sigaaService.logout()`.
3. Only then, destructive steps — each attempted even if another threw:
   `cache.clear()`, `persistence.reset()`, `logger.clear()`,
   `sigaaService.clearDiagnostics()`, `await resetAppLog()`, remove every
   entry of `userDataPath` whose name starts with `debug_`
   (`fs.readdirSync` + `fs.unlinkSync`, sync `fs` like the rest of the
   process), `await clearBrowserStorage()`.
4. If `getSettings().openAtLogin` was `true` before the reset,
   `app.setLoginItemSettings({ openAtLogin: false, ... })` (same `path`/`args`
   shape as `update-app-setting`). Calling it unconditionally is acceptable.
5. `backgroundSync.start()` — first-launch behaviour: scheduler on with default
   settings, no credential → it no-ops.
6. Result: `ok()` only after every awaited step resolved. If any step threw:
   `fail('STORAGE', message)` where `message` contains the text of every
   failure **and** the `userDataPath`, and tells the user to close the app and
   delete that folder by hand. Also `console.error` each failure (that goes to
   the fresh app log).

### Renderer (`src/pages/dashboard.ts`)

- One live sync listener at a time: a module-level unsubscribe is called
  before re-subscribing on mount and on logout/clear-all. Mounting the
  dashboard twice and firing one update merges and toasts once.
- **Logout click**: `const r = await window.api.logout()`; if `!r.success`,
  `toast.error(r.error.message)`. In every case: unsubscribe,
  `clearActiveAccount()`, `location.hash = '#/login'`. Account-scoped
  `localStorage` is kept.
- **Clear-all click**: a single click calls `window.api.clearAllData()` — no
  double-click, no `dataset.confirming`. On `success`: unsubscribe,
  `clearAllLocalData()`, `toast.success(...)`, then `#/login` (a short delay
  for the toast is fine; the test advances timers by 2s). On
  `error.code === 'CANCELLED'`: nothing changes, no toast. On any other
  failure: `toast.error(r.error.message)`, then the same wipe and navigation
  as success.

### E2E (`tests/e2e/clear-all.spec.ts`, no credential)

Launches the real app with a temporary `userData`, stubs
`dialog.showMessageBox` from main, plants the DATA-001 session/courses
fixture and files under `userData` (`cache.json`, `logs/app_old.log`,
`debug_*.html`, marker text in `sigaa-me.log`/`scraper.log`), sets a
non-default theme through `window.api.updateSetting`, then: declining leaves
everything; accepting removes the files, empties the renderer storage,
returns the live process' settings to defaults and lands on the login page
with no console error. It is the only test that exercises the open-handle
log deletion on Windows; run it there before closing.

## Test map

| Criterion / behaviour | Test |
|---|---|
| Dialog gate, wording, CANCELLED touches nothing | `clear-all-data.test.ts` › clear-all-data › confirmation |
| Session closed before anything destructive; credential first; `start()` last | `clear-all-data.test.ts` › order |
| Every store, capture and partition; `ok()` only after async steps | `clear-all-data.test.ts` › removes everything / returns only after |
| OS login item disabled | `clear-all-data.test.ts` › login item |
| Partial failure → `STORAGE` with error text + `userDataPath`, other steps still run | `clear-all-data.test.ts` › partial failure |
| Logout order; scheduler untouched; `STORAGE` on credential failure | `clear-all-data.test.ts` › logout |
| `login-request` without remember-me reports a stuck credential | `clear-all-data.test.ts` › login-request |
| `cancel()` semantics (in-flight, idle, no leak, resolves after stop) | `background-sync-cancel.test.ts` |
| `CacheService.clear()`, `PersistenceService.reset()`, `clearCredentials()` throws | `persisted-schemas.test.ts` › DATA-002 |
| Playwright `logout()` forgets session; `close()` still keeps it | `playwright-lifecycle.test.ts` |
| `SigaaService.logout()` → `playwrightLogin.logout()`; `clearDiagnostics()` | `sigaa-service.test.ts` › DATA-002 |
| Single listener; logout/clear-all renderer outcomes per result code | `dashboard-session-actions.test.ts` |
| First-launch state on disk and in the live process (Windows handles) | `clear-all.spec.ts` |

Red today, for the right reasons: `cancel`, `reset`, `clear`, `logout` (on
`PlaywrightLoginService`), `clearDiagnostics` do not exist; the handlers call
none of the new deps; the dashboard still double-clicks and ignores results.

#### Implementation notes

- Commit: `fe0594d` (implementação + correções da revisão)
- Stores cleared: credentials.json, cache.json, settings.json, sigaa-me.log,
  scraper.log, `logs/` (whole dir, reopened), every `debug_*` under
  `userData`, and `session.defaultSession.clearStorageData()` for the
  renderer partition.
- Intentionally preserved data: downloaded documents only.
- `npx tsc --noEmit`, `npx eslint .` (0 errors, pre-existing warnings only)
  and `npx vitest run` all green (435 passed, 4 skipped).
- Two pre-existing tests needed fixing as a side effect of this contract,
  both outside the "Primary files"/"New/extended tests" list above:
  - `tests/unit/persisted-schemas.test.ts` had a scope bug (`DEFAULTS`
    declared inside a sibling `describe`, unreachable from the new
    `DATA-002 — clearing the stores` block) — hoisted the constant to module
    scope; not a production-code issue.
  - `tests/unit/account-context.test.ts` (DATA-001) asserted
    `SigaaService.logout()` calls `playwrightLogin.close()`; the DATA-002
    contract explicitly moves that to `playwrightLogin.logout()`, so the
    mock/assertion were updated to match (added a `logout` fake, asserted it
    instead of `close`).
- `login-request` handler (`register-handlers.ts`) also needed a fix not
  called out in the contract: with `rememberMe: false` it called
  `persistence.clearCredentials()` uncaught. That was safe while
  `clearCredentials()` swallowed its own errors; now that DATA-002 makes it
  propagate, an unlink failure there would reject the whole IPC call instead
  of returning `STORAGE`. Wrapped it in the same try/catch pattern as the
  `rememberMe: true` branch (this is exactly the `login-request` test in
  the test map).
- Not run here (Windows/E2E only, per this repo's tiers):
  `npx playwright test clear-all.spec.ts`, `npm run build`.

---

## Revisão (Opus, 2026-09-06)

Primeira cobaia do fluxo alternativo (Fable especifica, Sonnet implementa, Opus
revisa). O contrato foi seguido: ordem dos passos, `fail('STORAGE', ...)` em vez
de `failFromMessage`, `attempt()` rodando todo passo mesmo depois de um throw,
dialog no main com o aviso sobre os downloads, `cancel()` como flag entre
disciplinas, um listener vivo por vez no dashboard. Cadeia de chamadores subida
para tudo que o diff toca; o que não virou achado está em "Observações".

**Dois achados, ambos com cenário concreto, ambos corrigidos aqui com teste que
falha sem a correção.**

1. **`HttpScraperService.resetLog()` não truncava `scraper.log`.** O `end()` do
   stream antigo não era aguardado: o handle novo (`flags: 'w'`) truncava, e o
   antigo terminava de descarregar o buffer **depois**, no offset antigo.
   Medido em `node` no Windows: um log com ~6 MB pendentes voltava a 6 MB com o
   conteúdo velho intacto — `clear-all-data` devolvendo `ok()` e deixando o
   diagnóstico da conta anterior no disco. Reproduzido com 20k linhas em
   `tests/unit/log-reset.test.ts` (`expected 1920000 to be less than 1024` sem
   a correção). `resetLog()` virou `Promise<void>` e `clearDiagnostics()`
   devolve a promise; o `await attempt(...)` do handler já a aguardava, então
   nada mais mudou. O E2E não pegava isso: ele planta uma linha só, que o SO
   descarrega na hora.

2. **`LoggerService.clear()` engolia a falha do `writeFileSync`** (rule 3 do
   CLAUDE.md). O contrato o congelou como "unchanged", mas o único chamador é o
   `clear-all-data`, dentro de `attempt()`, e o critério de aceite é "exclusão
   parcial devolve erro de armazenamento": com `sigaa-me.log` travado, o app
   dizia "Dados locais removidos." com o log intacto. O `try/catch` saiu (o
   `write()` continua com o dele, ali engolir é o certo).

Gate na branch, no Windows: `tsc` limpo, lint 0 erros / 71 warnings legados,
`437 passed | 4 skipped (441)` em 36 arquivos. `npx vite build` +
`npx playwright test`: **25 passed**, incluindo `clear-all.spec.ts` (3) — a
verificação que o implementador não pôde rodar — e, sem querer, os tiers com
credencial do `app.spec.ts`, que também passaram (login real; não repetir em
loop).

Observações, não defeitos:

- `syncNow()` atribui `this.currentRun` **depois** de chamar `runSync()`. Quando
  não há credencial, `runSync` termina inteiro de forma síncrona, o `finally`
  zera `currentRun` e a atribuição seguinte o deixa apontando para uma promise
  já resolvida. `cancel()` a aguarda e resolve na hora — sem trava, sem run
  errado, porque a atribuição sempre segue o start do run correspondente.
- O `win!` no `dialog.showMessageBox` não pode ser `null` na prática:
  `isTrustedSender` já rejeitou a chamada com janela nula, e não há `await`
  entre esse teste e o `getWindow()` do handler.
- `backgroundSync.start()` é o único passo fora de `attempt()`; um throw ali
  rejeitaria o IPC, e o dashboard não tem mais `try/catch`. `start()` só faz
  `clearInterval` + `getSettings()` + `setInterval`, então não é alcançável.
- `resetAppLog()` está correto no Windows apesar da aparência: medido em `node`,
  o callback do `end()` de um `fs.WriteStream` roda com o fd já fechado, e o
  `rmSync` do `logs/` passou 5/5 com 8 MB por iteração.
- Um download em voo não é cancelado por nenhuma das duas transações (só o
  background sync é). Fora do escopo desta tarefa; é problema do `CONC-001`.

Pendente (Bruno, manual): `npm run build` / empacotamento.

## Revisão cega (Fable)

Data: 2026-09-06. Sessão limpa; leu a issue só até "## Revisão (Opus", não
abriu PR nem ledger. Diff revisado: `git diff a92a3e1..fe0594d -- electron src
shared tests`. Além do diff, subiu a cadeia de chamadores de tudo que ele toca:
`sigaaService.logout()` (`before-quit` no `main.ts` também chama — agora esquece
cookies/credencial no encerramento, o que é o comportamento certo),
`syncNow()` (intervalo, tray "Sincronizar Agora", `simulateNewFile`),
`cacheService.updateCourseState` (só o `runSync`, então a única escrita que
poderia recriar `cache.json` é a que `cancel()` drena),
`persistence.loadCredentials()` (lê o disco a cada chamada, então "credencial
primeiro" de fato fecha a porta a um `syncNow` novo, inclusive um disparado
pela tray enquanto o dialog está aberto), o preload (`onBackgroundSyncUpdate`
devolve o `off`), a partição da janela (sem `partition`, logo
`session.defaultSession` é a certa) e o launch do Playwright (não persistente;
nada dele sobra em disco fora do que o handler apaga).

Rodado aqui, no Windows:

| O que | Resultado |
|---|---|
| `npm run quality` | verde: typecheck ok, ESLint 0 erros / 71 warnings (legado), `437 passed \| 4 skipped (441)` |
| `npx vite build` + `npx playwright test clear-all.spec.ts` | 3 passed (5.6s) — o teste do handle aberto no Windows, que a implementação não tinha rodado |

### Achado 1 — `resetAppLog` que falha no `rmSync` deixa o main sem log até reiniciar

`electron/main.ts`, `resetAppLog()`. A ordem é `await end()` → `rmSync(logsDir)`
→ `mkdirSync` → `logStream = openLogStream()`. Se o `rmSync` lançar, as duas
últimas linhas não rodam e `logStream` continua sendo o stream já encerrado.

Cenário concreto: qualquer arquivo dentro de `logs/` travado por outro processo
(um `app_*.log` antigo aberto num editor que segura o handle, ou antivírus
lendo) faz `rmSync` estourar com `EBUSY`/`EPERM` — `force: true` só ignora
`ENOENT`. A partir daí:

1. `attempt()` captura a exceção e chama `console.error('Reiniciar log do app
   falhou:', ...)`. O wrapper escreve em `logStream`, que está `ending` e já
   `destroyed` (o `end(cb)` dispara o callback dentro do `finish`, e o
   `autoDestroy` roda antes do microtask que continua o `await`). O Node
   responde `ERR_STREAM_WRITE_AFTER_END` e, como o stream já está destruído,
   `errorOrDestroy` retorna sem emitir nada: **a linha é descartada em
   silêncio**. Verificado em script isolado (Node 24; a semântica é a mesma no
   Node 20 do Electron 30).
2. O mesmo vale para todo `console.log/error/warn` do processo main dali até o
   próximo boot — inclusive o `[BackgroundSync] Starting sync scheduler` do
   `start()` logo em seguida, e qualquer erro real que aconteça depois. O
   terminal ainda recebe (o `originalConsole*` roda antes), mas o arquivo não.
3. O handler devolve `STORAGE` com o texto certo e o `userDataPath`, então o
   critério "exclusão parcial devolve erro de armazenamento" está cumprido.
   O que cai é o parágrafo do Contract que diz que cada falha vai
   `console.error` "para o log novo do app": nessa falha específica não existe
   log novo, e a única evidência da causa fica no toast de 2s do renderer.

Correção esperada (não aplicada — revisão não toca código): `try { rmSync }
finally { mkdirSync(...); logStream = openLogStream(); }`, ou o
`mkdirSync`/`openLogStream` antes de relançar. Teste que falharia sem ela:
`resetAppLog` com `fs.rmSync` mockado para lançar, depois `console.log('x')`,
e assertar que o novo `app_*.log` existe e contém `x`. Hoje `main.ts` não é
importável em teste (efeitos colaterais no import), então a prova cabe ou num
`log-reset.test.ts` que extraia `resetAppLog` para um módulo, ou como
observação manual.

Observação ligada, sem cenário concreto neste fluxo: entre o `end()` e o
`finish` do stream (`writable === false`, `destroyed === false`), um
`console.*` de qualquer lugar do main emite `'error'` no `logStream`, que não
tem listener, e vira **exceção não tratada no processo main** (verificado no
mesmo script: `UNCAUGHT: ERR_STREAM_WRITE_AFTER_END`). No clear-all essa
janela é praticamente vazia — agendador parado, sync drenado, Playwright já
fechado, renderer preso no `invoke` — por isso não conta como achado. O
`HttpScraperService.log()` já se protege com `if (this.logStream.writable)`;
o wrapper de `console.*` do `main.ts` não. A mesma correção (guardar por
`writable` ou dar um `on('error')` ao stream) cobre os dois.

### Sem achado, mas conferido de propósito

- **Ordem dos passos e falha parcial** (o que o fluxo alternativo pediu para
  olhar com mais desconfiança): credencial → `stop` → `cancel` → `logout` →
  destrutivo → `start`; cada passo em `attempt`, resultado só depois de todo
  `await`. A leitura de `openAtLogin` acontece antes do `reset()`. Nada
  destrutivo antes de a sessão fechar.
- **`cancel()` não vaza**: `cancelRequested` volta a `false` depois do `await
  run`; qualquer `syncNow()` novo vem de timer/IPC (macrotask), então não
  consegue entrar entre o `finally` do `runSync` e a continuação do `cancel`.
  Um `cancel()` durante a fase de login/`getCourses` deixa o run terminar essa
  fase e sair na primeira checagem do loop — o Contract permite isso
  explicitamente.
- **Fora do `attempt`** no clear-all ficam `dialog.showMessageBox`,
  `getSettings()`, `app.setLoginItemSettings` e `backgroundSync.start()`; o
  `handle()` não captura exceção, e o `click` do renderer perdeu o `try/catch`.
  Nenhum desses tem caminho de `throw` que eu consiga provocar, então não é
  achado.
- **Fetch em primeiro plano em voo durante o logout/clear-all** (um
  `get-course-files` iniciado antes do clique): não escreve em `cache.json`
  (só o `runSync` escreve) e é o escopo que a Decisão 1 deixou para o
  `CONC-001`.

Resultado: **1 achado**, severidade baixa, não bloqueia o fechamento; entra
como correção pequena ou como nota para o `CONC-001`, que vai mexer no mesmo
trecho.

### Fechamento do achado 1 (2026-09-06)

Corrigido direto na branch, sem loop (trivial): `rmSync` em `try/finally` que
sempre reabre o stream, e os wrappers de `console.*` guardam por
`logStream.writable`, como o `HttpScraperService.log()` já fazia. Sem teste
automatizado: `main.ts` não é importável em teste; fica como nota para quando
`resetAppLog` sair para um módulo (`CONC-001` mexe no trecho).

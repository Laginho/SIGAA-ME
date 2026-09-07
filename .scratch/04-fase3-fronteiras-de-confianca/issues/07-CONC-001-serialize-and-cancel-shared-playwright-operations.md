# CONC-001 — Serialize and cancel shared Playwright operations
Status: claimed
Priority: P1
Blocked by: DATA-002 (resolved 2026-09-06)
Tracker status at migration: `NOT STARTED`

- Owner: spec session (Fable), 2026-09-06; implementation goes to Sonnet, review to Opus (alternative flow, second subject after `DATA-002`)
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files (corrected 2026-09-06 by the spec session; see Contract):
  - New: `electron/services/session-operation-coordinator.service.ts` —
    `SessionOperationCoordinator` and the `OperationKind` type
  - `electron/services/sigaa.service.ts` — `busyCount` goes; every public
    method that touches Playwright runs inside `this.operations.run(...)`;
    cancellation checks in the loops
  - `electron/services/background-sync.service.ts` — `cancelRequested` flag
    goes; `runSync` receives the coordinator's `AbortSignal`
  - ~~New: `shared/operation.ts`~~ — not needed: the renderer never sees an
    operation kind. The type lives next to the coordinator.
  - ~~`electron/services/playwright-login.service.ts`~~,
    ~~`electron/main.ts`~~, ~~`src/pages/course-detail.ts`~~ — unchanged. The
    coordinator is owned by `SigaaService`, so `main.ts` wires nothing new;
    the IPC handlers call the same methods; the renderer already knows
    `CANCELLED` (see Decisions, 2).
  - New: `tests/unit/session-operation-coordinator.test.ts`
  - New: `tests/integration/background-sync-serialization.test.ts`
  - Extended: `tests/unit/sigaa-service.test.ts` (`session operations (CONC-001)`)
  - Fixtures only: `tests/integration/background-sync.test.ts`,
    `background-sync-account.test.ts`, `background-sync-cancel.test.ts` — the
    fake `SigaaService` gains `operations: new SessionOperationCoordinator()`

#### Required behavior

- Replace `busyCount`; it currently does not serialize work.
- Permit only one Playwright/session-mutating operation at a time.
- Represent operations as `interactive`, `background`, `auth`, or `shutdown`.
- Use `AbortSignal` for cancellation.
- Allow logout/clear-all to cancel queued work and wait for a safe boundary.
- Let interactive work cancel or supersede background work without corrupting
  cookies, ViewState, or page navigation.
- Check cancellation between courses, news items, retry attempts, and downloads.
- ~~Remove nonexistent renderer calls to `pauseSync()` and `resumeSync()`.~~
  **Feito no `BUG-002` (2026-09-01).** Registro: a proteção contra concorrência
  que o `pauseSync` fingia dar está **ausente e é conhecida** — nada serializa
  sync em background e ação do usuário sobre a mesma página Playwright até esta
  tarefa ser implementada. Ver `DÉBITO-03`.
- ~~Return `OPERATION_CANCELLED` rather than a generic failure.~~ Return
  `CANCELLED` (`shared/errors.ts` already defines it as "operação abortada";
  see Decisions, 2).
- **2026-09-06, from the DATA-002 spec:** the DATA-002 ↔ CONC-001 dependency
  cycle was broken in DATA-002's favour. DATA-002 adds
  `BackgroundSyncService.cancel()` — a flag checked between courses and
  before publishing, awaited by logout/clear-all. This task replaces that flag
  with the coordinator's `AbortSignal`; the behaviour to preserve is stated in
  `tests/integration/background-sync-cancel.test.ts`.

#### Acceptance criteria

- Background sync and course navigation cannot use the same Playwright page
  concurrently.
- Nested background calls do not deadlock by reacquiring the coordinator.
- Logout does not close a browser underneath an untracked operation.
- A cancelled background sweep does not publish partial data as a complete
  successful sync.

#### Verification

```text
npx vitest run tests/unit/session-operation-coordinator.test.ts tests/integration/background-sync-serialization.test.ts tests/unit/sigaa-service.test.ts tests/integration/background-sync.test.ts tests/integration/background-sync-account.test.ts tests/integration/background-sync-cancel.test.ts
npm run quality
```

(`npm run test:unit` / `test:integration` do not exist in `package.json`;
the file list above is the equivalent.)

---

## What is actually there today (spec session, 2026-09-06)

- **`SigaaService.busyCount`** is a counter with two log lines. Every public
  method does `startBusy()` / `stopBusy()` and nothing reads the count. Two
  callers — the background sync's `getCourseFiles` and an IPC
  `get-course-files` — navigate the same `this.page` of
  `PlaywrightLoginService` at the same time. `enterCourseAndGetHTML` reuses
  that single page on purpose (a fresh page gets "Acesso Negado"), so there is
  no per-caller isolation to fall back on.
- **`BackgroundSyncService.cancel()`** (DATA-002) is a boolean checked before
  each course and before publish, awaited by the `logout` and `clear-all-data`
  handlers. It stops the sync; it does nothing for an in-flight interactive
  operation — the Opus review of DATA-002 left "a download in flight is not
  cancelled by either transaction" to this task.
- **`SigaaService.logout()`** resets the HTTP session, nulls the active
  account and calls `playwrightLogin.logout()` immediately. A download or
  `loadAllNews` in flight sees the browser closed under it and fails with a
  message classified as `SESSION_EXPIRED`.
- **`before-quit`** in `main.ts` races `sigaaService.logout()` against 5s.
  Unchanged by this task; with the coordinator, that logout now also waits
  for the in-flight operation, still capped by the same 5s.
- Nothing distinguishes "cancelled" from "failed" in any result today.

## Decisions (spec session, 2026-09-06, without grilling — Bruno was not in the session)

Each one is pinned by a test; overturn one by changing its test.

1. **One coordinator, owned by `SigaaService`, acquired inside `SigaaService`.**
   `readonly operations: SessionOperationCoordinator` on the service;
   `BackgroundSyncService` uses `this.sigaaService.operations`. Acquisition
   happens inside each public `SigaaService` method (where `startBusy` was),
   not in the IPC handlers — so `register-handlers.ts` and `main.ts` do not
   change, and every caller (IPC, sync, tray, `before-quit`) is covered by
   construction. The sync's own calls into `SigaaService` are therefore
   **nested** `run`s; the coordinator makes them run inline (see Contract).
2. **`CANCELLED`, not a new `OPERATION_CANCELLED` code.** `AppErrorCode` already
   has `CANCELLED` documented as "O usuário cancelou (dialog fechado, operação
   abortada). Não é falha." — exactly this. The renderer already treats it as
   "not an error" on the clear-all path. Adding a second code for the same
   meaning would be a second thing for every consumer to handle.
3. **Aborted operations still run, with an aborted signal; the coordinator
   never fabricates a result.** `run<T>` cannot invent an `AppResult<T>`. A
   queued operation that gets aborted is still called when its turn comes and
   `fn` checks `signal.aborted` first thing. This keeps one uniform rule for
   `fn` ("check the signal at every boundary, including the first line") and
   zero special cases in the coordinator.
4. **`interactive` and `auth` abort `background`; `shutdown` aborts everything;
   `background` aborts nothing.** `auth` (login) is user-initiated and
   replaces the session, so a sync of the old session must not continue. The
   kind stays in the type for logging and for the day the two need to differ.
5. **FIFO within the slot.** No priority reordering: an aborted operation is a
   no-op, so letting it drain in order is simpler than a priority queue and
   costs one microtask.
6. **The interactive caller waits for the current course, not the current
   sync.** Cancellation is checked immediately before each
   `getCourseFiles`, so the wait is bounded by one Playwright course entry.
   The 2s pacing `setTimeout` is not abort-aware (would save at most 2s; not
   worth a listener).
7. **A cancelled `downloadAllFiles` returns `CANCELLED`, dropping the partial
   counts.** Files already written stay on disk and are skipped as duplicates
   next time. The alternative (an `ok` with partial `results`) would make a
   cancelled batch indistinguishable from a complete one — acceptance
   criterion 4 says no.
8. **Reentrancy through `AsyncLocalStorage`** (`node:async_hooks`, stdlib).
   A `run` issued from within a running operation's async context runs
   inline with that operation's signal. The one trap is a callback scheduled
   inside an operation that fires after it ended (it inherits the store):
   the coordinator must treat a **finished** stored operation as "no
   operation" and acquire normally. Pinned by the last nesting test.

## Contract

### `SessionOperationCoordinator` (`electron/services/session-operation-coordinator.service.ts`)

```ts
export type OperationKind = 'interactive' | 'background' | 'auth' | 'shutdown';

export class SessionOperationCoordinator {
  /** Waits for the slot, calls `fn(signal)`, returns/throws what `fn` did. */
  run<T>(kind: OperationKind, fn: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /** Aborts every operation of `kind` (running or queued); resolves when the running one, if of that kind, has finished. */
  cancel(kind: OperationKind): Promise<void>;
}
```

- **Single slot, FIFO.** At most one operation's `fn` is executing at any
  time. Operations start in the order `run` was called.
- **One `AbortController` per operation.** `fn` receives its signal, not
  aborted unless something aborted it (before or during the run).
- **On `run(kind)`:** `interactive` and `auth` abort every `background`
  operation (running or queued); `shutdown` aborts every operation of every
  kind; `background` aborts nothing. Then the new operation is queued.
- **`cancel(kind)`:** aborts every operation of `kind`; if the running
  operation is of that kind, resolves after its `fn` settled; otherwise
  resolves at once. Never rejects.
- **Nested `run`:** if called from inside a running operation's async
  context (`AsyncLocalStorage`), `fn` is called inline with the **outer**
  signal, and the requested `kind` has no effect (a nested `interactive`
  inside a `background` does not abort its caller). A stored operation that
  has already finished does not count as "inside": such a `run` queues
  normally.
- **Throws propagate** to the `run` caller and release the slot.
- **Not terminal:** after a `shutdown` finished, new operations run.
- No timers, no logging requirement, no Electron import — pure Node.

### `SigaaService` (`sigaa.service.ts`)

- `busyCount`, `startBusy`, `stopBusy` are removed.
- New `readonly operations = new SessionOperationCoordinator()`.
- Every public method that touches Playwright wraps its whole body:
  `getCourses`, `getCourseFiles`, `downloadFile`, `downloadAllFiles`,
  `getNewsDetail`, `loadAllNews` → `run('interactive', ...)`; `login` →
  `run('auth', ...)`; `logout` → `run('shutdown', ...)` (the whole body: HTTP
  reset, active account, `playwrightLogin.logout()`). `clearDiagnostics` is
  not an operation.
- Cancellation checks, each returning `fail('CANCELLED', <message>)` without
  touching Playwright or HTTP afterwards:
  - first line of every wrapped method (covers "queued then aborted");
  - `downloadAllFiles`: before each file of the main loop, before each retry
    attempt, before each Playwright fallback;
  - `downloadFile`: before the retry re-entry (step 4) and before the
    Playwright fallback;
  - `loadAllNews`: before each `getNewsDetail`.
- The message text is free (`'Operação cancelada.'` is fine); tests assert
  the code only.

### `BackgroundSyncService` (`background-sync.service.ts`)

- `cancelRequested` and `currentRun` go. `syncNow()` returns
  `this.sigaaService.operations.run('background', signal => this.runSync(settings, signal))`
  (still guarded by `isSyncing`; `isSyncing` is cleared in `runSync`'s
  `finally` as today).
- `runSync(settings, signal)` checks `signal.aborted` and returns: at the
  very start; **immediately before each `getCourseFiles`** (after the 2s
  pacing delay); before each `getNewsDetail` of the auto-fetch loop; before
  the publish/commit block. A cancelled run publishes nothing, commits
  nothing and does not write `lastBackgroundSync` (unchanged from DATA-002).
- `cancel()` → `return this.sigaaService.operations.cancel('background')`.
  The four tests in `background-sync-cancel.test.ts` stay green unchanged
  (fixture only).

### Unchanged on purpose

`register-handlers.ts` (logout still does `clearCredentials → cancel →
logout`; the `cancel` is now redundant with the `shutdown` and harmless),
`main.ts`, `playwright-login.service.ts`, the renderer, `shared/*`.

## Test map

| Criterion / behaviour | Test | Red today? |
|---|---|---|
| One at a time, FIFO, return value, throw releases slot, signal shape | `session-operation-coordinator.test.ts` › one operation at a time | yes (module missing) |
| interactive/auth abort running and queued background and wait; background aborts nothing; shutdown aborts all, waits, not terminal | › priority between kinds | yes |
| `cancel(kind)` semantics (running, idle, queued) | › cancel(kind) | yes |
| Nested run inline with outer signal; finished-op callback acquires fresh | › nesting | yes |
| Background sync and course navigation never share the page (`inFlight.max === 1`); cancelled sweep publishes nothing | `background-sync-serialization.test.ts` › user while sync / sync while user | yes |
| Logout waits for the course in flight, closes the browser after | › logout during a sync | yes |
| Nested background calls do not deadlock | › the sync alone completes | green today (guard) |
| `cancel()` still drains through the coordinator | › DATA-002 contract kept | green today (guard) |
| Two interactive calls serialize; `downloadAllFiles`/`downloadFile`/`loadAllNews` stop at the boundary with `CANCELLED`; queued op behind logout is `CANCELLED` without Playwright | `sigaa-service.test.ts` › session operations (CONC-001) | yes |
| DATA-002 `cancel()` semantics preserved | `background-sync-cancel.test.ts` (fixture gains `operations`) | yes (import) |

Red today, for the right reasons: `session-operation-coordinator.service.ts`
does not exist (every file that imports it fails to load); with a stub module
the serialization tests would fail because the second caller enters the page
while the first is still on it, and the `SigaaService` tests because `logout`
closes the browser immediately and nothing returns `CANCELLED`.

#### Implementation notes

- Commit: —
- Queue policy: —
- Cancellation boundaries: —

# DEV-001 — Remove production developer cache mutation actions
Status: claimed
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

- [ ] **AC1 — Packaged surface:** with `app.isPackaged === true`, the tray
  contains only the existing ordinary actions `Abrir SIGAA-ME`,
  `Sincronizar Agora`, and `Sair`, plus separators. No developer simulation
  action is present. `test-simulate-new-file` is not registered.
- [ ] **AC2 — Flag is insufficient:** after a packaged main launch, the preload
  exposes neither `testApi` nor any simulation member on `api`, including when
  its argv explicitly contains `--sigaa-dev`. Cover both `NODE_ENV=production`
  and `NODE_ENV=development`. Absence of the flag remains safe. Loading the
  preload must not mutate cache or trigger a sync to discover its permissions.
- [ ] **AC3 — Development remains usable:** an unpackaged main launch without a
  Vite server still provides the explicit `testApi.simulateNewFile` bridge used
  by E2E, even under `NODE_ENV=production`. Retain the existing development tray
  action and registered handler. Calling the real bridge reaches the real
  handler and main simulation: it removes one file only from the active
  account, preserves news and other accounts, invokes sync, and returns `true`.
  No active account or no cached file returns `false` without invoking sync.
- [ ] **AC4 — Boundary constraints:** `window.api` stays typed as `RendererApi`
  without simulation or generic IPC; `window.testApi` stays optional with the
  existing boolean return contract. Preserve `sandbox: true`,
  `contextIsolation: true`, and `nodeIntegration: false`. Do not import main-only
  Electron `app` into the sandboxed preload. Authorization must derive from
  the actual main packaging state, with no simulation call as a capability probe.
- [ ] **AC5 — Scope and verification:** the two DEV-001 cases pass after the
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

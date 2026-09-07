# DEV-002 — Resolve userData paths after the dev isolation `setPath`
Status: resolved
Priority: P2
Dependencies: none (OBS-001 fixes the same defect for `logger.service.ts`)

- Owner: —
- Primary files:
  - `electron/services/cache.service.ts`
  - `electron/services/persistence.service.ts`
  - New: `tests/unit/userdata-late-binding.test.ts`

#### Problem

`electron/main.ts:20-25` calls `app.setPath('userData', '<name>-dev')` when
`!app.isPackaged` to keep development data away from the production folder.
`cacheService` and `persistenceService` are module singletons
(`export const x = new X()`) whose constructors called `app.getPath('userData')`
and read `cache.json` / `settings.json` from disk. ES imports are hoisted, so
both constructors ran before `setPath`. In dev, `cache.json`, `settings.json`
and `credentials.json` were read from and written to the **production**
`userData`. Evidence on the author's machine: `%APPDATA%\sigaa-me-dev` had no
`cache.json`/`settings.json` while `%APPDATA%\sigaa-me` did.

Consequences: a dev sync overwrites the production "already seen" baseline, a
dev "Remember me" writes `credentials.json` into the production folder, and
DATA-002's clear-all in dev deletes production files.

#### Required behavior

- Neither module calls `app.getPath` at import time.
- Every disk access in both services resolves `app.getPath('userData')` at the
  moment of use, so a `setPath` that runs after the import wins.
- The settings/cache in-memory state is loaded on first use, not in the
  constructor. Public API and singleton exports unchanged.

#### Acceptance criteria

- `tests/unit/userdata-late-binding.test.ts`: mock `electron` with a mutable
  `getPath`, import the singletons, assert `getPath` was not called; change the
  returned path; read and write through `cacheService` and `persistenceService`
  and assert the files land only under the new path. Fails at `52aa87a`.
- All existing `cache-service`, `persisted-schemas` and
  `persistence-auth-recovery` tests still pass.
- `npm run quality` green.

#### Out of scope (reported, not changed)

- `logger.service.ts:10` has the same defect; OBS-001 owns it (already lazy on
  branch `obs-001-logging`).
- `http-scraper.service.ts:56` fixes `scraper.log` under `userData` as a class
  field. `HttpScraperService` is built inside `SigaaService`'s constructor,
  which is also a module singleton imported by `main.ts`, so `scraper.log`
  also lands in production during dev. OBS-001 removes that log entirely.
- `main.ts:28` (`logsDir`) and `main.ts:125` (`userDataPath` passed to the
  handlers) run after the `setPath` block and are correct.

#### Resolution (2026-09-07)

- Decision: both path fields became getters that call `app.getPath` on each
  access; the loaded state became a lazily filled `loaded` field behind a
  getter (`this.loaded ??= this.loadX()`). `clear()`/`reset()` assign
  `loaded` directly. No constructor left in either class. No change to
  `main.ts`, no injection of the path: resolving on use is smaller and keeps
  every existing `new CacheService()` in tests working.
- Files: `electron/services/cache.service.ts`,
  `electron/services/persistence.service.ts`,
  `tests/unit/userdata-late-binding.test.ts`.
- Red-green proof: with `master`'s two service files checked out over the
  branch, the new test fails 3/3 (`getPath` called 3 times at import; cache
  read returns the empty baseline instead of the dev file; settings read
  returns `light` instead of the dev file's `dark`). With the fix, 3/3 pass.
- Gate: `tsc --noEmit` ok; `eslint .` 0 errors, 67 warnings (legacy
  `no-explicit-any`); `vitest run` Test Files 42 passed (42) · Tests 506
  passed | 4 skipped (510). One earlier full run had a single failure in
  `tests/integration/download-real.test.ts` ("traversal no nome do arquivo");
  it does not import either touched module and passed on five isolated reruns
  and on the following full run. Flaky, unrelated, not investigated here.
- Note for the phase ledger: `.scratch/05-fase4-prontidao-para-distribuicao/`
  has no `ledger.md` yet (DEV-001 and DL-002 also have no ledger row).

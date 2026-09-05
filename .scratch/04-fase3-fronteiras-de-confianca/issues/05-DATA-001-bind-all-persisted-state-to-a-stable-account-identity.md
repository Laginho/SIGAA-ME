# DATA-001 — Bind all persisted state to a stable account identity
Status: claimed
Priority: P1
Blocked by: SEC-003
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `ARCH-001`, `SEC-002`
- Primary files (corrected 2026-09-05 by the spec session; see Contract):
  - New: `electron/services/account-context.service.ts` — `deriveAccountId`,
    active account of the main process
  - New: `src/data/account-storage.ts` — the **only** renderer module that
    touches `localStorage`/`sessionStorage` (session + scoped items; there is
    no separate `session-store.ts`, one module avoids a circular import)
  - `electron/services/cache.service.ts` — `CacheFileV2`, `accountId` on every
    method
  - `electron/services/persistence.service.ts` — `schemaVersion: 1` +
    per-key validation of `settings.json`
  - `electron/services/background-sync.service.ts` — tags the update, writes
    the account bucket
  - `electron/services/sigaa.service.ts` — derives the id at login, sets the
    active account, invalidates the scraper session on account change
  - `electron/services/http-scraper.service.ts` — new `resetSession()`
  - `electron/main.ts` — `simulateNewFile` passes the active account
  - `shared/domain.ts` (doc of `AccountId`), `shared/ipc.ts`
    (`BackgroundSyncUpdate.accountId`)
  - `src/main.ts`, `src/pages/login.ts`, `src/pages/dashboard.ts`,
    `src/pages/course-detail.ts`, `src/pages/sync-selection.ts`,
    `src/utils/notification-store.ts`, `src/utils/ui-helpers.ts` — every raw
    storage call goes through `account-storage`
  - New tests (spec session): `tests/unit/account-context.test.ts`,
    `tests/unit/persisted-schemas.test.ts`, `tests/unit/account-storage.test.ts`,
    `tests/integration/account-isolation.test.ts`,
    `tests/integration/background-sync-account.test.ts`
  - Existing tests whose **fixtures** (not assertions) must move to the new
    keys/signatures: `tests/unit/cache-service.test.ts`,
    `tests/integration/background-sync.test.ts`, `tests/unit/course-detail.test.ts`,
    `tests/unit/dashboard-listener.test.ts`, `tests/unit/notification-store.test.ts`,
    `tests/unit/sync-selection.test.ts`, `tests/unit/renderer-content-security.test.ts`,
    `tests/unit/merge-courses-cache.test.ts`, `tests/unit/ui-helpers.test.ts`,
    `tests/unit/login-selector-failure.test.ts`, `tests/e2e/visual.spec.ts`,
    `tests/e2e/app.spec.ts`

#### Required schema

Backend cache:

```text
CacheFileV2
  schemaVersion: 2
  accounts[accountId]
    courses[courseId]
    updatedAt
```

Renderer keys:

```text
sigaa-me:v2:<accountId>:courses
sigaa-me:v2:<accountId>:downloads
sigaa-me:v2:<accountId>:notifications
sigaa-me:v2:<accountId>:read-items
sigaa-me:v2:<accountId>:photo
```

#### Required behavior

- Derive the same one-way account ID from normalized username for manual and
  automatic login.
- Never log the username or hash input.
- Make the account ID part of `AccountProfile` and background update events.
- Stop pages from reading or writing raw unscoped localStorage keys.
- Reject background events for a different account.
- Invalidate session catalogs when the active account changes.
- Quarantine or delete legacy cache because it cannot be safely attributed to
  an account.

#### Contract (spec session, 2026-09-05)

Read before writing: `electron/services/sigaa.service.ts` (`login`, `logout` —
the only choke point for manual login, auto-login and the background re-login),
`electron/services/cache.service.ts`, `electron/services/persistence.service.ts`
(`loadSettings`/`saveSettings`), `electron/services/background-sync.service.ts`
(the `send` and the deferred `pendingCommits` flush),
`electron/services/http-scraper.service.ts` (`cookies`, `courseData`),
`src/utils/ui-helpers.ts` (`mergeCoursesIntoCache`, the single writer of the
course cache), `src/utils/notification-store.ts`, `src/pages/dashboard.ts`
(`handleBackgroundSyncUpdate`, photo fallback, logout/clear buttons),
`src/main.ts` (router + auto-login), `src/pages/login.ts`,
`src/pages/sync-selection.ts` (photo), `src/pages/course-detail.ts`
(`downloadedFiles`). Test patterns to copy: `tests/unit/cache-service.test.ts`
(fs/electron mocks), `tests/unit/sigaa-service.test.ts` (class mocks),
`tests/integration/background-sync.test.ts`.

**Decisions**

1. **`AccountId` is `sha256(username.trim().toLowerCase())` as lowercase hex
   (64 chars), computed in main with `node:crypto`.** It replaces the raw
   username in `AccountProfile.id`: the renderer never learns the matrícula.
   Empty/whitespace username throws. No salt: a stored salt would not protect
   against a local reader, and the id must be reproducible across installs
   so account A finds its own cache again. Update the `AccountId` doc comment
   in `shared/domain.ts` accordingly ("hash do login", not "matrícula").
2. **Active account in main is module state in
   `electron/services/account-context.service.ts`**
   (`getActiveAccount(): AccountId | null`, `setActiveAccount(id | null)`),
   set only by `SigaaService.login` on success and cleared by
   `SigaaService.logout`. No listener/event abstraction: the three consumers
   (`SigaaService`, `BackgroundSyncService`, `main.ts` `simulateNewFile`) read
   it when they need it.
3. **Account change invalidates the scraper session.** `SigaaService.login`
   compares the new id with the previous active one; when different, it calls
   the new `HttpScraperService.resetSession()` (clears `cookies` and
   `courseData`) **before** `setCookies`. Same account again: no reset.
   Failed login: active account untouched, no reset. `logout()` calls
   `resetSession()` and sets the active account to `null`.
4. **`CacheService` takes `accountId` explicitly on every method**
   (`getCourseState(accountId, courseId)`, `updateCourseState(accountId,
   courseId, files, news)`, `diffCourseState(accountId, courseId, ...)`,
   `forgetLastFile(accountId)`). No hidden "current account" inside the
   cache. File shape:

   ```ts
   interface CacheFileV2 {
     schemaVersion: 2
     accounts: Record<AccountId, { courses: Record<CourseId, CourseState>; updatedAt: number }>
   }
   ```

   Load: a file without `schemaVersion === 2` (i.e. every v1 file, shape
   `{ [courseId]: CourseState }`) is **discarded** — decision "reset", not
   quarantine. It is only the seen-items baseline; the cost is one cold-start
   sync without notifications, and nothing in a v1 file says whose it was.
   Each account entry is validated (`courses` object, every state with
   `files`/`news` arrays of strings); an invalid entry is dropped, the rest
   is kept. The BUG-009 `555'` normalization goes away with v1: any v2 file
   is written after the parser fix. `cache-service.test.ts` keeps its cases
   with an `accountId` argument; the BUG-009 case becomes "v1 file is
   discarded".
5. **`settings.json` gets `schemaVersion: 1` and per-key validation.**
   `loadSettings` accepts a stored value only when it has the right type for
   its key (`theme` ∈ `light|dark`; the booleans; `syncInterval` a finite
   number > 0; `lastDownloadPath` string or null; `lastBackgroundSync`
   number); anything else falls back to that key's default. Unknown keys and
   `schemaVersion` never reach `getSettings()` (allowlist copy, SEC-002
   style). A pre-version file is read the same way — the flat shape does not
   change, so there is no migration, only the field on write.
6. **`BackgroundSyncUpdate.accountId: AccountId`.** The sync resolves
   `getActiveAccount()` once courses are in hand (after the re-login path, so
   it reflects whoever the session belongs to). `null` → log, skip the send
   **and** the baseline commit: a result nobody owns is not persisted. All
   cache calls in the loop use that id.
7. **Renderer: one module, `src/data/account-storage.ts`, is the only place
   that touches Web Storage.** Enforced by a text test over `src/**/*.ts`
   (comments count — reword them). Exports:

   ```ts
   export const SESSION_ACCOUNT_KEY = 'sigaa-me:v2:session:account'
   export type AccountStorageKey =
     | 'courses' | 'downloads' | 'notifications' | 'read-items' | 'photo' | 'sync-timestamp'
   export const LEGACY_KEYS: readonly string[]   // coursesWithFiles, cacheTimestamp, downloadedFiles, readItems, notificationsHistory, userPhotoUrl
   export function accountKey(accountId: AccountId, name: AccountStorageKey): string  // `sigaa-me:v2:${accountId}:${name}`
   export function setActiveAccount(profile: AccountProfile): void  // validates, stores in sessionStorage, then purgeLegacyStorage()
   export function getActiveAccount(): AccountProfile | null       // validated shape; legacy `sessionStorage.account` is ignored
   export function clearActiveAccount(): void                      // session only; scoped data stays
   export function readAccountItem(name: AccountStorageKey): string | null   // null when no active account
   export function writeAccountItem(name: AccountStorageKey, value: string): void  // throws when no active account
   export function removeAccountItem(name: AccountStorageKey): void
   export function purgeLegacyStorage(): void
   export function clearAllLocalData(): void   // localStorage.clear() + sessionStorage.clear(); the dashboard's 🗑️ button (DATA-002 refines)
   ```

   `sync-timestamp` is added to the issue's key list: `cacheTimestamp` is
   account data too (when *this* account's courses were synced). A valid
   profile id matches `/^[A-Za-z0-9_-]{1,64}$/` (the IPC id pattern; the
   sha-256 hex fits), `name` is a string. String in/out like `localStorage`,
   so callers keep their `JSON.parse` + `try/catch`.
8. **Legacy renderer data is deleted, not quarantined**, by
   `setActiveAccount` — the moment "another user logs in" from the
   acceptance criterion. Losing `downloadedFiles` only hides the ✅ markers
   until the next download/verification; `readItems`/`notificationsHistory`
   start empty (and the main baseline resets too, so no flood of "new"
   notifications).
9. **`handleBackgroundSyncUpdate` rejects an update whose `accountId` is
   missing or differs from `getActiveAccount()?.id`**, and any update when
   nobody is logged in: no cache write, no notification, no toast (a
   `console.warn` is fine). Positive control in the tests: a matching id
   still merges and notifies.
10. **Pages.** `src/main.ts` and `login.ts` call `setActiveAccount(profile)`
    on login success (manual and auto); the `#/dashboard` route uses
    `getActiveAccount()` and `readAccountItem('courses')`. `dashboard.ts`
    takes `AccountProfile`, reads the photo fallback from
    `readAccountItem('photo')`, logout → `clearActiveAccount()`, clear-all →
    `clearAllLocalData()`. `sync-selection.ts` stores the photo via
    `setActiveAccount({ ...account, photoUrl })` + `writeAccountItem('photo')`.
    `course-detail.ts` moves `downloadedFiles` to `downloads`.
    `ui-helpers.ts` (`mergeCoursesIntoCache`, `isNewsCached`) and
    `notification-store.ts` move to `courses`/`sync-timestamp`,
    `notifications`/`read-items`. `seedExistingItemsAsRead` reads the scoped
    `courses`.
11. **E2E fixtures** (`visual.spec.ts`, `app.spec.ts`) plant
    `sessionStorage[SESSION_ACCOUNT_KEY]` (an `AccountProfile` **with an
    `id`**, e.g. `'e2e-account'`) and `localStorage['sigaa-me:v2:e2e-account:courses']`
    instead of the legacy keys. Not automated in the loop; the reviewer runs
    `visual.spec.ts` once.

**Red today (2026-09-05)**, `npx vitest run` on the five new files:
`account-context.test.ts`, `account-storage.test.ts`,
`account-isolation.test.ts`, `background-sync-account.test.ts` fail at import
(the two new modules do not exist); `persisted-schemas.test.ts` fails 8 of 10
(`getCourseState('acc', 'c1')` treats the account as a course id, the file has
no `schemaVersion`, `getSettings()` leaks `junk` and a string `syncInterval`).
The two that pass are guards that already hold (corrupt `cache.json`,
well-typed legacy settings). Baseline of the suite before this task:
`353 passed | 4 skipped (357)` in 27 files.

#### Acceptance criteria

- Account B cannot view account A's courses, files, news, photo, notifications,
  read state, or download history — `account-isolation.test.ts` (through the
  production readers/writers, plus the dashboard photo fallback rendered for
  B) and `account-storage.test.ts`; on the main side `persisted-schemas.test.ts`
  (B's baseline is empty while A's is intact).
- Returning to account A may reuse only account A's namespaced cache —
  `account-isolation.test.ts` (A ↔ B ↔ A round trip, including
  `sync-timestamp`, notifications, read state, photo).
- Legacy unscoped data cannot appear after another user logs in — the six
  legacy keys are deleted by `setActiveAccount` (`account-storage.test.ts`)
  and a dashboard rendered for B shows none of it
  (`account-isolation.test.ts`); a v1 `cache.json` is discarded
  (`persisted-schemas.test.ts`).
- Cache and settings schemas are versioned and runtime-validated —
  `persisted-schemas.test.ts` (`schemaVersion: 2` / `schemaVersion: 1` on
  write, malformed entries dropped, wrong-typed settings fall back per key,
  unknown keys never reach `getSettings()`).
- The account id is the same one-way hash for manual and automatic login and
  never reaches a log — `account-context.test.ts` (both paths go through
  `SigaaService.login`; the log assertion spies `logger` and `console`).
- Background updates carry the account id and are rejected for another
  account — `background-sync-account.test.ts` (main side: tag + per-account
  cache calls, nothing sent without an active account) and
  `account-isolation.test.ts` (renderer side: foreign/untagged/no-session
  updates leave cache and notifications untouched).
- The scraper session catalog is invalidated on account change —
  `account-context.test.ts` (`resetSession` exactly once on A → B, never on
  A → A, also on logout).
- No file under `src/` other than `src/data/account-storage.ts` mentions
  `localStorage`/`sessionStorage` — `account-storage.test.ts`.

#### Verification

```text
npx vitest run tests/unit/account-context.test.ts tests/unit/persisted-schemas.test.ts tests/unit/account-storage.test.ts tests/integration/account-isolation.test.ts tests/integration/background-sync-account.test.ts
npm run quality
npx vite build && npx playwright test visual.spec.ts     # fixtures on the new keys still render every route
```

There is no `npm run test:unit`/`test:integration` (the migrated text
invented them). `test:e2e` in full needs `.env` and stays manual (Bruno).

#### Implementation notes

- Commit: — (tests + contract: spec session commit; implementation: —)
- Migration decision: **reset** — v1 `cache.json` discarded on load; the six
  legacy renderer keys deleted by `setActiveAccount`. No quarantine copy.
- Schema version: `cache.json` → 2 (`CacheFileV2`); `settings.json` → 1
  (flat shape unchanged, `schemaVersion` field added on write).

# Plan 002: Characterize the sync/notification pipeline with tests before changing it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 700de9a..HEAD -- electron/services/cache.service.ts electron/services/background-sync.service.ts src/utils/notification-store.ts`
> If any of these changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (test-only — zero production code changes)
- **Depends on**: none (but plans 003 and 004 depend on THIS)
- **Category**: tests
- **Planned at**: commit `700de9a`, 2026-08-28

## Why this matters

The three modules that decide "is this item new, and does the user get told"
have **zero test coverage**: `cache.service.ts` (the seen-items baseline),
`background-sync.service.ts` (the sync loop — the highest-churn untested
module in the repo), and `notification-store.ts` (read/unread state behind the
bell, the dots, and the badges). Plan 003 will change the ordering inside
`syncNow()`; doing that without a characterization suite repeats the exact
failure mode this repo has already documented (see `QA-003` in
`docs/HARDENING_TRACKER.md`). This plan adds tests only — it pins CURRENT
behavior, including three known quirks that plan 003 will then deliberately
change (each pinned test carries a comment saying so).

## Current state

Relevant files (read all three fully before writing tests — they are short):

- `electron/services/cache.service.ts` (67 lines) — JSON file in `userData`
  (`cache.json`); `getCourseState`, `updateCourseState`, `diffCourseState`.
- `electron/services/background-sync.service.ts` (242 lines) — `syncNow()`
  does: load creds → `getCourses()` (with a re-login retry) → per course:
  `getCourseFiles` → diff → **commit baseline** → build notifications →
  optional auto-download / news-content fetch → after the loop: one
  `webContents.send('background-sync-update', ...)` push + one OS notification.
- `src/utils/notification-store.ts` (169 lines) — pure localStorage module
  (renderer side).

Key excerpt — `diffCourseState` (`cache.service.ts:56-63`). Note the
`item.id &&` filter: **an item without `id` is never reported as new** (this
is how link-type materials become invisible; plan 003 addresses it):

```ts
public diffCourseState(courseId: string, currentFiles: any[], currentNews: any[]) {
    const cachedState = this.getCourseState(courseId);
    const newFiles = currentFiles.filter(item => item.id && !cachedState.files.includes(String(item.id)));
    const newNews = currentNews.filter(item => item.id && !cachedState.news.includes(String(item.id)));
    return { newFiles, newNews };
}
```

Key excerpt — the commit-before-delivery ordering in
`background-sync.service.ts:104-112` (plan 003 will reorder this; pin it now):

```ts
const cachedState = cacheService.getCourseState(course.id);
const isColdStart = cachedState.files.length === 0 && cachedState.news.length === 0;

const diff = cacheService.diffCourseState(course.id, currentFiles, currentNews);

// Always update the cache so subsequent syncs have a proper baseline
const allFileIds = currentFiles.map(f => String(f.id)).filter(id => id && id !== 'undefined');
const allNewsIds = currentNews.map(n => String(n.id)).filter(id => id && id !== 'undefined');
cacheService.updateCourseState(course.id, allFileIds, allNewsIds);
```

Key excerpt — the retry that discards `success`
(`background-sync.service.ts:66-75`; plan 003 fixes this; pin current behavior):

```ts
if (!coursesResult.success) {
    console.log('[BackgroundSync] Session expired or invalid. Attempting re-login...');
    const loginResult = await this.sigaaService.login(creds.username, creds.password);
    if (!loginResult.success) { ... return; }
    const retryCourses = await this.sigaaService.getCourses();
    courses = retryCourses.courses;   // <- .success is never checked
}
```

Key excerpt — the renderer push shape (`background-sync.service.ts:204-208`),
which `src/pages/dashboard.ts:183-227` consumes untyped:

```ts
window.webContents.send('background-sync-update', {
    courses: allCoursesData,
    notifications: newNotifications,
    timestamp: Date.now()
});
```

Key excerpt — the notification cap (`notification-store.ts:14`, `:122-124`).
Overflow past 15 is silently dropped, including from the read-tracking:

```ts
const MAX_NOTIFICATIONS = 15;
...
const merged = [...newItems, ...existing].slice(0, MAX_NOTIFICATIONS);
saveNotifications(merged);
```

`BackgroundSyncService` construction (`background-sync.service.ts:13-16`) —
fully injectable, which is what makes this testable:

```ts
constructor(sigaaService: SigaaService, getWindow?: () => BrowserWindow | null) {
```

It also imports two singletons at module level: `persistenceService` (needs
`getSettings`, `loadCredentials`, `updateSetting`) and `cacheService` — mock
both modules.

Repo conventions that apply:

- **Tests call production code, never a mirrored copy** — this rule exists
  because a mirrored parser hid a real bug under 14 green tests
  (`tests/fixtures/README.md`, tracker `QA-005`).
- Mock pattern exemplar: `tests/integration/persistence-auth-recovery.test.ts`
  (`vi.hoisted` state + `vi.mock('electron', ...)` + `vi.mock('fs', ...)`,
  then import the production class).
- Renderer (localStorage) tests use jsdom via a docblock:
  `// @vitest-environment jsdom` at the top of the file (see
  `vitest.config.ts` — default env is `node`).
- Vitest `globals: true` is on; `describe/it/expect` need no import, but the
  existing suites import them from `vitest` explicitly — match that.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Run one file | `npx vitest run tests/unit/cache-service.test.ts` | all pass |
| Full suite | `npx vitest run`                          | all pass (baseline ~70 passed, 4 skipped) |
| Typecheck | `npx tsc --noEmit`                         | exit 0 |
| Lint      | `npx eslint .`                             | 0 errors, ≤115 warnings |
| Full gate | `npm run quality`                          | passes |

## Scope

**In scope** (create only; modify nothing existing):

- `tests/unit/cache-service.test.ts` (create)
- `tests/unit/notification-store.test.ts` (create)
- `tests/integration/background-sync.test.ts` (create)

**Out of scope**:

- ANY change to production code. If a test can only be written by changing
  production code, that is a STOP condition.
- `tests/e2e/**` — Playwright specs, different runner (`*.spec.ts` only;
  putting a vitest file there breaks Playwright collection — see `CLAUDE.md`).
- Fixing the quirks you are pinning (belongs to plans 003/004).

## Git workflow

- Branch: `advisor/002-sync-characterization-tests`
- Commit message style: `test: characterize cache diff, background sync, and notification store`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `tests/unit/cache-service.test.ts`

Mock `electron` (`app.getPath` → a fake dir) and `fs` (in-memory Map, same
shape as the exemplar: `existsSync`, `readFileSync`, `writeFileSync`; add any
other `fs` function `cache.service.ts` uses — check its imports). Import
`CacheService` (the class, not the singleton) from
`../../electron/services/cache.service`.

Cases:

1. Cold start: `getCourseState('x')` on empty cache → `{ files: [], news: [] }`.
2. `updateCourseState` then `diffCourseState` with the same ids → empty diff.
3. New ids are reported: baseline `['1']`, current `[{id:'1'},{id:'2'}]` →
   `newFiles` is exactly the `id:'2'` item.
4. Numeric ids coerce: baseline stored as `['42']`, current `[{id: 42}]` →
   NOT new (`String(item.id)` path).
5. **Quirk pin**: an item with no `id` (`{name:'Lista', type:'link', url:'…'}`)
   is never reported as new, even against an empty baseline. Comment:
   `// Characterization: link-type items (parser Strategy 2) have no id and are invisible to the diff. Plan 003 changes this.`
6. Corrupt `cache.json` on disk → constructor recovers to `{}` (no throw).
7. `saveCache` failure (make the mocked `writeFileSync` throw once) → no throw
   propagates (current behavior: logged and swallowed).

**Verify**: `npx vitest run tests/unit/cache-service.test.ts` → 7 passed.

### Step 2: `tests/unit/notification-store.test.ts`

First line: `// @vitest-environment jsdom`. No electron mocks needed — the
module only touches `localStorage`. Clear `localStorage` in `beforeEach`.

Cases (import the real functions from `../../src/utils/notification-store`):

1. `pushNotifications` stores items; `getAllNotifications` returns them
   most-recent-first (new items prepended).
2. Dedupe by id: pushing the same id twice stores one.
3. Read-state carryover: `markAsRead(...)` for an item key, then
   `pushNotifications` of a notification with that id → arrives `read: true`.
4. **Quirk pin**: pushing 20 items caps history at 15; the 5 overflow items
   are gone from `getAllNotifications` AND `courseHasUnread` for an
   overflowed-only course returns `false`. Comment:
   `// Characterization: overflow past MAX_NOTIFICATIONS(15) is silently dropped, including unread tracking.`
5. `markAllAsRead` → `getUnreadCount()` is 0 and every item's key is in the
   read set (`isItemRead` true).
6. `seedExistingItemsAsRead` is idempotent: seeds from a fake
   `coursesWithFiles` blob once; a second call with different data changes
   nothing (early-return at `notification-store.ts:143`).
7. Corrupt JSON in either key → getters return empty defaults, no throw.

**Verify**: `npx vitest run tests/unit/notification-store.test.ts` → 7 passed.

### Step 3: `tests/integration/background-sync.test.ts`

Node environment (default). Mocks, via `vi.hoisted` state:

- `vi.mock('electron', ...)`: `app: { getPath: () => 'test-userdata', getAppPath: () => '.', isPackaged: true }`,
  `BrowserWindow: class {}`, and `Notification` as a class with a static
  `isSupported()` returning `false` (keeps the OS-notification branch inert;
  one test flips it if you want to assert it — optional).
- `vi.mock('./cache.service')` — careful: the import specifier inside
  `background-sync.service.ts` is `'./cache.service'`, but from the test you
  mock the resolved module path
  `vi.mock('../../electron/services/cache.service', ...)`. Provide a stateful
  fake `cacheService` object (`getCourseState`, `diffCourseState`,
  `updateCourseState`) backed by a Map, plus a call-order log array — the
  ordering assertions below need it.
- `vi.mock('../../electron/services/persistence.service', ...)`:
  `persistenceService.getSettings()` → a settings object
  (`{ runInBackground: true, syncInterval: 60, autoDownloadUpdates: false, lastDownloadPath: null, theme: 'light' }`
  — check `shared/ipc.ts:108-116` for the exact `AppSettings` fields and
  include them all), `loadCredentials()` → `{ username: 'u', password: 'p' }`,
  `updateSetting: vi.fn()`.
- A fake `SigaaService` object literal passed to the constructor (it is typed
  as `SigaaService` — build the fake with only the methods `syncNow` calls:
  `getCourses`, `getCourseFiles`, `login`, `downloadAllFiles`, `getNewsDetail`;
  if the constructor param type rejects the literal, use
  `as unknown as SigaaService` — allowed in tests, and it does NOT count as
  IPC-boundary `any`).
- A fake window: `{ isDestroyed: () => false, webContents: { send: vi.fn() } }`
  passed via the `getWindow` constructor arg (cast like above if needed).

Cases:

1. **Cold start produces no notifications**: empty baseline; `getCourseFiles`
   returns 2 files + 1 news → `webContents.send` payload has
   `notifications: []` BUT `courses` populated, and `updateCourseState` was
   called with all ids.
2. **Warm diff notifies**: baseline holds file `1`; current has files `1`,`2`
   → exactly one notification, `type: 'file'`,
   `id: 'file-<courseId>-<fileName>'`, and the payload shape is
   `{ courses, notifications, timestamp }` (assert all three keys — the
   dashboard parses this untyped).
3. **Quirk pin — commit precedes delivery**: using the call-order log, assert
   `updateCourseState` is called BEFORE `webContents.send`. Comment:
   `// Characterization: baseline commits before the user is notified; a crash in between loses the notification forever. Plan 003 reorders this — this test is EXPECTED to be inverted there.`
4. **Quirk pin — failed retry is silent**: `getCourses` returns
   `{ success: false }` twice, `login` returns `{ success: true }` → `syncNow`
   returns without throwing, no `webContents.send`, no `updateCourseState`.
   Comment: `// Characterization: the retry's success flag is discarded (background-sync.service.ts:73-74). Plan 003 makes this an explicit abort.`
5. **Reentrancy guard**: start one `syncNow()` (make `getCourses` hang on a
   controllable promise), call `syncNow()` again → the second returns
   immediately and `getCourses` was called once. Resolve the promise, await
   the first.
6. **Failed course is skipped, others still delivered**: two courses; course A
   `getCourseFiles` → `{ success: false, message: 'x' }`, course B succeeds →
   payload contains only course B; no throw.

Note: `syncNow` has a `setTimeout`-based politeness delay between courses
(2000 ms). Use `vi.useFakeTimers()` + `await vi.runAllTimersAsync()` around
the `syncNow()` call (or `vi.advanceTimersByTimeAsync`), and restore real
timers in `afterEach` — otherwise the multi-course tests take seconds each.

**Verify**: `npx vitest run tests/integration/background-sync.test.ts` → 6 passed.

### Step 4: Full gate

**Verify**: `npm run quality` → typecheck 0 errors, lint 0 errors/≤115
warnings, all tests pass (~20 new).

## Test plan

This plan IS the test plan. ~20 new tests across three files, all calling
production modules, quirk-pins marked with `// Characterization:` comments
naming the follow-up plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] Three new test files exist and pass; total new tests ≥ 18
- [ ] `git diff --stat` shows changes ONLY under `tests/` (plus the
      `plans/README.md` status row)
- [ ] Each pinned quirk carries a `// Characterization:` comment naming plan
      003 (grep: `grep -rn "Characterization:" tests/ | wc -l` ≥ 4)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any test can only pass by modifying production code — report which behavior
  differs from this plan's excerpts instead.
- `background-sync.service.ts` no longer matches the excerpts (plan 003 may
  have landed first — in that case the quirk-pins are wrong; report and ask
  for re-sequencing).
- Mocking `cache.service`/`persistence.service` fails because
  `background-sync.service.ts` changed its import specifiers.
- The suite baseline is already red before your changes.

## Maintenance notes

- Plan 003 will deliberately flip pinned tests 3 and 5 (cache-service quirk
  and ordering quirk) — that is the red-green mechanism working, not a defect.
- When tracker task `DATA-001` (account-scoped state) lands, the
  `notification-store` tests' localStorage keys will need the account prefix.
- Reviewer: check that no test asserts on mock-internal behavior only —
  every case above exercises a production function.

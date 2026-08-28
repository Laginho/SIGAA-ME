# Plan 003: Never mark an item "seen" before the user was told about it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 700de9a..HEAD -- electron/services/background-sync.service.ts electron/services/http-scraper.service.ts electron/services/cache.service.ts`
> Plans 001/002 legitimately touch neighboring files; what must still match is
> the excerpts below. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: plans/002-sync-characterization-tests.md (MUST be DONE first)
- **Category**: bug
- **Planned at**: commit `700de9a`, 2026-08-28

## Why this matters

Three defects silently defeat the app's headline feature ("tell me when the
professor posts something"):

1. `syncNow()` commits the seen-items baseline (`updateCourseState`) **before**
   auto-download, news-content fetch, and the renderer push. Any failure in
   between means the next sync diffs those items as already-known — the user
   is never notified, ever, and auto-download never retries them.
2. The session-expiry retry discards the result's `success` flag, so a failed
   retry falls through to "No courses found" and the sync silently does
   nothing.
3. Materials parsed as links (parser "Strategy 2") carry no `id`, and
   `diffCourseState` skips id-less items — link-type materials can never
   produce a notification.

## Current state

Relevant files:

- `electron/services/background-sync.service.ts` — the sync loop; defects 1
  and 2 live here.
- `electron/services/http-scraper.service.ts` — the parser that emits id-less
  link items (defect 3's source).
- `electron/services/cache.service.ts` — `diffCourseState` (`:56-63`) filters
  on `item.id &&`; you will NOT change this file — the fix is giving link
  items an id.
- `tests/integration/background-sync.test.ts` and
  `tests/unit/cache-service.test.ts` — the characterization suites from plan
  002. They contain `// Characterization:` pins that this plan deliberately
  flips.

Defect 1 — ordering (`background-sync.service.ts:107-112`):

```ts
const diff = cacheService.diffCourseState(course.id, currentFiles, currentNews);

// Always update the cache so subsequent syncs have a proper baseline
const allFileIds = currentFiles.map(f => String(f.id)).filter(id => id && id !== 'undefined');
const allNewsIds = currentNews.map(n => String(n.id)).filter(id => id && id !== 'undefined');
cacheService.updateCourseState(course.id, allFileIds, allNewsIds);
```

…while the delivery happens only after the whole course loop
(`:200-233`): `window.webContents.send('background-sync-update', {...})` and
the OS `Notification`. In between sit the per-course auto-download
(`:151-161`) and news-content fetches (`:164-181`), both of which can throw
into the outer catch at `:235-236`, skipping delivery entirely.

Defect 2 — retry (`:66-75`):

```ts
if (!coursesResult.success) {
    console.log('[BackgroundSync] Session expired or invalid. Attempting re-login...');
    const loginResult = await this.sigaaService.login(creds.username, creds.password);
    if (!loginResult.success) {
        console.error('[BackgroundSync] Re-login failed:', loginResult.message);
        return;
    }
    const retryCourses = await this.sigaaService.getCourses();
    courses = retryCourses.courses;      // .success never checked
}

if (!courses || courses.length === 0) {
    console.log('[BackgroundSync] No courses found to sync.');
    return;
}
```

Defect 3 — id-less link items (`http-scraper.service.ts:479-485`, inside the
`getCourseFiles` parser, "Strategy 2"):

```ts
} else if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
    files.push({
        name: text,
        type: 'link',
        url: href.startsWith('http') ? href : this.baseUrl + href
    });
}
```

Notification ids are deterministic (`background-sync.service.ts:127`, `:139`):
`file-${course.id}-${f.name}` / `news-${course.id}-${n.id}`, and the renderer
dedupes by id (`src/utils/notification-store.ts:111-118`). This is what makes
"duplicate notification on crash-after-push" the safe failure direction.

Repo conventions that apply (`CLAUDE.md`):

- `try/catch` that only `console.error`s is almost always a bug — when you
  keep the outer catch, it must now be the thing that PREVENTS the commit,
  which is a real job, and deserves a comment saying so.
- Every bug fix needs a test that fails without it (plan 002's pins provide
  exactly this: flipping them is the red half of red-green).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npx vitest run`   | all pass            |
| One suite | `npx vitest run tests/integration/background-sync.test.ts` | all pass |
| Full gate | `npm run quality`  | passes, lint ≤115 warnings |

## Scope

**In scope**:

- `electron/services/background-sync.service.ts`
- `electron/services/http-scraper.service.ts` (ONLY the Strategy-2 `files.push`
  block quoted above)
- `tests/integration/background-sync.test.ts` (update pins, add cases)
- `tests/unit/cache-service.test.ts` (update the id-less pin)

**Out of scope**:

- `electron/services/cache.service.ts` — `diffCourseState`'s `item.id &&`
  filter stays; the fix is upstream (ids for link items).
- The manual-sync path (`src/pages/sync-selection.ts`) — that is plan 004.
- `notification-store.ts` overflow cap — separate, unselected finding.
- Any change to the `background-sync-update` payload shape — the dashboard
  parses it untyped; keep `{ courses, notifications, timestamp }` exactly.
- The OS-notification aggregation logic (`:214-232`) — keep as-is.

## Git workflow

- Branch: `advisor/003-notification-integrity`
- Suggested commits (two): 
  `fix: commit the sync baseline only after notifications are delivered` and
  `fix: give link materials a stable id so the diff can see them`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the silent retry (defect 2)

In `background-sync.service.ts`, after the retry `getCourses()`:

```ts
const retryCourses = await this.sigaaService.getCourses();
if (!retryCourses.success) {
    console.error('[BackgroundSync] Retry after re-login failed:', retryCourses.error ?? 'unknown');
    return;
}
courses = retryCourses.courses;
```

(Check the actual failure field name on `getCourses`'s return — the service
returns `error` in some paths and `message` in others; use what the type says.)

Update plan 002's pinned test 4: it asserted silence; it now asserts the same
outcome (no send, no commit) but the pin comment is replaced with a normal
description — and add the assertion that `getCourseFiles` is never called
after a failed retry.

**Verify**: `npx vitest run tests/integration/background-sync.test.ts` → pass.

### Step 2: Move the baseline commit after delivery (defect 1)

Restructure `syncNow()` minimally:

1. Replace the immediate `cacheService.updateCourseState(...)` at `:112` with
   accumulating the intended commit:

```ts
pendingCommits.push({ courseId: course.id, fileIds: allFileIds, newsIds: allNewsIds });
```

   (`const pendingCommits: { courseId: string; fileIds: string[]; newsIds: string[] }[] = []`
   declared next to the other accumulators, ~`:80`.)

2. Keep everything else in the loop unchanged (diff, notification building,
   auto-download, news enrichment). Note the auto-download and news-fetch
   steps still run BEFORE delivery — that is fine now, because a throw there
   aborts to the outer catch **without having committed**, so the next sync
   retries the whole course.

3. After the renderer push and the OS-notification block (i.e., as the last
   statement of the `try`, after `:233`), flush:

```ts
// Commit the baseline only after the user had every chance to be told.
// A crash before this point means re-notifying next sync — the renderer
// dedupes notification ids, so duplicates are absorbed (notification-store.ts:111-118).
for (const c of pendingCommits) {
    cacheService.updateCourseState(c.courseId, c.fileIds, c.newsIds);
}
```

Important behavioral note (do not "fix" this): when the window is closed or
destroyed, `webContents.send` is skipped but the flush still runs — delivery
via the OS notification is considered sufficient. The guarantee this plan adds
is "no commit on a **thrown** sync", not "no commit without a renderer ack".

Update plan 002's pinned test 3 (commit-before-send ordering): invert it —
assert `updateCourseState` happens AFTER `webContents.send`. Run the suite
BEFORE applying this step's production change and confirm the inverted test
fails (red), then apply the change and confirm green. Record both runs in
your report.

Add one new test: `getCourseFiles` succeeds for the course but the
news-content fetch throws synchronously in a way that escapes the inner
try/catch — simulate by making the fake `sigaaService.downloadAllFiles` throw
with `autoDownloadUpdates: true` and `lastDownloadPath` set, and
`diff.newFiles` non-empty → assert `updateCourseState` was NEVER called and
`webContents.send` was NEVER called (next sync will retry).

**Verify**: `npx vitest run tests/integration/background-sync.test.ts` → all
pass, including the inverted pin and the new crash-case.

### Step 3: Give link materials a stable id (defect 3)

In `http-scraper.service.ts`, Strategy-2 link branch only:

```ts
} else if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
    const url = href.startsWith('http') ? href : this.baseUrl + href;
    files.push({
        name: text,
        type: 'link',
        // Deterministic id so cache diffing and notifications can see
        // link materials; id-less items are invisible to diffCourseState.
        id: `link:${url}`,
        url
    });
}
```

Check whether the `files` array element type (if one is declared) needs `id`
added; if the parser builds plain `any[]`, no type change is needed.

One-time side effect to record in the commit message: on the first sync after
this change, existing link items will diff as "new" once (they were never in
the baseline). This is a bounded, one-shot notification burst limited to
link-type materials, accepted by the plan.

Update plan 002's pinned cache test 5 (id-less invisibility): the
cache-service behavior itself is unchanged (still skips id-less items), so
that pin STAYS — only reword its comment to say the parser now always supplies
ids, and the filter remains as a guard. Add a parser-level test instead if a
parser test tier exists: check `tests/integration/parser-real.test.ts` — if it
exercises `getCourseFiles` against a fixture containing a Strategy-2 link,
add the assertion `expect(linkItem.id).toBe('link:' + linkItem.url)`; if the
fixtures contain no Strategy-2 link, skip this (do NOT fabricate a new fixture
in this plan) and note it in the report.

**Verify**: `npx vitest run` → all pass.

### Step 4: Full gate

**Verify**: `npm run quality` → exit 0, lint ≤115 warnings.

## Test plan

- Inverted ordering pin + new crash-abort case in
  `tests/integration/background-sync.test.ts` (Step 2, red-green recorded).
- Retry-failure assertions tightened (Step 1).
- Optional parser assertion for link ids (Step 3, only if a fixture exists).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] In `background-sync.service.ts`, `updateCourseState` appears only in the
      post-delivery flush
      (`grep -n "updateCourseState" electron/services/background-sync.service.ts` → 1 hit, after the `webContents.send` block)
- [ ] `grep -n "retryCourses.success" electron/services/background-sync.service.ts` → 1 hit
- [ ] Strategy-2 link items carry `id: \`link:${url}\``
      (`grep -n "link:" electron/services/http-scraper.service.ts`)
- [ ] Red-green evidence for the ordering change recorded in the report
- [ ] No modified files outside the in-scope list (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 002's test files don't exist (it hasn't run) — this plan must not
  proceed without the characterization suite.
- The `syncNow()` structure no longer matches the excerpts (drift).
- Flushing after delivery makes pinned test 1 (cold start) fail in a way that
  isn't just call-ordering — that would mean cold-start baselines depend on
  mid-loop commits, which changes the design.
- You find a consumer that reads `cache.json` DURING a sync and depends on the
  mid-loop commit (search for other `cacheService` readers first:
  `grep -rn "cacheService" electron/`).
- Adding `id` to link items breaks a discriminated union or type in
  `shared/ipc.ts`.

## Maintenance notes

- The one-shot link-item notification burst: if the owner wants to suppress
  it, a migration that seeds `link:` ids into `cache.json` baselines before
  the first post-upgrade sync would do it — deliberately not included (adds a
  migration path for a one-time cosmetic event).
- Tracker task `DATA-001` (account-scoped cache) will move `cache.json` —
  the flush loop is the single place that writes it now, which makes that
  migration easier.
- Reviewer: scrutinize the outer catch — after this change it is load-bearing
  (aborting the flush); it must remain a real abort, not grow a "commit anyway"
  fallback.
- Deferred: the tray "[Dev] Simular Arquivo Novo" mutates `cacheService`
  internals directly (tracker `BUG-003`/`DEV-001`) and bypasses this
  ordering; it is dev-only surface and already tracked.

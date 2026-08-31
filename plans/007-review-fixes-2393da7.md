# Plan 007: Fix the review findings on commit 2393da7

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Branch check (run first)**:
> `git merge-base --is-ancestor 2393da7 HEAD && echo OK`
> Must print `OK`. This plan applies ONLY to the `traycer/noble-hawk` line
> (commit `2393da7` or a descendant). The `master` branch contains a
> DIFFERENT, parallel implementation of plans 001–006; applying these fixes
> there would patch the wrong code. On `master`, STOP.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW (one renderer fix + test hardening; no scraping-logic change)
- **Depends on**: commit `2393da7` (plans 001–006 as implemented there)
- **Category**: bug + test-integrity
- **Planned at**: commit `2393da7`, 2026-08-31, from a two-axis code review

## Why this matters

A review of `2393da7` against `plans/001`–`006` and `CLAUDE.md` found one
real bug and four integrity gaps:

1. **Unhandled throw in the dashboard.** `mergeCoursesIntoCache` now throws
   on `localStorage` quota (by design, plan 004). `sync-selection.ts` calls
   it inside a `try` that shows the error to the user; `dashboard.ts` calls
   it bare inside the background-sync listener. A full cache now produces an
   unhandled renderer exception on every background sync — worse than the
   silent pre-004 behavior.
2. **Three shipped fixes have no test that would fail if reverted**
   (CLAUDE.md "Antes de commitar" item 5): the 5s quit-teardown timeout, the
   update-consent flow, and the `id: link:${url}` parser fix.
3. **Two test comments attribute behavior to plan 003 that plan 003
   explicitly does not do.** Misleading comments are how the `pauseSync()`
   class of bug survives review here; they must not stand.
4. The tray-quit test header cites "PLAN-001-A", a plan id that does not
   exist, for a behavior change (tray "Sair" now runs the logout teardown)
   that plan 001 did not request. The behavior is correct and stays; the
   fabricated provenance goes.

## Current state

All excerpts below are from `2393da7` — verify against your checkout.

`src/pages/dashboard.ts:183-188` (the bug — no try/catch, listener context):

```ts
window.api.onBackgroundSyncUpdate((data: any) => {
  console.log('[Dashboard] Received background sync update:', data.courses?.length, 'courses');
  if (data.courses && data.courses.length > 0) {
    mergeCoursesIntoCache(data.courses, { replaceSet: true }, data.timestamp);
    loadCoursesFromCache();
  }
```

`src/utils/ui-helpers.ts:63` — the merge helper; its quota branch throws
`new Error('Cache local cheio…')` (read the function before changing anything).

The pattern to copy, `src/pages/sync-selection.ts:210-224`: the merge calls
sit inside the sync `try`, and the `catch` shows the error via `showError`.
`dashboard.ts` already imports `toast` (`:2`) — use `toast.error`.

`electron/main.ts:281-287` — the 5s `Promise.race` in `before-quit`
(implemented, untested-in-effect).

`electron/main.ts:387-431` — `autoUpdater.autoDownload = false`, the
`update-available` consent dialog (`Baixar` / `Agora não` →
`downloadUpdate()`), the `update-downloaded` dialog (`Reiniciar e Instalar` /
`Mais Tarde` → `quitAndInstall()`), and the startup `checkForUpdates()`
(implemented, unasserted).

`tests/unit/tray-quit-before-quit.test.ts` — mocks `logout` as
`vi.fn().mockResolvedValue(undefined)` (`:28`, resolves instantly, so the
5s race is never exercised) and mocks `checkForUpdates` /
`checkForUpdatesAndNotify` (`:79-80`) without a single assertion on either.
Header comment cites `PLAN-001-A` (`:2`, `:121`).

`tests/unit/notification-store.test.ts:76` and `:106` — the two false
comments: "Plan 003 changes the cap policy" and "Plan 003 re-runs seeding on
login". Plan 003 lists the notification-store cap as out of scope and never
touches seeding-on-login.

`electron/services/http-scraper.service.ts:489-497` — the Strategy-2 link
branch that assigns `id: `link:${url}``. No fixture in
`tests/fixtures/` contains a Strategy-2 link (the existing ones only carry
`href="#"` JSF links), so nothing pins this.

Repo conventions that apply (from `CLAUDE.md`, read it before starting):

- A bug fix ships with a test that would fail without it; record the
  red-green runs (test fails before the fix / with the fix reverted, passes
  after) in your report.
- Tests call production code, never a mirrored copy
  (`tests/fixtures/README.md`).
- No new `any` in boundary code; lint warning count may not increase.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npx vitest run`   | all pass            |
| Full gate | `npm run quality`  | all three pass      |

## Scope

**In scope** (the only files you should modify):

- `src/pages/dashboard.ts` (only the `onBackgroundSyncUpdate` listener)
- `tests/unit/tray-quit-before-quit.test.ts`
- `tests/unit/notification-store.test.ts` (comments only — no assertion may
  change)
- `tests/integration/parser-real.test.ts`
- `tests/fixtures/` (one new or extended fixture for the Strategy-2 link)
- a new unit test file for the dashboard listener if jsdom setup demands one

**Out of scope** (do NOT touch):

- `src/utils/ui-helpers.ts` — the throw-on-quota contract is correct and
  pinned; the bug is at the call site.
- `electron/main.ts`, `electron/services/**` — production code there is
  correct per the review; this plan only adds the missing pins.
- The 6 duplicated debug-dump blocks and the background-sync test fake — see
  Maintenance notes; not this plan.

## Git workflow

- Branch: work on `traycer/noble-hawk` (or a child branch of it)
- Conventional-commit style. Suggested split: one commit for the dashboard
  fix + its test, one for the test-integrity work (pins + comments).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Catch the merge failure in the dashboard listener

In `src/pages/dashboard.ts`, wrap the merge in the background-sync listener:

```ts
if (data.courses && data.courses.length > 0) {
  try {
    mergeCoursesIntoCache(data.courses, { replaceSet: true }, data.timestamp);
  } catch (error) {
    // Quota: the cache is full and the sync result could not be saved.
    // The user must know — silently dropping a sync is how stale data
    // masquerades as fresh.
    toast.error(error instanceof Error ? error.message : 'Falha ao salvar a sincronização.');
    return;
  }
  loadCoursesFromCache();
}
```

Keep the notification block below it untouched. Note the `return`: if the
merge failed, `loadCoursesFromCache()` would repaint from the stale cache
while the toast says the opposite — skip the repaint, and skipping the
notification push is also correct (the items were not persisted).
If `toast.error` does not exist, check `src/components/toast.ts` for the
error-level method it actually exports and use that; do not add one.

**Test**: pin this path. Follow the jsdom pattern of
`tests/unit/sync-selection.test.ts` / `tests/unit/merge-courses-cache.test.ts`
(they already simulate quota by stubbing `localStorage.setItem` to throw a
`QuotaExceededError`-shaped error). Simulate the listener receiving a course
payload while `setItem` throws; assert no unhandled exception escapes and the
toast error path ran. If importing `dashboard.ts` wholesale is impractical
(it runs page setup on import), extracting the listener body into a named
exported function in `dashboard.ts` is acceptable — export the smallest
thing that lets the test call production code.

**Red-green**: run the new test with the `try/catch` removed → must fail;
restore → must pass. Record both runs.

**Verify**: `npx vitest run` → all pass.

### Step 2: Pin the 5s quit-teardown timeout

In `tests/unit/tray-quit-before-quit.test.ts` (fake timers already in use):
add a test where `logout` returns a promise that **never resolves**. Trigger
quit, `await vi.advanceTimersByTimeAsync(5000)`, assert the quit path
completes (whatever the existing tests assert completion with — `app.quit`
called again / `isQuitting` flow finished). Without the `Promise.race` in
`main.ts:281`, this test must hang or fail on the completion assertion.

**Red-green**: temporarily replace the race with a bare
`await sigaaService.logout()` in a scratch run (or assert via a
`vi.advanceTimersByTimeAsync(4999)` negative check) → confirm the test
distinguishes the two. Record it.

### Step 3: Pin the update-consent flow

Same file (the `autoUpdater` mocks at `:79-80` already exist). Add
assertions/tests for:

1. `autoUpdater.autoDownload === false` and
   `autoUpdater.autoInstallOnAppQuit === false` after startup.
2. `checkForUpdates` called once at startup; `checkForUpdatesAndNotify`
   **never** called.
3. The `update-available` handler: capture it from the mocked
   `autoUpdater.on`, invoke it with a fake `info`; with the mocked
   `dialog.showMessageBox` resolving `{ response: 0 }` assert
   `downloadUpdate` was called; resolving `{ response: 1 }` assert it was
   not.

**Red-green**: these must fail against the pre-006 behavior
(`checkForUpdatesAndNotify()` + `autoDownload` default). Verify by flipping
the mock target once in a scratch run; record it.

### Step 4: Pin the Strategy-2 link id

Read the Strategy-2 block in `http-scraper.service.ts` around `:470-500` to
determine exactly which DOM shape it matches (selector, href test). Extend a
copy of the course-content fixture in `tests/fixtures/` (or add a minimal
one) with one anchor matching that shape and a real (non-`#`) href. In
`tests/integration/parser-real.test.ts`, run the **production** parser over
it and assert the resulting item has `type: 'link'` and
`id === 'link:' + <expected url>`.

**Red-green**: delete the `id` line from the production branch in a scratch
run → the new assertion must fail (id `undefined`); restore. Record it.

### Step 5: Fix the lying comments

- `tests/unit/notification-store.test.ts:76` — delete the sentence
  "Plan 003 changes the cap policy." (plan 003 lists the cap as out of
  scope). Keep the factual first half of the comment.
- `tests/unit/notification-store.test.ts:106` — delete "Plan 003 re-runs
  seeding on login." (plan 003 does no such thing). Keep the factual half.
- `tests/unit/tray-quit-before-quit.test.ts:2` and `:121` — replace
  `PLAN-001-A` with the honest provenance, e.g.: "Not in plan 001's scope:
  the tray 'Sair' item previously set `isQuitting = true` before
  `app.quit()`, skipping the `before-quit` teardown entirely. Changed
  deliberately so tray exit gets the same bounded cleanup as every other
  quit path." Do not change any assertion in this file except by addition
  (Steps 2–3).

**Verify**: `npx vitest run` → identical pass count for
`notification-store.test.ts` (comments only).

### Step 6: Gate

`npm run quality` → typecheck, lint (0 errors, warning count not increased),
tests all green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] `dashboard.ts` merge call is inside a `try/catch` that surfaces the
      error to the user, and a test fails if the `catch` is removed
- [ ] A test fails if the `Promise.race` timeout in `before-quit` is
      replaced with a bare `await`
- [ ] A test fails if `checkForUpdates` is swapped back to
      `checkForUpdatesAndNotify`, and a test covers consent-declined →
      no `downloadUpdate`
- [ ] A parser-real test fails if the `id: 'link:' + url` line is removed
- [ ] `grep -rn "PLAN-001-A" tests/` → no matches
- [ ] `grep -n "Plan 003" tests/unit/notification-store.test.ts` → no matches
- [ ] Red-green evidence for Steps 1–4 recorded in the executor report
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 007 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The branch check fails (you are on `master` or the excerpts don't match).
- Pinning Step 1 requires restructuring `dashboard.ts` beyond exporting the
  listener body — that is renderer-architecture work (audit finding F8's
  territory), not this plan.
- The Strategy-2 selector cannot be determined confidently from the source,
  or no fixture shape triggers the branch — do not guess a fixture into
  passing; report what the branch actually requires.
- Any Step 2–4 pin passes BOTH with and without the production behavior it
  is supposed to pin. A pin that cannot fail is the defect this plan exists
  to remove; do not commit it.

## Maintenance notes

Deliberately not in this plan (judgement calls from the same review, for a
later batch):

- The `if (!app.isPackaged) { … debug_*.html … }` dump block appears 6 times
  across `http-scraper.service.ts` and `playwright-login.service.ts` —
  extract a `dumpDebugHtml(prefix, id, html)` helper (CLAUDE.md rule 7
  territory once it's six copies).
- `tests/integration/background-sync.test.ts`'s fake cache re-implements
  `diffCourseState`'s `id !== 'undefined'` filter — mirrored logic; if the
  real filter drifts the fake keeps passing. Mitigated by
  `cache-service.test.ts` covering the real class; fold the fake onto the
  production helper when next touched.
- Reviewer should scrutinize: that Step 1's `return` on quota doesn't starve
  the notification badge in a way the user would misread (the items will
  reappear on the next successful sync since `pendingCommits` only flushes
  after delivery — verify that claim against `background-sync.service.ts`
  before relying on it).

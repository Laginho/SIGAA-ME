# Plan 008: Fix the review findings on master (74253e6..8ca473c)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Branch check (run first)**:
> `git merge-base --is-ancestor 8ca473c HEAD && echo OK`
> Must print `OK`. This plan applies ONLY to the `master` line (commit
> `8ca473c` or a descendant). `plans/007` is the counterpart for the parallel
> `traycer/noble-hawk` implementation — the two must never be cross-applied.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW (one renderer fix, updater test pins, one typing fix; no
  scraping-logic change)
- **Depends on**: commit `8ca473c` (plans 001–006 as implemented on master)
- **Category**: bug + test-integrity + boundary-typing
- **Planned at**: commit `8ca473c`, 2026-08-31, from a two-axis code review
  of `74253e6..8ca473c`

## Why this matters

A two-axis review (Standards vs. CLAUDE.md; Spec vs. plans 001–006) found
one hard standards violation, one real bug, and two boundary gaps:

1. **Commit `8267769` (update consent) shipped with no test that would fail
   if reverted** — CLAUDE.md "Antes de commitar" item 5. Flipping
   `checkForUpdates()` back to `checkForUpdatesAndNotify()` or re-enabling
   `autoDownload` breaks nothing in the suite. The consent dialog is the
   whole point of plan 006; it is unpinned.
2. **Unhandled throw in the dashboard.** `mergeCoursesIntoCache` throws on
   `localStorage` quota (by design, plan 004). `sync-selection.ts` calls it
   inside the sync `try`; `dashboard.ts:186` calls it bare inside the
   background-sync listener. A full cache produces an unhandled renderer
   exception on every background sync — worse than the silent pre-004
   behavior.
3. **Floating promises in the updater handlers.** Both
   `dialog.showMessageBox(...).then(...)` chains in `main.ts` have no
   `.catch()`; a dialog rejection is an unhandled rejection in main.
4. **`mergeCoursesIntoCache(incoming: any[])`** perpetuates the untyped IPC
   boundary CLAUDE.md rule 2 exists to close, in a brand-new helper.
5. **Plan 003's `id: link:${url}` fix has no test** (the spec allowed
   skipping only because no fixture had a Strategy-2 link — the gap is
   documented, not closed).

## Current state

All excerpts below are from `8ca473c` — verify against your checkout.

`src/pages/dashboard.ts:183-188` (the bug — bare merge in listener context):

```ts
window.api.onBackgroundSyncUpdate((data: any) => {
  console.log('[Dashboard] Received background sync update:', data.courses?.length, 'courses');
  if (data.courses && data.courses.length > 0) {
    mergeCoursesIntoCache(data.courses, { replaceSet: true }, data.timestamp);
    loadCoursesFromCache();
  }
```

The pattern to copy, `src/pages/sync-selection.ts`: the merge calls sit
inside the sync `try`, and the `catch` shows the error to the user.
`dashboard.ts` already imports `toast` — use its error-level method.

`src/utils/ui-helpers.ts:76` — the merge helper and its untyped boundary:

```ts
export function mergeCoursesIntoCache(incoming: any[], opts: MergeOptions = {}, timestamp: number = Date.now()): void {
```

Its quota branch throws `new Error('Cache local cheio…')` — that contract is
correct and pinned by `tests/unit/merge-courses-cache.test.ts`; do not
change it.

`electron/main.ts:384-430` — updater block: `autoDownload = false`,
`autoInstallOnAppQuit = false` (`:386-387`), `update-available` consent
dialog whose `.then(...)` has no `.catch()` (`:392-405`), `update-downloaded`
dialog, same floating promise (`:415-425`), startup `checkForUpdates()` with
a `.catch` (`:428-430`). **No test file on master exercises any of this.**

`electron/services/http-scraper.service.ts:498-506` — the Strategy-2 link
branch assigning `id: `link:${url}``. No fixture in `tests/fixtures/`
contains a Strategy-2 link (existing ones only carry `href="#"` JSF links),
so nothing pins it.

Repo conventions that apply (from `CLAUDE.md`, read it before starting):

- A bug fix ships with a test that would fail without it; record the
  red-green runs (fails with the fix reverted, passes with it) in your
  report.
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
- `src/utils/ui-helpers.ts` (only the `mergeCoursesIntoCache` signature /
  input type — not the merge or quota logic)
- `electron/main.ts` (only `.catch()` additions to the two dialog chains)
- `tests/fixtures/` (one new or extended fixture for the Strategy-2 link)
- `tests/integration/parser-real.test.ts`
- new unit test files for the updater handlers and the dashboard listener

**Out of scope** (do NOT touch):

- The quota-throw contract in `mergeCoursesIntoCache` — the bug is at the
  call site.
- `electron/services/**` production code — correct per the review; this plan
  only adds the missing pin for the link id.
- The 6 duplicated debug-dump blocks, the empty `catch (e) { }` at
  `http-scraper.service.ts:229`, and the line-number comment at
  `background-sync.service.ts:244` — see Maintenance notes; not this plan.

## Orchestration (for an executor driving subagents)

Tasks A–C are file-disjoint and MUST run as parallel subagents; task D
serializes after A because both build on the dashboard/ui-helpers pair.
Each subagent gets: this plan, its single task section, the CLAUDE.md
conventions above, and reports red-green evidence back. The orchestrator
runs the final gate (Task E) itself after merging all results.

| Task | Files | Runs |
|------|-------|------|
| A — dashboard quota catch | `dashboard.ts` + its test | parallel |
| B — updater pins + floating promises | `main.ts` + new test | parallel |
| C — Strategy-2 link id pin | fixture + `parser-real.test.ts` | parallel |
| D — type the merge boundary | `ui-helpers.ts` | after A |
| E — gate + README row | — | last, orchestrator |

## Steps

### Task A: Catch the merge failure in the dashboard listener

In `src/pages/dashboard.ts`, wrap the merge in the background-sync listener:

```ts
if (data.courses && data.courses.length > 0) {
  try {
    mergeCoursesIntoCache(data.courses, { replaceSet: true }, data.timestamp);
  } catch (error) {
    // Quota: the sync result could not be saved. The user must know —
    // silently dropping a sync is how stale data masquerades as fresh.
    toast.error(error instanceof Error ? error.message : 'Falha ao salvar a sincronização.');
    return;
  }
  loadCoursesFromCache();
}
```

Keep the notification block below it untouched. Note the `return`: if the
merge failed, `loadCoursesFromCache()` would repaint from the stale cache
while the toast says the opposite — skip the repaint, and skipping the
notification push is also correct (the items were not persisted; they
reappear on the next successful sync because the main process only flushes
its baseline after delivery). If `toast.error` does not exist, check
`src/components/toast.ts` for the error-level method it actually exports
and use that; do not add one.

**Test**: pin this path. Follow the jsdom pattern of
`tests/unit/merge-courses-cache.test.ts` (it already simulates quota by
stubbing `localStorage.setItem` to throw a `QuotaExceededError`-shaped
error). Simulate the listener receiving a course payload while `setItem`
throws; assert no exception escapes and the toast error path ran. If
importing `dashboard.ts` wholesale is impractical (it runs page setup on
import), extracting the listener body into a named exported function is
acceptable — export the smallest thing that lets the test call production
code.

**Red-green**: run the new test with the `try/catch` removed → must fail;
restore → must pass. Record both runs.

### Task B: Pin the update-consent flow, catch the dialog promises

**B1 — production change (small)**: append `.catch(err => console.error('[Updater] Dialog failed:', err))`
to both `dialog.showMessageBox(...).then(...)` chains in `main.ts`
(`:392-405` and `:415-425`). No other production change.

**B2 — new test file** (e.g. `tests/unit/updater-consent.test.ts`), mocking
`electron` (`app`, `dialog`, `BrowserWindow`) and `electron-updater` the way
`tests/unit/playwright-lifecycle.test.ts` mocks its modules. Assert:

1. `autoUpdater.autoDownload === false` and
   `autoUpdater.autoInstallOnAppQuit === false` after the setup code runs.
2. `checkForUpdates` called; `checkForUpdatesAndNotify` **never** called.
3. The `update-available` handler: capture it from the mocked
   `autoUpdater.on`, invoke it with a fake `info`; with mocked
   `dialog.showMessageBox` resolving `{ response: 0 }` assert
   `downloadUpdate` was called; resolving `{ response: 1 }` assert it was
   not.
4. The handler does not produce an unhandled rejection when
   `showMessageBox` rejects (pins B1).

If importing `main.ts` under vitest proves impractical (it boots the whole
app), extract the updater block into an exported `setupAutoUpdater(...)`
function in `main.ts` (pure move, no behavior change) and test that. Export
the smallest thing that lets the test call production code.

**Red-green**: these must fail against the pre-006 behavior. Verify by
flipping `checkForUpdates` to `checkForUpdatesAndNotify` (and removing one
`.catch`) in a scratch run; record it.

### Task C: Pin the Strategy-2 link id

Read the Strategy-2 block in `http-scraper.service.ts:470-510` to determine
exactly which DOM shape it matches (selector, href test). Extend a copy of
the course-content fixture in `tests/fixtures/` (or add a minimal one) with
one anchor matching that shape and a real (non-`#`) href. In
`tests/integration/parser-real.test.ts`, run the **production** parser over
it and assert the resulting item has `type: 'link'` and
`id === 'link:' + <expected url>`.

**Red-green**: delete the `id` line from the production branch in a scratch
run → the new assertion must fail (id `undefined`); restore. Record it.

### Task D: Type the merge boundary (after Task A lands)

In `src/utils/ui-helpers.ts`, replace `incoming: any[]` with the narrowest
type the function actually reads (walk its body: which properties of a
course does it touch?). If the repo already has a `Course`-shaped type the
renderer uses, reuse it; otherwise declare a minimal local
`IncomingCourse` interface with exactly the fields the merge reads and no
more. Call sites (`dashboard.ts`, `sync-selection.ts`) pass IPC `any` data —
they will still typecheck; do NOT add casts there.

**Verify**: `npx tsc --noEmit` exits 0; ESLint warning count did not
increase (`npx eslint . 2>&1 | tail -1` before vs. after). No behavior
change intended, so the existing `merge-courses-cache.test.ts` suite is the
pin — it must stay green untouched.

### Task E: Gate (orchestrator, after A–D merged)

`npm run quality` → typecheck, lint (0 errors, warning count not
increased), tests all green. Update the 008 status row in
`plans/README.md`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] `dashboard.ts` merge call is inside a `try/catch` that surfaces the
      error to the user, and a test fails if the `catch` is removed
- [ ] A test fails if `checkForUpdates` is swapped back to
      `checkForUpdatesAndNotify`, and a test covers consent-declined →
      no `downloadUpdate`
- [ ] Both `showMessageBox` chains in `main.ts` end in `.catch`
- [ ] A parser-real test fails if the `id: 'link:' + url` line is removed
- [ ] `grep -n "any\[\]" src/utils/ui-helpers.ts` → no matches
- [ ] ESLint warning count ≤ the pre-plan count
- [ ] Red-green evidence for Tasks A–C recorded in the executor report
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 008 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The branch check fails (excerpts don't match your checkout).
- Task A or B requires restructuring beyond exporting the listener body /
  updater setup — that is architecture work, not this plan.
- The Strategy-2 selector cannot be determined confidently from the source,
  or no fixture shape triggers the branch — do not guess a fixture into
  passing; report what the branch actually requires.
- Task D's narrow type forces changes in `electron/services/**` or the
  preload contract — the boundary fix must stay renderer-side; report
  instead.
- Any pin passes BOTH with and without the production behavior it is
  supposed to pin. A pin that cannot fail is the defect this plan exists to
  remove; do not commit it.

## Maintenance notes

Deliberately not in this plan (judgement calls from the same review, for a
later batch):

- The `if (!app.isPackaged) { … debug_*.html … }` dump block appears 6
  times across `http-scraper.service.ts` and `playwright-login.service.ts`
  — extract a `dumpDebugHtml(prefix, id, html)` helper (rule 7 territory
  once it's six copies).
- `http-scraper.service.ts:229` keeps a bare `catch (e) { }` while its five
  siblings log — make them consistent when the helper above is extracted.
- `background-sync.service.ts:244` cites "notification-store.ts:111-118" by
  line number; rots on the first edit there. Rephrase without line numbers
  when next touched.
- `tests/integration/background-sync.test.ts`'s fake cache re-implements
  `diffCourseState`'s id filter — mirrored logic; fold onto the production
  helper when next touched (mitigated by `cache-service.test.ts`).

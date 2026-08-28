# Plan 004: Make manual sync merge into the cache instead of overwriting it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 700de9a..HEAD -- src/pages/sync-selection.ts src/pages/dashboard.ts src/utils/ui-helpers.ts`
> On any change, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/002-sync-characterization-tests.md (recommended, for
  the jsdom test patterns; no hard code dependency)
- **Category**: bug
- **Planned at**: commit `700de9a`, 2026-08-28

## Why this matters

The manual sync (`startSync` in `src/pages/sync-selection.ts`) **replaces**
the entire `coursesWithFiles` localStorage blob with its own accumulator on
every loop iteration. Two data-loss consequences, both confirmed in code:

1. **Fast Sync wipes offline news content.** In `fast` mode, `news` comes from
   `getCourseFiles` as headers only (no `content` field). Writing that over
   the cache destroys every news body previously downloaded via Modo Completo
   or the per-item "load" button — the offline-reading corpus the app exists
   for.
2. **A partial failure drops courses.** A sync failing at course 3 of 8 leaves
   `coursesWithFiles` holding only 3 courses; the other 5 vanish from the
   dashboard until a full successful re-sync.

The background-sync path already solved half of this: `dashboard.ts` re-injects
cached news content before writing. The fix is one shared merge helper used by
both paths.

## Current state

Relevant files:

- `src/pages/sync-selection.ts` — `startSync(app, mode)`; the overwriting loop.
- `src/pages/dashboard.ts` — `onBackgroundSyncUpdate` handler with the
  existing (content-only) merge to generalize.
- `src/utils/ui-helpers.ts` — renderer utility module; the natural home for
  the shared helper (it already reads `coursesWithFiles` in `isNewsCached`).

The overwriting loop (`sync-selection.ts:188-209`):

```ts
const filesResult = await window.api.getCourseFiles(course.id, course.name);
let news = filesResult.success ? (filesResult.news || []) : [];

if (mode === 'full' && news.length > 0) {
  updateProgress(stepPct + 5, `Baixando Conteúdo: ${course.name}`, `Lendo ${news.length} notícias...`);
  const contentResult = await window.api.loadAllNews(course.id, course.name);
  if (contentResult.success && contentResult.news) {
    news = contentResult.news;
  }
}

coursesWithContent.push({
  ...course,
  files: filesResult.success ? filesResult.files : [],
  news,
  fileCount: filesResult.success ? filesResult.files?.length || 0 : 0
});

// ✅ Write after every course: partial data always survives a crash
localStorage.setItem('coursesWithFiles', JSON.stringify(coursesWithContent));
localStorage.setItem('cacheTimestamp', Date.now().toString());
```

(The comment describes the intent; the implementation achieves the opposite
for pre-existing cache: `coursesWithContent` holds only the courses processed
so far, and it replaces the whole key.)

The existing merge in `dashboard.ts:185-217` (background path — full course
set, so replacing the SET is correct there; only news content needs
re-injection):

```ts
if (data.courses && data.courses.length > 0) {
  // Merge with existing cache to preserve previously fetched news content
  const existingRaw = localStorage.getItem('coursesWithFiles');
  if (existingRaw) {
    try {
      const existingCourses = JSON.parse(existingRaw);
      const contentMap = new Map<string, string>();
      for (const course of existingCourses) {
        if (course.news) {
          for (const n of course.news) {
            if (n.content) contentMap.set(`${course.id}-${n.id}`, n.content);
          }
        }
      }
      for (const course of data.courses) {
        if (course.news) {
          for (const n of course.news) {
            if (!n.content) {
              const cached = contentMap.get(`${course.id}-${n.id}`);
              if (cached) n.content = cached;
            }
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  localStorage.setItem('coursesWithFiles', JSON.stringify(data.courses));
  localStorage.setItem('cacheTimestamp', data.timestamp.toString());
  loadCoursesFromCache();
}
```

Repo conventions that apply (`CLAUDE.md`):

- No abstraction for one case — this helper has exactly two call sites
  (dashboard + sync-selection), which justifies it. Do not add options it
  doesn't need.
- Renderer unit tests use jsdom via `// @vitest-environment jsdom`
  (see `tests/unit/sync-selection.test.ts` for an existing example against
  this very page, and `vitest.config.ts`).
- Bug fix ⇒ a test that fails without it.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npx vitest run`   | all pass            |
| Full gate | `npm run quality`  | passes, lint ≤115 warnings |

## Scope

**In scope**:

- `src/utils/ui-helpers.ts` (add `mergeCoursesIntoCache`)
- `src/pages/sync-selection.ts` (route writes through the helper)
- `src/pages/dashboard.ts` (replace the inline merge with the helper)
- `tests/unit/merge-courses-cache.test.ts` (create)

**Out of scope**:

- The IPC surface, `electron/**` — this is a renderer-only fix.
- The monolithic-blob storage design itself (key-per-course split) — separate
  audit finding, not selected.
- `sync-selection.ts`'s progress/error UI and mode selection logic.
- Any change to what `getCourseFiles`/`loadAllNews` return.

## Git workflow

- Branch: `advisor/004-manual-sync-merge`
- Commit style: `fix: merge manual sync results into the cache instead of overwriting it`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the helper (test-first)

Create `tests/unit/merge-courses-cache.test.ts` (jsdom docblock, clear
`localStorage` in `beforeEach`) against a new export in
`src/utils/ui-helpers.ts`:

```ts
export interface MergeOptions {
  /** When true, courses absent from `incoming` are removed (use only after a
   *  complete successful sync over the full enrollment). Default false. */
  replaceSet?: boolean;
}

export function mergeCoursesIntoCache(incoming: any[], opts: MergeOptions = {}): void
```

Behavior (this is the contract the tests pin):

1. Reads `coursesWithFiles`; on missing/corrupt JSON treats existing as `[]`.
2. For each incoming course, re-injects `news[].content` from the existing
   entry when the incoming news item lacks `content` (same
   `courseId-newsId` map as dashboard's current code).
3. Merges by course `id`: incoming courses replace their existing entry;
   existing courses NOT in `incoming` are kept (unless `replaceSet: true`).
4. Writes `coursesWithFiles` and `cacheTimestamp` (accept an optional
   timestamp argument only if you find both call sites need different values —
   dashboard uses `data.timestamp`, sync-selection uses `Date.now()`; if so,
   add a third parameter `timestamp?: number` defaulting to `Date.now()`).
5. Wraps the final `setItem` in try/catch that rethrows a clearer error on
   quota problems: `throw new Error('Cache local cheio (localStorage) — ' + original.message)`.
   (Do NOT swallow it — `startSync`'s catch shows the message to the user.)

Type note: the blob is currently untyped (`any[]`) everywhere in the renderer.
Match that (the eslint zone allows warnings in existing `src/` code) — do NOT
invent a course type here; that is tracker task `ARCH-001`'s job.

Test cases:

1. Fast-sync shape preserves content: existing course A with
   `news:[{id:'1',content:'BODY'}]`; incoming course A with
   `news:[{id:'1'},{id:'2'}]` → merged A has news `1` with `content:'BODY'`
   and news `2` without content. **This is the red-green test for data-loss #1.**
2. Partial sync preserves other courses: existing A+B; incoming only A' →
   result contains A' and untouched B. **Red-green for data-loss #2.**
3. `replaceSet: true`: existing A+B; incoming A' → result is exactly [A'].
4. Empty/corrupt existing cache → result is exactly `incoming` (no throw).
5. Incoming course with fresh `content` wins over stale cached content
   (re-injection only fills gaps, never overwrites).

**Verify**: `npx vitest run tests/unit/merge-courses-cache.test.ts` → 5 passed
(write the helper until they pass; the helper itself is ~30 lines).

### Step 2: Route `startSync` through the helper

In `sync-selection.ts`, replace the two `localStorage.setItem` lines inside
the loop (`:207-208`) with:

```ts
// Merge: preserves courses not yet processed this run and previously
// downloaded news content (a fast sync must not wipe the offline corpus).
mergeCoursesIntoCache([coursesWithContent[coursesWithContent.length - 1]]);
```

…or equivalently pass just the course object built in this iteration (prefer
assigning it to a local `const synced = {...}` before pushing, then
`mergeCoursesIntoCache([synced])`).

After the loop completes successfully (right before the
`updateProgress(100, ...)` at `:211`), prune unenrolled leftovers:

```ts
// Full pass succeeded: the synced set IS the enrollment; drop stale courses.
mergeCoursesIntoCache(coursesWithContent, { replaceSet: true });
```

Import the helper at the top (match the file's existing import style for
`./../utils/...` — check how `isCourseLike` or toast is imported there).

**Verify**: `npx vitest run` → all pass (including the existing
`tests/unit/sync-selection.test.ts`, which asserts progressive saving — if it
asserts on raw `localStorage` writes, update its expectations to the merged
shape, keeping its intent: data written after each course, not only at the end).

### Step 3: Replace dashboard's inline merge

In `dashboard.ts:185-217`, replace the whole content-map block AND the two
`setItem` lines with:

```ts
mergeCoursesIntoCache(data.courses, { replaceSet: true });
localStorage.setItem('cacheTimestamp', data.timestamp.toString());
loadCoursesFromCache();
```

(`replaceSet: true` preserves current behavior: the background push carries
the full course set. If you added the optional timestamp parameter in Step 1,
use it instead of the separate `setItem`.) Keep the notification block below
it untouched.

**Verify**: `npx tsc --noEmit` → exit 0; `npx vitest run` → all pass.

### Step 4: Full gate + red-green record

Temporarily revert Step 2's in-loop merge back to a raw
`localStorage.setItem(...)` overwrite, run
`npx vitest run tests/unit/merge-courses-cache.test.ts tests/unit/sync-selection.test.ts`
— at least one test must fail. Restore, rerun, green. Record both runs.

**Verify**: `npm run quality` → exit 0, lint ≤115 warnings.

## Test plan

- New `tests/unit/merge-courses-cache.test.ts`: 5 cases listed in Step 1.
- Updated `tests/unit/sync-selection.test.ts` only if its progressive-save
  assertions inspect raw writes.
- Pattern: `tests/unit/sync-selection.test.ts` (jsdom, same page under test).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] `grep -n "setItem('coursesWithFiles'" src/pages/` → 0 hits in
      `sync-selection.ts` and `dashboard.ts` (all writes go through the helper;
      the helper itself is the only writer besides `course-detail.ts`, which is
      out of scope)
- [ ] `mergeCoursesIntoCache` exported from `src/utils/ui-helpers.ts` with
      tests passing
- [ ] Red-green evidence recorded
- [ ] No modified files outside the in-scope list (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match the live code (drift).
- `tests/unit/sync-selection.test.ts` fails in a way that isn't its
  progressive-save assertion — that suggests the page's control flow changed.
- You find a third writer of `coursesWithFiles` in `src/pages/` beyond
  `course-detail.ts` (grep first) whose semantics conflict with merging.
- The helper needs course-identity logic beyond `id` equality (e.g. you find
  ids are not stable across syncs) — that is tracker `DATA-001` territory.

## Maintenance notes

- `course-detail.ts` writes `coursesWithFiles` directly in ~6 places (known
  audit finding, unselected); when that file is cleaned up, route its writes
  through this same helper.
- The monolithic-blob design (one localStorage key, no quota handling beyond
  the clearer error added here) remains; if a heavy semester hits quota, the
  key-per-course split is the next step.
- Reviewer: check `replaceSet` is used ONLY at the two "full set" sites
  (dashboard push, end-of-successful-manual-sync) — using it mid-loop would
  reintroduce data-loss #2.

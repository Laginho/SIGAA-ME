# Plan 005: Keep authenticated portal pages and the username out of production disk writes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 700de9a..HEAD -- electron/services/http-scraper.service.ts electron/services/playwright-login.service.ts electron/main.ts`
> On any change, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (all changes are to diagnostics, not product paths)
- **Depends on**: none (mergeable independently; if plan 001 landed first,
  line numbers in `playwright-login.service.ts` may have shifted slightly)
- **Category**: security
- **Planned at**: commit `700de9a`, 2026-08-28

## Why this matters

Several debug writes of **complete authenticated SIGAA pages** (containing the
JSF `ViewState` session token, the student's name, and academic content) run
in production builds. One live site writes to a **CWD-relative** path — for a
packaged app that is whatever directory launched the process, outside
`userData`, where no cleanup or logout will ever find it. Additionally, the
auto-login handler logs the student's SIGAA **username** on every launch, and
the console is teed into a persistent log file. Every other debug dump in the
codebase is correctly gated with `!app.isPackaged` — this plan brings the
stragglers in line. (General log redaction/rotation is tracker task `OBS-001`;
this plan fixes only the specific live leaks found by audit.)

## Current state

Relevant files:

- `electron/services/http-scraper.service.ts` — four ungated dumps, all with
  **relative** paths (resolved against `process.cwd()`):
  - `:150` — `debug_portal_fail_${courseId}.html` (inside `enterCourseHTTP`,
    which currently has no callers — but the author decided to KEEP that
    function pending tracker `BUG-010`; gate the dump, do not delete the function)
  - `:217` — `debug_http_entry_${courseId}.html` (same dead-but-kept function)
  - `:281` — `debug_playwright_${courseId}.html` — **LIVE**: runs on every
    `getCourseFiles` call with pre-fetched HTML, i.e. every sync of every course
  - `:696` — `debug_news_content_${newsId}.html` (in the HTTP `getNewsDetail`
    path; live callers route through the Playwright variant instead, but gate
    it the same way)
- `electron/services/playwright-login.service.ts` — two dumps that DO go to
  `userData` but are missing the `!app.isPackaged` gate that all six of their
  siblings have (`:87`, `:248`, `:316`, `:445`, `:523`, `:1107` are gated):
  - `:979-981` — news-link-not-found dump
  - `:992-995` — news detail page, dumped on **every** news fetch
    (comment says "universally")
- `electron/main.ts:135` — username in the log:

```ts
console.log('Auto-login: Found credentials for', creds.username);
```

  and `main.ts:31-60` tees every `console.log/error/warn` into
  `userData/logs/app_<timestamp>.log`.

The live CWD-relative dump (`http-scraper.service.ts:279-286`):

```ts
if (preFetchedHtml) {
    try {
        await fs.promises.writeFile(`debug_playwright_${courseId}.html`, preFetchedHtml);
        this.log('[HttpScraper] Saved Playwright HTML to debug_playwright.html');
    } catch (e) {
        this.log('[HttpScraper] Failed to save debug file');
    }
    this.log('[HttpScraper] Using Playwright HTML directly.');
} else {
```

The ungated `userData` dumps (`playwright-login.service.ts:977-995`):

```ts
if (!found) {
        const html = await page.content();
    const debugPath = path.join(app.getPath('userData'), `debug_playwright_news_fail_${newsId}.html`);
    fs.writeFileSync(debugPath, html);
    ...
}
...
// DEBUG: Save news detail page HTML universally
const newsDetailHtml = await page.content();
const debugNewsPath = path.join(app.getPath('userData'), `debug_news_detail_${newsId}.html`);
fs.writeFileSync(debugNewsPath, newsDetailHtml);
```

The gated pattern to match (e.g. `playwright-login.service.ts:87-96`):

```ts
if (!app.isPackaged) {
    try {
        const loginPageHtml = await page.content();
        const debugPath = path.join(app.getPath('userData'), 'debug_login_page.html');
        fs.writeFileSync(debugPath, loginPageHtml);
        ...
    } catch (e) { ... }
}
```

Note on imports: check whether `http-scraper.service.ts` already imports
`app` from `electron` (grep its import block). If not, add
`import { app } from 'electron';` — this file already runs only in the main
process, so the import is safe.

Note on filenames: `courseId`/`newsId` are scraped values interpolated into
the filename. Once the path is anchored under `userData` via `path.join`, add
a cheap sanitize to be safe: `String(courseId).replace(/[^a-zA-Z0-9_-]/g, '_')`.

Repo conventions (`CLAUDE.md`): never log credential material; the existing
`try/catch` swallow around dumps is acceptable ONLY because a failed debug
dump genuinely doesn't matter — keep those.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npx vitest run`   | all pass            |
| Full gate | `npm run quality`  | passes, lint ≤115 warnings |

## Scope

**In scope**:

- `electron/services/http-scraper.service.ts` (only the four dump sites)
- `electron/services/playwright-login.service.ts` (only the two dump sites)
- `electron/main.ts` (only line ~135, the username log)

**Out of scope**:

- Deleting `enterCourseHTTP` — author decision to keep it (tracker `BUG-010`).
- The console-tee/log-rotation design in `main.ts:31-60` — tracker `OBS-001`.
- Adding a diagnostics-cleanup routine to logout/clear-all — tracker `DATA-002`.
- Any dump site already gated with `!app.isPackaged` — leave untouched.
- `scraper.log` in the repo root and `this.log` plumbing — separate concern.

## Git workflow

- Branch: `advisor/005-debug-dump-and-log-hygiene`
- Commit style: `fix: gate debug page dumps behind dev builds and stop logging the username`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Gate and relocate the four http-scraper dumps

For each of `:150`, `:217`, `:281`, `:696`, apply the same transformation —
wrap in `if (!app.isPackaged) { ... }` and anchor the path:

```ts
if (!app.isPackaged) {
    try {
        const safeId = String(courseId).replace(/[^a-zA-Z0-9_-]/g, '_');
        await fs.promises.writeFile(
            path.join(app.getPath('userData'), `debug_playwright_${safeId}.html`),
            preFetchedHtml
        );
        this.log('[HttpScraper] Saved Playwright HTML debug dump');
    } catch (e) {
        this.log('[HttpScraper] Failed to save debug file');
    }
}
```

(Adapt variable names per site: `newsId` at `:696`, response bodies at
`:150`/`:217`. Keep each site's surrounding logic — especially at `:281`, the
`this.log('[HttpScraper] Using Playwright HTML directly.')` line must remain
OUTSIDE the new gate, since it documents control flow, not debugging.)

Confirm `path` is already imported in this file (it is used elsewhere for
downloads); add the `app` import if missing.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Gate the two playwright-login dumps

At `:977-983` and `:991-995`, wrap the dump statements in
`if (!app.isPackaged) { ... }`, exactly matching the sibling pattern at `:87`.
The `return { success: false, ... }` at `:982` must stay OUTSIDE the gate.
At `:991-995` the `page.content()` call may stay outside the gate only if its
result is used elsewhere — check: `newsDetailHtml` is used ONLY for the dump,
so move the whole block (content read + write + log) inside the gate to skip
the wasted serialization in production.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Drop the username from the auto-login log

`electron/main.ts:135`:

```ts
console.log('Auto-login: Found credentials for', creds.username);
```

becomes

```ts
console.log('Auto-login: stored credentials found');
```

**Verify**: `grep -n "creds.username" electron/main.ts` → only the
`sigaaService.login(creds.username, ...)` call site remains (line ~136).

### Step 4: Full gate and sweep

Run a final sweep to prove no ungated dump remains:

```
grep -n "writeFile" electron/services/http-scraper.service.ts electron/services/playwright-login.service.ts
```

Every `debug_*` write must now sit inside an `if (!app.isPackaged)` block
(inspect each hit's context with a few lines of `-B`), and none may use a
relative path.

**Verify**: `npm run quality` → exit 0, lint ≤115 warnings, all tests pass
(the existing suite mocks `app.isPackaged` where relevant; if a test fails
because it asserted on a debug file write, update the test's expectation — the
write disappearing in packaged mode IS the fix — and say so in the report).

## Test plan

No new unit test is required: the change is gating diagnostics, and the done
criteria are grep-verifiable structure, which is the strongest available check
without launching a packaged build. If an existing test exercises
`getCourseFiles` with `preFetchedHtml` and a mocked `fs`, add one assertion
there: with `isPackaged: true` in the electron mock, `fs.promises.writeFile`
is NOT called with a `debug_playwright_` filename. (Check
`tests/integration/parser-real.test.ts` first — it may already run this path.)

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0
- [ ] `grep -rn "writeFile(\`debug" electron/` → 0 hits with relative paths
      (every dump uses `path.join(app.getPath('userData'), ...)`)
- [ ] All six sites listed in "Current state" are inside `!app.isPackaged`
      gates (manual inspection of the grep hits)
- [ ] `grep -n "Found credentials for" electron/main.ts` → 0 hits
- [ ] No modified files outside the in-scope list (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The dump sites don't match the excerpts (drift — plan 001 touches the same
  file; only STOP if the dump code itself differs, not on shifted line numbers).
- You find a dump whose output IS consumed by product code (search for reads
  of the `debug_*` filenames before assuming they are write-only).
- Gating a dump breaks a test in a way that isn't the test asserting on the
  dump itself.

## Maintenance notes

- Tracker `DATA-002` (logout/clear-all) should sweep
  `userData` for `debug_*.html` and `logs/` when implemented — these files
  predate this fix on existing installs.
- Tracker `OBS-001` owns the bigger picture: log rotation, redaction, and a
  single logging path instead of the console tee.
- The repo root contains historical artifacts from the CWD-relative writes
  (e.g. `debug_playwright_99999.html`, `scraper.log`) — untracked and
  gitignored; the owner should delete them manually (agents cannot unlink in
  this environment; see tracker notes).
- Reviewer: confirm the `:281` gate did not change `getCourseFiles` behavior —
  the dump was fire-and-forget, so only the write disappears.

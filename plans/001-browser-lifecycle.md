# Plan 001: Stop leaking a Chrome instance on every sync, and bound the quit teardown

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 700de9a..HEAD -- electron/services/playwright-login.service.ts electron/main.ts`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `700de9a`, 2026-08-28

## Why this matters

`PlaywrightLoginService.login()` and `.getCourses()` each launch a new headless
Chrome and assign it over `this.browser` without closing the previous one.
`close()` only closes the *current* handle, so every replaced instance —
browser, context, page, holding a live SIGAA session — leaks until the OS
process is killed. The app is designed to live in the tray (`runInBackground`,
default `syncInterval: 60` minutes), so a machine left on all day accumulates
roughly one orphaned Chrome tree (~150–300 MB) per hour, plus one per manual
sync. They survive app quit. This is the single largest resource bug in the
app. Second, smaller fix in the same subsystem: `before-quit` awaits the
browser teardown with no timeout, so a wedged Chrome makes the app
unquittable from its own UI (and blocks `quitAndInstall`).

## Current state

Relevant files:

- `electron/services/playwright-login.service.ts` — owns the single Playwright
  browser/context/page. The two leak sites and `close()` live here.
- `electron/main.ts` — `before-quit` handler that awaits teardown unbounded.

`login()` (excerpt, `playwright-login.service.ts:45`):

```ts
this.browser = await chromium.launch({
    channel: 'chrome',
    headless: true
});

const context = await this.browser.newContext({ ... });
const page = await context.newPage();
```

On success it stores the handles (`:118-119`):

```ts
this.context = context;
this.page = page;
```

`getCourses()` (excerpt, `:200-205`):

```ts
this.browser = await chromium.launch({
    channel: 'chrome',
    headless: true
});

const context = await this.browser.newContext();
```

and on success (`:342-343`):

```ts
this.context = context;
this.page = page;
```

`close()` (`:1124-1130`) — note it nulls `browser` but **not** `context`/`page`:

```ts
async close() {
    if (this.browser) {
        console.log('Playwright: Closing browser...');
        await this.browser.close();
        this.browser = null;
    }
}
```

`before-quit` in `electron/main.ts:272-284`:

```ts
app.on('before-quit', async (e) => {
  if (!isQuitting) {
    e.preventDefault();
    console.log('App is closing. Cleaning up background processes...');
    isQuitting = true;
    try {
      await sigaaService.logout();
    } catch (err) {
      console.error('Cleanup error:', err);
    }
    app.quit();
  }
});
```

`sigaaService.logout()` ends up in `playwrightLogin.close()` →
`browser.close()`, which can hang if Chrome is wedged mid-navigation.

Repo conventions that apply (from `CLAUDE.md`, read it before starting):

- No `try/catch` that only `console.error`s — either the error matters or the
  `try` shouldn't exist. In teardown code, a swallow is acceptable **only**
  with a comment explaining why the error is genuinely irrelevant.
- If you fix a bug, a test must exist that would fail without the fix.
- Never add `any` in boundary code; the lint warning count (currently 115)
  may not increase.

Callers you must NOT break (do not modify them; just know they exist):

- `electron/services/background-sync.service.ts:63` calls `getCourses()` every
  sync cycle.
- `electron/services/playwright-login.service.ts:356-360`:
  `enterCourseAndGetHTML` relies on `getCourses()` to relaunch the browser
  when `this.browser`/`this.context` are null. Your change must keep
  `getCourses()` leaving behind a live browser+context+page on success.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no output   |
| Tests     | `npx vitest run`   | all pass (baseline: ~70 passed, 4 skipped) |
| Lint      | `npx eslint .`     | 0 errors, ≤115 warnings |
| Full gate | `npm run quality`  | all three pass      |

## Scope

**In scope** (the only files you should modify):

- `electron/services/playwright-login.service.ts`
- `electron/main.ts` (only the `before-quit` handler)
- `tests/unit/playwright-lifecycle.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `electron/services/download.service.ts` — unreachable fallback, owned by
  tracker task `BUG-004`.
- Reusing the browser across `getCourses()` calls instead of relaunching.
  That is a performance improvement with different risk (a wedged-but-connected
  browser would hang instead of leak); it is deliberately deferred. This plan
  keeps the "fresh browser per call" semantics and only fixes the leak.
- `enterCourseAndGetHTML`'s discarded `getCourses()` result (`:359`) — a
  separate known bug (audit finding F6), not selected for this batch.
- `forceReset()` (`:136`) — has zero callers; leave as-is.

## Git workflow

- Branch: `advisor/001-browser-lifecycle`
- Conventional-commit style, matching `git log` (e.g.
  `fix: close the previous playwright browser before launching a new one`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `close()` tear down context and page too

In `playwright-login.service.ts`, extend `close()` so that after closing the
browser it also nulls `this.context` and `this.page`, and so a failing
`browser.close()` cannot abort teardown:

```ts
async close() {
    if (this.browser) {
        console.log('Playwright: Closing browser...');
        try {
            await this.browser.close();
        } catch (err) {
            // Teardown only: the browser may already be dead; the goal
            // (releasing the handles) is achieved either way.
            console.warn('Playwright: browser.close() failed during teardown:', err);
        }
        this.browser = null;
    }
    this.context = null;
    this.page = null;
}
```

Check the actual property types near the top of the class — if `context`/`page`
are typed without `| null`, widen the declarations rather than casting.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Close the previous browser before every launch

In **both** `login()` (just before the `chromium.launch` at ~`:45`) and
`getCourses()` (just before the `chromium.launch` at ~`:200`), add:

```ts
// A previous browser may still be running (earlier sync or login).
// Launching over it leaks the whole Chrome process tree.
await this.close();
```

Do not restructure anything else in either method.

**Verify**: `npx tsc --noEmit` → exit 0, and `npx vitest run` → all existing
tests still pass.

### Step 3: Write the regression test

Create `tests/unit/playwright-lifecycle.test.ts`. Model the module-mock setup
on `tests/integration/persistence-auth-recovery.test.ts:18-40` (uses
`vi.hoisted` + `vi.mock` before importing the production class).

Mock strategy:

- `vi.mock('playwright', ...)` — `chromium.launch` returns a fresh fake
  browser per call. Each fake browser: `close: vi.fn()`, plus
  `newContext: vi.fn()` returning a fake context with `addCookies: vi.fn()`,
  `newPage: vi.fn()`, `cookies: vi.fn(async () => [])`. The fake page needs
  the methods `login()` actually calls — check the source, at minimum:
  `goto`, `fill`, `click`, `waitForLoadState`, `url` (return
  `'https://si3.ufc.br/sigaa/portais/discente/discente.jsf'` so the
  login-failure branch at `:74` is not taken), `$` (return `null` — fallback
  name `'User'` is fine), `content` (return `'<html></html>'`), `on`.
- `vi.mock('electron', ...)` — `app: { getPath: () => 'test-userdata', isPackaged: true }`
  (setting `isPackaged: true` keeps the debug-dump branches inert).
- Check the imports at the top of `playwright-login.service.ts` and mock any
  other side-effectful module it pulls in (e.g. a logger service) the same way.

Tests to write:

1. **login twice closes the first browser**: call `login('u','p')` twice;
   assert `chromium.launch` was called twice and the **first** fake browser's
   `close` was called before the second launch (a call-order array works).
2. **close() releases everything**: after a successful `login()`, call
   `close()`; a subsequent `close()` is a no-op (browser already null) and
   does not throw.

Red-green proof (required by `CLAUDE.md` item 5): temporarily comment out the
`await this.close()` added in Step 2 inside `login()`, run the test, confirm
test 1 fails; restore it, confirm it passes. Note the result in your report.

**Verify**: `npx vitest run tests/unit/playwright-lifecycle.test.ts` → 2 passed.

### Step 4: Bound the quit teardown

In `electron/main.ts`, inside the `before-quit` handler, replace

```ts
await sigaaService.logout();
```

with

```ts
// A wedged Chrome can make browser.close() hang forever; quitting must
// not depend on it. 5s is generous for a healthy teardown.
await Promise.race([
  sigaaService.logout(),
  new Promise<void>((resolve) => setTimeout(() => {
    console.warn('Cleanup timed out after 5s; quitting anyway.');
    resolve();
  }, 5000))
]);
```

Keep the surrounding `try/catch` and `app.quit()` exactly as they are.

**Verify**: `npm run quality` → typecheck, lint and tests all pass; lint
warnings ≤115.

## Test plan

- New file `tests/unit/playwright-lifecycle.test.ts` (Step 3): launch-twice
  leak regression + idempotent `close()`.
- Pattern to follow: `tests/integration/persistence-auth-recovery.test.ts`
  (hoisted mocks, importing the production class — never a mirrored copy;
  see `tests/fixtures/README.md` for why).
- Verification: `npx vitest run` → all pass, 2 new.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run quality` exits 0 (0 lint errors, ≤115 warnings)
- [ ] `tests/unit/playwright-lifecycle.test.ts` exists and passes
- [ ] Both `chromium.launch` call sites in `playwright-login.service.ts` are
      immediately preceded by `await this.close()`
      (`grep -n -B3 "chromium.launch" electron/services/playwright-login.service.ts`)
- [ ] `close()` nulls `context` and `page`
- [ ] `electron/main.ts` `before-quit` uses `Promise.race` with a 5s timeout
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- Adding `await this.close()` before launch makes an **existing** test fail —
  that would mean some path depends on the old browser surviving a relaunch,
  which changes the risk assessment.
- You find a call site that holds a `page` reference across a `getCourses()`
  call and would now get "Target closed" (search for `this.page` usages before
  assuming; `enterCourseAndGetHTML` re-checks `this.page.isClosed()` at `:365`,
  which is the expected safe pattern).
- Mocking `playwright` proves impossible without touching production code.

## Maintenance notes

- The deferred improvement is browser **reuse** (`if (this.browser?.isConnected()) return`
  instead of relaunching) — cheaper syncs, but it must handle the
  wedged-but-connected case. Revisit alongside tracker task `CONC-001`.
- `enterCourseAndGetHTML:359` still discards the recovery `getCourses()`
  result and can null-deref at `:367` on an expired session (audit finding F6,
  effort S) — a natural follow-up in this same file.
- Reviewer should scrutinize: that `close()` being called at the top of
  `login()` cannot break the auto-login path (`main.ts:132-139` →
  `sigaaService.login`), and that the quit timeout doesn't race the updater's
  `quitAndInstall`.

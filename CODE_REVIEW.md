# SIGAA-ME Code Review

## Outcome

The project is not ready for semi-professional distribution yet. The architecture is promising and the production build succeeds, but security, privacy, dependency, and release-gate issues remain blockers.

## Priority findings

### P0 — Untrusted content can execute renderer JavaScript

SIGAA-provided news content, course names, filenames, and notification titles are interpolated directly into `innerHTML` without sanitization. Event-handler attributes such as `onerror` remain executable.

Relevant files:

- `src/pages/course-detail.ts`
- `src/pages/dashboard.ts`

Fix by rendering plain-text fields with `textContent` and sanitizing permitted rich text with a strict allowlist.

### P0 — Unrestricted IPC and navigation trust boundary

The preload exposes generic `send`, `on`, and `invoke` methods. Main-process handlers accept unvalidated paths, setting keys, and payloads. The window also has no `will-navigate` or `setWindowOpenHandler` policy, so an external page could inherit the preload API.

Relevant files:

- `electron/preload.ts`
- `electron/main.ts`

Expose only explicitly named, typed operations, validate every payload in the main process, reject unexpected origins, and open approved external links through `shell.openExternal`.

### P1 — Logout and clear-all-data do not isolate accounts

Logout deliberately preserves cached course/news content. A second account can initially see the previous account’s data. The clear-data handler removes credentials but leaves main-process cache, settings, and logs behind.

Relevant files:

- `src/pages/dashboard.ts`
- `electron/main.ts`
- `electron/services/cache.service.ts`

Bind caches to an account identifier and clear all documented stores when the user requests complete deletion.

### P1 — Background synchronization can race user actions

Course detail calls `pauseSync()` and `resumeSync()`, but neither function exists in the preload or main process. The `busyCount` only logs state and does not serialize operations. User actions and background sync can therefore share and navigate the same Playwright page concurrently.

Relevant files:

- `src/pages/course-detail.ts`
- `electron/preload.ts`
- `electron/services/sigaa.service.ts`

Implement real serialization/cancellation around the shared Playwright session.

### P1 — Broken unit suite is not release-gated

`tests/unit/sigaa-service.test.ts` has an unmatched closing brace and cannot be parsed. The release workflow runs only the build and publish commands; it does not run unit tests, integration smoke tests, linting, or audit checks.

Relevant files:

- `tests/unit/sigaa-service.test.ts`
- `.github/workflows/release.yml`
- `package.json`

Add the missing closure, define a real `test` script, and make publishing conditional on deterministic quality checks.

### P1 — Vulnerable and inconsistent dependency tree

As checked on July 10, 2026:

- Production-only `npm audit`: 4 vulnerable packages, including 3 high-severity advisories.
- Full audit: 16 vulnerable packages, including 1 critical and 12 high-severity advisories.
- Directly relevant packages include Axios, Electron, electron-builder, Vite, and `@vitest/browser`.
- `npm ls` reports an invalid Vite/Vitest peer dependency tree: Vitest 4 expects newer Vite versions while the project directly uses Vite 5.

Upgrade the runtime and tooling as a coordinated set, regenerate the lockfile, and retest packaging and scraping.

### P2 — Developer action ships in production

The tray menu always includes `[Dev] Simular Arquivo Novo`, which mutates the cache and creates artificial update behavior. Guard it with `!app.isPackaged` or remove it from production builds.

Relevant file: `electron/main.ts`.

### P2 — Download fallback can reject valid files

Unknown content is assumed to be PDF and then subjected to PDF magic-byte validation. Legitimate non-PDF files served as `application/octet-stream` can therefore be deleted after download. Resolved download paths should also be verified to remain below the selected base directory.

Relevant file: `electron/services/http-scraper.service.ts`.

## Additional criteria

- **Accessibility:** The document declares `lang="en"` despite Portuguese content; icon-only controls rely mainly on `title`; the news modal lacks dialog semantics, focus management, and Escape-key handling.
- **Maintainability:** Several services and pages are very large, use extensive `any` types, and contain duplicated download/navigation logic.
- **Observability:** Logging is synchronous, duplicated, unbounded, and may retain course names, filenames, paths, and other sensitive data.
- **Release security:** Windows artifacts are unsigned, and the README instructs users to bypass SmartScreen warnings.
- **Testing:** There is no lint command, coverage threshold, or CI test gate. E2E/integration tests depend on live SIGAA access and credentials.

## Verification performed

- `npx tsc --noEmit`: passed.
- `npx vite build`: passed.
- `npx vitest run tests/unit`: 46 tests passed; one suite failed to parse.
- `npm test`: failed because the script is not defined.
- Integration/E2E tests were not run because they require live SIGAA access and credentials.
- Working tree was clean and no source files were modified during the review.

## Recommendation

Treat the app as beta/personal-use software until the P0/P1 findings are fixed, dependencies are upgraded, test gates are enforced, and account/data deletion behavior is made explicit and verifiable.

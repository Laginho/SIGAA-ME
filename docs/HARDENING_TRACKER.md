# SIGAA-ME Hardening Tracker

This document is the repository-owned source of truth for the security,
reliability, privacy, accessibility, dependency, and release work identified in
`CODE_REVIEW.md`.

It is deliberately written so a new chat, contributor, or coding agent can
resume work without needing the original review conversation.

## How to use this tracker

1. Read the **Current handoff** section.
2. Select one task whose dependencies are complete.
3. Change its status to `IN PROGRESS` and add an owner or task/thread name.
4. Read every file and acceptance criterion listed for that task.
5. Keep the task scoped. If new work is discovered, add a linked task instead
   of silently expanding the current one.
6. Run the task's verification commands.
7. Record the commit, test results, relevant design decisions, and remaining
   risks in the task's implementation notes.
8. Change the status to `DONE` only when every acceptance criterion passes.

Agents must not delete completed tasks. The history is part of the handoff.

## Status vocabulary

| Status | Meaning |
|---|---|
| `NOT STARTED` | No implementation is in progress. |
| `IN PROGRESS` | An owner is actively implementing the task. |
| `BLOCKED` | Work cannot continue; the blocker must be recorded. |
| `IN REVIEW` | Implementation is complete and awaiting review/verification. |
| `DONE` | Acceptance criteria and verification are complete. |
| `PARTIAL` | Some protection exists, but the task is not complete. |

## Priority vocabulary

| Priority | Release meaning |
|---|---|
| `P0` | Distribution blocker; exploitable trust-boundary failure. |
| `P1` | Beta/release blocker; significant privacy or reliability risk. |
| `P2` | Must be scheduled before broader distribution. |
| `P3` | Maintainability or defense-in-depth improvement. |

## Current baseline

- Baseline commit: `5968a40`
- Typecheck: passing at the baseline.
- Deterministic Vitest suite: 68 passed, 4 live tests skipped.
- Live SIGAA smoke tests: opt-in with `RUN_LIVE_SIGAA_TESTS=true`.
- Production dependency audit on 2026-07-10: 4 vulnerable packages,
  including 3 high-severity findings.
- Installed Vite/Vitest mismatch: Vite `5.4.21`; Vitest `4.1.4` declares
  Vite `^6 || ^7 || ^8` as its peer range.
- `CODE_REVIEW.md` is the originating review; this tracker supersedes it for
  implementation status.

## Master dependency order

The safe implementation order is:

1. `ARCH-001` shared domain and IPC contracts.
2. `SEC-001` renderer content safety.
3. `SEC-002` typed preload and validated IPC.
4. `SEC-003` navigation and external-link policy.
5. `DATA-001` stable account identity and account-scoped cache.
6. `DATA-002` logout and clear-all semantics.
7. `CONC-001` Playwright operation coordinator.
8. `DL-001` download path containment.
9. `DL-002` content-type and file validation.
10. `OBS-001` bounded, redacted logging and diagnostics.
11. `A11Y-001` accessibility remediation.
12. `DEP-001` dependency/security upgrade set.
13. `QA-001` deterministic quality gates and coverage.
14. `REL-001` signing and gated publishing.
15. `PORTAL-*` tasks may begin after `ARCH-001`; their live canary must be in
    place before claiming portal compatibility for a release.

Tasks from later phases may be researched early, but their implementation must
not bypass incomplete trust-boundary work.

---

## P0 security work

### ARCH-001 — Shared domain models and IPC result contracts

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: none
- Primary files:
  - New: `shared/domain.ts`
  - New: `shared/ipc-contracts.ts`
  - New: `shared/errors.ts`
  - `tsconfig.json`
  - `src/vite-env.d.ts`
  - `electron/electron-env.d.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`

#### Required interfaces

- `AccountId`, `AccountProfile`
- `CourseId`, `CourseSummary`, `CourseSnapshot`
- `CourseFile`, `NewsSummary`, `NewsDetail`
- `DownloadToken`, `DownloadRecord`, `DownloadResult`
- `AppResult<T>` as a discriminated success/failure union
- Stable `AppErrorCode` values for validation, session expiry, selector drift,
  cancellation, storage, downloads, and portal availability
- `RendererApi` as the only public preload contract

Renderer-facing file records must not contain JSF scripts, `onclick` content,
ViewState values, cookies, or internal SIGAA URLs.

#### Acceptance criteria

- Main, preload, and renderer import the same contract definitions.
- No IPC method returns an untyped `Promise<any>`.
- Existing flows compile against `AppResult<T>`.
- Error consumers distinguish retryable portal failures from invalid requests.
- `tsconfig.json` includes the shared contract directory.

#### Verification

```text
npm run typecheck
npm test
```

#### Implementation notes

- Commit: —
- Decisions: —
- Follow-ups: —

### SEC-001 — Prevent untrusted SIGAA content from executing in the renderer

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `src/security/html-sanitizer.ts`
  - New: `src/utils/dom.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/settings.ts`
  - `src/components/toast.ts`
  - `index.html`
  - `package.json`
  - `package-lock.json`
  - New: `tests/unit/html-sanitizer.test.ts`
  - New: `tests/unit/renderer-content-security.test.ts`

#### Required behavior

- Render account names, course names, course codes, periods, filenames,
  notification titles, dates, paths, and errors with `textContent`.
- Replace inline `onclick` and `onerror` attributes with event listeners.
- Keep untrusted values out of HTML attributes and inline route strings.
- Permit rich HTML only for news bodies and only after a strict allowlist
  sanitizer.
- Sanitize news content before caching and again before rendering.
- Reject event attributes, forms, iframes, SVG, scripts, styles, and unsafe URL
  protocols.
- Add a production Content Security Policy that does not permit inline scripts
  or `unsafe-eval`.

#### Acceptance criteria

- Malicious fixtures cannot create executable renderer nodes.
- No untrusted value is interpolated into `innerHTML`.
- `toast.error('<img onerror=...>')` displays literal text.
- Course cards and notification rows use listeners rather than inline handlers.
- The CSP blocks inline event-handler execution as defense in depth.

#### Verification

```text
npm run test:unit -- html-sanitizer renderer-content-security toast
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Sanitizer/version: —
- Allowlist changes: —

### SEC-002 — Replace unrestricted IPC with a typed, validated API

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/ipc/register-handlers.ts`
  - New: `electron/ipc/validation.ts`
  - New: `electron/ipc/sender-policy.ts`
  - New: `electron/services/session-catalog.service.ts`
  - `electron/preload.ts`
  - `electron/main.ts`
  - `electron/electron-env.d.ts`
  - `src/vite-env.d.ts`
  - `src/main.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/settings.ts`
  - `src/pages/sync-selection.ts`
  - New: `tests/unit/ipc-validation.test.ts`

#### Required API changes

- Remove `window.ipcRenderer` completely.
- Expose only explicitly named `RendererApi` methods.
- Validate the sender frame/origin before executing every handler.
- Validate payload types, lengths, allowed properties, and identifiers.
- Replace arbitrary `updateSetting(key, value)` with a discriminated union.
- Exclude `lastBackgroundSync` and the download root from renderer-mutable
  settings.
- Move JSF scripts and internal file URLs into `SessionCatalogService`.
- Renderer downloads reference an opaque `DownloadToken`.
- Renderer course/news requests send stable IDs, not trusted names or scripts.
- Renderer must not submit arbitrary base directories or filesystem paths.
- Event subscriptions expose data only, never the Electron event object.
- Move `simulateNewFile` into an optional development-only `testApi`.

#### Acceptance criteria

- `window.ipcRenderer` is undefined in the packaged renderer.
- Unknown channels cannot be invoked from renderer code.
- Invalid payloads return `INVALID_REQUEST` without touching services.
- JSF scripts never cross the IPC boundary.
- Download tokens expire on logout/relogin.
- Production builds do not expose the cache mutation test API.

#### Verification

```text
npm run typecheck
npm run test:unit -- ipc-validation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Channel migration: —
- Removed APIs: —

### SEC-003 — Enforce BrowserWindow navigation and external-link policy

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: `SEC-002`
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `shared/ipc-contracts.ts`
  - New: `tests/unit/navigation-policy.test.ts`
  - New: `tests/e2e/security-boundaries.spec.ts`

#### Required behavior

- Explicitly set `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, and `webSecurity: true` after preload compatibility is
  verified.
- Deny unexpected `will-navigate` destinations.
- Deny renderer-created windows through `setWindowOpenHandler`.
- Open links only through a validated `openExternal` operation.
- Permit only HTTPS links without embedded credentials.
- Directly allow documented UFC/SIGAA and project GitHub hosts.
- Require confirmation for other HTTPS hosts or deny them according to the
  final product policy.
- Reject `javascript:`, `file:`, `data:`, `blob:`, and unknown schemes.

#### Acceptance criteria

- An external navigation cannot inherit the preload API.
- `window.open()` is denied by default.
- Unsafe schemes never reach `shell.openExternal`.
- Approved links open in the OS browser, not inside the Electron window.

#### Verification

```text
npm run test:unit -- navigation-policy
npm run test:e2e -- security-boundaries
```

#### Implementation notes

- Commit: —
- Approved domains: —
- Sandbox exceptions: —

---

## P1 privacy and reliability work

### DATA-001 — Bind all persisted state to a stable account identity

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`, `SEC-002`
- Primary files:
  - New: `electron/services/account-context.service.ts`
  - New: `src/data/account-storage.ts`
  - New: `src/data/session-store.ts`
  - `electron/services/cache.service.ts`
  - `electron/services/persistence.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/main.ts`
  - `src/main.ts`
  - `src/pages/login.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/sync-selection.ts`
  - `src/utils/notification-store.ts`
  - `src/utils/ui-helpers.ts`
  - New: `tests/unit/account-storage.test.ts`
  - New: `tests/integration/account-isolation.test.ts`

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

#### Acceptance criteria

- Account B cannot view account A's courses, files, news, photo, notifications,
  read state, or download history.
- Returning to account A may reuse only account A's namespaced cache.
- Legacy unscoped data cannot appear after another user logs in.
- Cache and settings schemas are versioned and runtime-validated.

#### Verification

```text
npm run test:unit -- account-storage
npm run test:integration -- account-isolation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Migration decision: reset or quarantine
- Schema version: —

### DATA-002 — Implement complete logout and clear-all transactions

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `DATA-001`, `CONC-001`
- Primary files:
  - `electron/main.ts`
  - `electron/services/persistence.service.ts`
  - `electron/services/cache.service.ts`
  - `electron/services/logger.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `src/pages/dashboard.ts`
  - `src/data/account-storage.ts`
  - `src/data/session-store.ts`
  - New: `tests/integration/clear-all-data.test.ts`

#### Logout transaction

1. Cancel background synchronization.
2. Wait for the active session operation to reach a safe boundary.
3. Close browser contexts and clear in-memory cookies.
4. Clear remembered credentials.
5. Clear active account/catalog context.
6. Unsubscribe renderer listeners.
7. Clear sessionStorage.
8. Preserve only inaccessible account-scoped cache if the product chooses to
   support fast return for the same account.

#### Clear-all transaction

In addition to logout, remove:

- All backend account caches.
- All renderer account namespaces.
- Settings and in-memory settings state.
- Download history metadata.
- Notification/read state.
- Browser storage for the application partition.
- Logs and diagnostic captures.

Downloaded documents outside Electron `userData` must not be deleted silently.
The confirmation UI must state that explicitly.

#### Acceptance criteria

- The handler returns success only after deletion completes.
- A restart after clear-all behaves like first launch.
- Clear-all cannot race a background write that recreates deleted state.
- Partial deletion returns a specific storage error and records safe recovery
  instructions.

#### Verification

```text
npm run test:integration -- clear-all-data account-isolation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Stores cleared: —
- Intentionally preserved data: downloaded documents only

### CONC-001 — Serialize and cancel shared Playwright operations

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/services/session-operation-coordinator.service.ts`
  - New: `shared/operation.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/main.ts`
  - `src/pages/course-detail.ts`
  - New: `tests/unit/session-operation-coordinator.test.ts`
  - New: `tests/integration/background-sync-serialization.test.ts`

#### Required behavior

- Replace `busyCount`; it currently does not serialize work.
- Permit only one Playwright/session-mutating operation at a time.
- Represent operations as `interactive`, `background`, `auth`, or `shutdown`.
- Use `AbortSignal` for cancellation.
- Allow logout/clear-all to cancel queued work and wait for a safe boundary.
- Let interactive work cancel or supersede background work without corrupting
  cookies, ViewState, or page navigation.
- Check cancellation between courses, news items, retry attempts, and downloads.
- Remove nonexistent renderer calls to `pauseSync()` and `resumeSync()`.
- Return `OPERATION_CANCELLED` rather than a generic failure.

#### Acceptance criteria

- Background sync and course navigation cannot use the same Playwright page
  concurrently.
- Nested background calls do not deadlock by reacquiring the coordinator.
- Logout does not close a browser underneath an untracked operation.
- A cancelled background sweep does not publish partial data as a complete
  successful sync.

#### Verification

```text
npm run test:unit -- session-operation-coordinator
npm run test:integration -- background-sync-serialization
```

#### Implementation notes

- Commit: —
- Queue policy: —
- Cancellation boundaries: —

---

## Download safety work

### DL-001 — Enforce download root and path containment

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `SEC-002`
- Primary files:
  - New: `electron/services/download-path.service.ts`
  - `electron/main.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/download.service.ts`
  - `electron/services/persistence.service.ts`
  - `src/pages/course-detail.ts`
  - New: `tests/unit/download-path-security.test.ts`

#### Required behavior

- Renderer cannot provide a download root.
- Main resolves the root from a native folder selection persisted internally.
- Sanitize course and file components, including Windows reserved names and
  maximum lengths.
- Prove target containment with resolved/real paths and `path.relative()`.
- Reject absolute components, traversal, empty names, and symlink escapes.
- Write into a temporary `.part` file before atomic rename.
- Apply one shared path policy to HTTP and Playwright downloads.

#### Acceptance criteria

- `../`, absolute paths, drive prefixes, device names, and symlink escapes are
  rejected.
- Duplicate checks use the same sanitized final path as the writer.
- No renderer-provided path can cause reads outside the approved root.

#### Verification

```text
npm run test:unit -- download-path-security
npm run test:integration -- download-boundary
```

#### Implementation notes

- Commit: —
- Platform cases covered: —

### DL-002 — Correct content-type detection and file validation

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
- Dependencies: `DL-001`
- Primary files:
  - New: `electron/services/file-validation.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/download.service.ts`
  - New: `tests/unit/file-validation.test.ts`
  - New: `tests/integration/download-boundary.test.ts`

#### Required behavior

- Remove the unknown-to-PDF fallback.
- Resolve type from safe existing extension, Content-Disposition, known MIME,
  and magic bytes in that order.
- Use `.bin` or no extension when content genuinely remains unknown.
- Always reject HTML/login/error pages.
- Reject known extensions with incompatible signatures.
- Do not reject legitimate unknown binary data solely because no signature is
  registered.
- Set maximum response size and streamed-byte limits.
- Share validation logic between HTTP and Playwright download paths.

#### Acceptance criteria

- Valid octet-stream non-PDF fixtures survive validation.
- HTML masquerading as PDF is rejected and the temporary file is removed.
- Known Office/archive/image signatures are recognized.
- Failed downloads leave no partial final file.

#### Verification

```text
npm run test:unit -- file-validation
npm run test:integration -- download-boundary
```

#### Implementation notes

- Commit: —
- Supported signatures: —
- Maximum size: —

---

## Operational quality work

### OBS-001 — Centralize, redact, rotate, and clear logs

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files:
  - `electron/services/logger.service.ts`
  - New: `electron/services/diagnostics.service.ts`
  - `electron/main.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/download.service.ts`
  - New: `tests/unit/logger-redaction.test.ts`

#### Required behavior

- Remove global console monkeypatching.
- Remove the separate unbounded scraper log.
- Use one injected logger with component scopes and operation IDs.
- Buffer writes and rotate by size with finite retention.
- Redact passwords, cookies, headers, usernames, full paths, raw HTML, JSF
  scripts, course names, and filenames from normal production logs.
- Keep HTML/trace diagnostics development-only or explicit-consent only.
- Apply retention and deletion to diagnostics.

#### Acceptance criteria

- Secrets and academic content do not appear in production logs.
- Log growth is bounded.
- Clear-all removes logs and diagnostics.
- Logger failures do not recursively call the same failing logger.

#### Verification

```text
npm run test:unit -- logger-redaction
```

#### Implementation notes

- Commit: —
- Rotation policy: —
- Redaction policy: —

### A11Y-001 — Fix document, controls, and modal accessibility

- Status: `NOT STARTED`
- Priority: `P2`
- Owner: —
- Dependencies: `SEC-001`
- Primary files:
  - `index.html`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/sync-selection.ts`
  - `src/pages/settings.ts`
  - `src/styles/main.css`
  - `src/styles/dashboard.css`
  - `src/styles/course-detail.css`
  - `src/styles/sync-selection.css`
  - New: `tests/e2e/accessibility.spec.ts`

#### Required behavior

- Change language to `pt-BR`.
- Label icon-only controls with accessible names.
- Convert clickable cards/rows to semantic buttons or links.
- Add visible `:focus-visible` states and reduced-motion behavior.
- Add `aria-expanded`/`aria-controls` to the notification menu.
- Give the news modal dialog semantics, Escape handling, focus trapping,
  background inertness, and focus restoration.

#### Acceptance criteria

- All primary flows work with keyboard only.
- Modal focus cannot escape while open and returns to the trigger on close.
- Automated accessibility checks have no critical/serious violations in the
  tested screens.

#### Verification

```text
npm run test:e2e -- accessibility
```

#### Implementation notes

- Commit: —
- Automated scanner: —

### DEV-001 — Remove production developer cache mutation actions

- Status: `PARTIAL`
- Priority: `P2`
- Owner: —
- Dependencies: none
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/vite-env.d.ts`
  - `tests/e2e/app.spec.ts`

#### Current state

- The IPC handler is guarded by `!app.isPackaged`.
- The tray still always includes `[Dev] Simular Arquivo Novo`.
- The preload still always exposes `simulateNewFile`.

#### Acceptance criteria

- Production tray contains no cache mutation command.
- Production preload exposes no simulation method.
- E2E retains an explicit development-only test bridge.

#### Verification

```text
npm run build
npm run test:e2e
```

#### Implementation notes

- Commit: —

### DEP-001 — Upgrade vulnerable and incompatible dependencies

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: security tests should be in place before broad upgrades
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `vite.config.ts`
  - `vitest.config.ts`
  - `playwright.config.ts`

#### Required sequence

1. Upgrade Axios to a release outside the current vulnerable ranges.
2. Select a Vite major supported by Vitest 4 and the Electron Vite plugins.
3. Upgrade Electron and Playwright as a tested runtime set.
4. Upgrade electron-builder and electron-updater together.
5. Align all Vitest browser/UI/coverage packages to one version.
6. Regenerate the lockfile from a clean dependency install.
7. Run `npm ls`, full audit, production audit, packaging, and scraper tests.

#### Acceptance criteria

- `npm ls` reports no invalid peer tree.
- Production audit has no high or critical findings.
- Full audit findings are documented or fixed before release.
- Packaged Electron login/navigation/download smoke tests pass.

#### Verification

```text
npm ls
npm audit
npm audit --omit=dev
npm run quality
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Selected Vite major: —
- Audit summary: —

### QA-001 — Add deterministic test, lint, coverage, and audit gates

- Status: `PARTIAL`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`, critical security tests
- Primary files:
  - `package.json`
  - `vitest.config.ts`
  - `playwright.config.ts`
  - New: `eslint.config.js`
  - New: `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - Existing tests under `tests/`

#### Current state

- Unit suite parse failure is fixed.
- Live SIGAA tests are opt-in.
- `package.json` still has no default `test`, lint, coverage, audit, or quality
  script.
- Release workflow publishes after only install/build.

#### Required scripts

- `test`
- `test:unit`
- `test:integration`
- `test:live`
- `typecheck`
- `lint`
- `coverage`
- `audit:prod`
- `quality`

#### Acceptance criteria

- Pull requests run deterministic checks without SIGAA credentials.
- Live canary is separate and opt-in/scheduled.
- Coverage thresholds protect sanitizer, IPC validation, account storage,
  coordinator, and download path modules.
- Publishing cannot start unless quality checks pass.
- Lint prevents new unrestricted `any` usage in shared/security code.

#### Verification

```text
npm ci
npm run quality
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Coverage thresholds: —

### REL-001 — Sign and verify Windows releases

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `DEP-001`, `QA-001`
- Primary files:
  - `.github/workflows/release.yml`
  - `electron-builder.json5`
  - `package.json`
  - `README.md`
  - `RELEASE_GUIDE.md`

#### Required workflow

1. Quality job.
2. Package job.
3. Sign-and-verify job.
4. Checksum generation.
5. Publish job dependent on all previous jobs.

#### Acceptance criteria

- CI uses `npm ci`.
- Published installer and portable executable have a verified expected
  publisher signature.
- CI fails on unsigned or unexpectedly signed artifacts.
- Release includes SHA-256 checksums.
- README no longer tells users to bypass SmartScreen.
- Signing secret setup, rotation, and revocation are documented.

#### Verification

```text
npm run quality
npm run package:win
Get-AuthenticodeSignature <artifact>
```

#### Implementation notes

- Commit: —
- Signing provider/publisher: —

---

## SIGAA portal compatibility work

Detailed operating procedures live in `docs/PORTAL_COMPATIBILITY.md`.

### PORTAL-001 — Centralize the SIGAA compatibility adapter

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/sigaa/selectors.ts`
  - New: `electron/sigaa/portal-contracts.ts`
  - New: `electron/sigaa/portal-state-classifier.ts`
  - New: `electron/sigaa/portal-adapter.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/http-scraper.service.ts`

#### Acceptance criteria

- Selectors and portal structural assumptions are not scattered through
  services.
- Each operation validates starting and ending portal state.
- Adapter failures use stable selector/state error codes.

#### Verification

```text
npm run test:integration -- portal
```

#### Implementation notes

- Commit: —

### PORTAL-002 — Build sanitized, versioned portal fixtures

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`
- Primary files:
  - New: `tests/fixtures/sigaa/README.md`
  - New fixtures under `tests/fixtures/sigaa/<adapter-version>/`
  - `tests/integration/portal-selector-resilience.test.ts`

#### Acceptance criteria

- Fixtures cover login, invalid credentials, student home, empty/populated
  courses, course home, empty/populated files, news, expired session, access
  denied, and maintenance.
- Fixtures contain no personal data, cookies, credentials, or real ViewState.
- Parser/state-classifier tests run against every fixture.

#### Verification

```text
npm run test:integration -- portal
```

#### Implementation notes

- Commit: —
- Fixture version: —

### PORTAL-003 — Add privacy-safe structural diagnostics

- Status: `PARTIAL`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`, `OBS-001`
- Primary files:
  - `electron/services/playwright-login.service.ts`
  - New: `electron/services/diagnostics.service.ts`
  - New: `tests/unit/diagnostics-redaction.test.ts`

#### Current state

- Selector-drift tests and explicit errors exist.
- Development HTML captures exist but are not centrally sanitized or retained.

#### Acceptance criteria

- Failure diagnostics include state, URL family, title, selector counts,
  adapter version, and DOM structural fingerprint.
- Personal text, credentials, cookies, ViewState, and academic content are
  removed.
- HTML/screenshots/traces require development mode or explicit consent.
- Retention is bounded and clear-all removes diagnostics.

#### Verification

```text
npm run test:unit -- diagnostics-redaction
npm run test:integration -- portal
```

#### Implementation notes

- Commit: —

### PORTAL-004 — Add an opt-in scheduled live compatibility canary

- Status: `PARTIAL`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`, `PORTAL-003`, `QA-001`
- Primary files:
  - `tests/integration/scraper.test.ts`
  - New: `.github/workflows/sigaa-canary.yml`
  - `package.json`

#### Current state

- Live smoke tests exist and are opt-in.
- There is no scheduled workflow, compatibility fingerprint, or alerting.

#### Acceptance criteria

- Canary uses a dedicated minimum-privilege test account.
- Normal pull requests never require SIGAA credentials.
- Canary validates login, portal classification, course enumeration, course
  entry, files/news structure, and logout.
- It does not require a fixed number of courses or files.
- Failures produce privacy-safe diagnostics and notify maintainers.
- Temporary SIGAA outages do not block ordinary development.

#### Verification

```text
RUN_LIVE_SIGAA_TESTS=true npm run test:live
```

#### Implementation notes

- Commit: —
- Schedule: —
- Alert destination: —

### PORTAL-005 — Add compatibility degradation and kill-switch behavior

- Status: `NOT STARTED`
- Priority: `P1`
- Owner: —
- Dependencies: `PORTAL-001`, `CONC-001`
- Primary files:
  - New: `electron/services/portal-compatibility.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/sync-selection.ts`

#### Acceptance criteria

- Repeated structural failures disable background sync and auto-downloads.
- Cached account-scoped data remains viewable.
- UI explains that SIGAA changed and sync is temporarily unavailable.
- App avoids repeated login attempts that could lock an account.
- A successful verified canary/manual check can restore compatibility state.

#### Verification

```text
npm run test:integration -- portal-compatibility
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Trigger threshold: —

---

## Current handoff

### Ready to start

1. `ARCH-001` — shared types and result contracts.
2. `PORTAL-001` may be researched in parallel but should consume `ARCH-001`
   contracts before merging.

### Recently completed

- Unit-suite unmatched closure fixed in commit `5968a40`.
- Live SIGAA smoke tests made opt-in in commit `5968a40`.
- Selector-drift and persistence recovery tests added in commit `5968a40`.

### Known blockers and cautions

- Do not broaden the preload API while migrating it.
- Do not assign legacy unscoped cache to the next logged-in account.
- Do not update all major dependencies in the same commit as scraper behavior.
- Do not commit real SIGAA HTML until it has passed the fixture sanitization
  checklist in `docs/PORTAL_COMPATIBILITY.md`.
- Do not treat fixture tests as proof that the live portal is unchanged.

## Verification ledger

Append results here after meaningful milestones.

| Date | Commit | Commands | Result | Notes |
|---|---|---|---|---|
| 2026-07-10 | `5968a40` | `npx.cmd tsc --noEmit`; `npx.cmd vitest run` | Pass | 68 passed, 4 live tests skipped. |

## Task change log

Record status or scope changes that affect other agents.

| Date | Task | Change | Author/task |
|---|---|---|---|
| 2026-07-10 | Tracker | Initial repository-owned hardening tracker created. | Codex |


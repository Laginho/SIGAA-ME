# SIGAA Portal Compatibility Playbook

SIGAA-ME automates a portal designed for human interaction. Its pages use JSF
ViewState, JavaScript-generated form submissions, session-sensitive navigation,
and markup that may change without notice. Passing deterministic tests is
necessary, but it cannot prove that the live portal is still compatible.

This document defines how the project detects, contains, diagnoses, and repairs
portal drift without corrupting sessions or exposing student data.

Implementation status is tracked by the `PORTAL-*` tasks in
`docs/HARDENING_TRACKER.md`.

## Compatibility principles

1. **Centralize portal assumptions.** Selectors and JSF knowledge belong in a
   compatibility adapter, not in UI or orchestration code.
2. **Classify state before acting.** Never click or parse until the current page
   state is known.
3. **Validate transitions.** Every operation declares expected start and end
   states.
4. **Use multiple signals.** One text selector is not enough to prove a page is
   correct.
5. **Fail closed.** Unknown state stops navigation and background mutation.
6. **Preserve safe cached access.** Portal failure should not destroy valid,
   account-scoped offline data.
7. **Collect minimal diagnostics.** Debug evidence must not expose credentials,
   session tokens, or academic content.
8. **Combine deterministic and live evidence.** Neither layer is sufficient by
   itself.

## Proposed compatibility boundary

```text
electron/sigaa/
├── selectors.ts
├── portal-contracts.ts
├── portal-state-classifier.ts
├── structural-fingerprint.ts
├── portal-adapter.ts
└── fixture-sanitizer.ts
```

### Responsibilities

`selectors.ts`

- Stores all selectors and fallback selector groups.
- Documents page, purpose, expected cardinality, and last verified adapter
  version.
- Contains no navigation logic.

`portal-contracts.ts`

- Defines portal state, transition, fingerprint, and diagnostic types.
- Defines the adapter version.

`portal-state-classifier.ts`

- Converts URL, title, forms, landmarks, and error content into a known state.
- Does not mutate or navigate the page.

`structural-fingerprint.ts`

- Produces a privacy-safe representation of page structure.
- Excludes text content and sensitive input values.

`portal-adapter.ts`

- Owns portal navigation and parsing operations.
- Validates start/end states and transition invariants.
- Returns typed domain data or stable compatibility errors.

`fixture-sanitizer.ts`

- Removes secrets and personal content before a captured page becomes a test
  fixture.
- Rejects a fixture if sensitive patterns remain.

## Adapter versioning

Use a human-readable adapter identifier:

```ts
export const PORTAL_ADAPTER_VERSION = 'ufc-sigaa-2026.07-v1';
```

Increment it when:

- A selector family changes.
- Page classification rules change.
- JSF form parsing changes.
- A fallback path is added or removed.
- A fixture set represents a newly observed live structure.

Include the version in diagnostics, canary output, and cache metadata. A version
change does not automatically invalidate all domain cache, but it must invalidate
session-bound download tokens and raw parser state.

## Portal state model

The initial state vocabulary should be:

```ts
type PortalState =
  | 'LOGIN'
  | 'LOGIN_ERROR'
  | 'STUDENT_HOME'
  | 'STUDENT_PORTAL'
  | 'COURSE_HOME'
  | 'FILES_SECTION'
  | 'NEWS_DETAIL'
  | 'SESSION_EXPIRED'
  | 'ACCESS_DENIED'
  | 'MAINTENANCE'
  | 'UNKNOWN';
```

### Required classification signals

Classifiers should inspect several independent signals:

- URL pathname and query family.
- Page title.
- Presence and names of forms.
- Presence of `javax.faces.ViewState`.
- Login fields.
- Student portal landmarks.
- Course ID inputs and virtual-classroom links.
- Course navigation landmarks.
- File/news component patterns.
- Known access-denied, session-expired, and maintenance elements.

Text should only be used when no stable structural signal exists, and text
matching must tolerate whitespace, accents, and localization differences.

### Confidence and conflicts

The classifier should return evidence, not only a state:

```ts
interface PortalStateResult {
  state: PortalState;
  confidence: 'high' | 'medium' | 'low';
  matchedSignals: string[];
  missingSignals: string[];
  conflictingSignals: string[];
}
```

Mutating operations require high-confidence start states. Medium or low
confidence must fail closed with a diagnostic reference.

## Transition contracts

Each adapter operation declares allowed transitions.

| Operation | Allowed start | Expected end | Failure states |
|---|---|---|---|
| Login | `LOGIN` | `STUDENT_HOME` or `STUDENT_PORTAL` | `LOGIN_ERROR`, `MAINTENANCE`, `UNKNOWN` |
| List courses | `STUDENT_HOME`, `STUDENT_PORTAL` | Same state with validated course structure | `SESSION_EXPIRED`, `UNKNOWN` |
| Enter course | `STUDENT_PORTAL` | `COURSE_HOME` | `SESSION_EXPIRED`, `ACCESS_DENIED`, `UNKNOWN` |
| Open files | `COURSE_HOME` | `FILES_SECTION` | `SESSION_EXPIRED`, `UNKNOWN` |
| Open news | `COURSE_HOME` | `NEWS_DETAIL` | `SESSION_EXPIRED`, `UNKNOWN` |
| Logout | Any authenticated state | `LOGIN` | `UNKNOWN` with forced context close |

An operation must not continue merely because a click did not throw. It must
classify and validate the resulting page.

## Selector registry

Selectors should be grouped by semantic purpose:

```ts
interface SelectorDefinition {
  id: string;
  pageStates: PortalState[];
  primary: string;
  fallbacks: string[];
  expected: { min: number; max?: number };
  required: boolean;
  notes: string;
}
```

Example registry entry:

```ts
{
  id: 'portal.course-id-input',
  pageStates: ['STUDENT_PORTAL'],
  primary: 'input[name="idTurma"]',
  fallbacks: [],
  expected: { min: 0 },
  required: false,
  notes: 'May be absent when an account has no active courses.'
}
```

The page-state classifier must distinguish “valid empty course list” from
“selector disappeared.” This requires a separate stable empty-state or portal
landmark rather than assuming zero course inputs always means drift.

## Structural fingerprints

A fingerprint should detect layout change without retaining personal text.

Include:

- Normalized URL pathname family.
- Title category, not raw student-specific title.
- Form names and actions with query values removed.
- Input names and types, never input values.
- Counts of key selector groups.
- Stable IDs/class tokens after excluding generated numeric suffixes.
- Presence of ViewState, never its value.
- Hash of the normalized structural representation.

Exclude:

- Body text.
- Usernames and display names.
- Course names and codes.
- Filenames and news titles/content.
- Cookies and headers.
- ViewState or hidden input values.
- Download URLs and JSF scripts.

Fingerprint changes are a warning signal. They are not automatically proof of
incompatibility if all transition invariants still pass.

## Fixture library

Fixtures belong under:

```text
tests/fixtures/sigaa/<adapter-version>/
```

Required scenarios:

| Fixture | Purpose |
|---|---|
| `login.html` | Login classification and selectors. |
| `login-invalid.html` | Invalid credential response. |
| `student-home.html` | Post-login home classification. |
| `student-portal-empty.html` | Legitimate zero-course state. |
| `student-portal-courses.html` | Course parsing and navigation metadata. |
| `course-home-empty.html` | Valid course with no materials/news. |
| `course-home-populated.html` | Files/news summaries. |
| `files-empty.html` | Valid empty files section. |
| `files-populated.html` | JSF download parsing. |
| `news-detail.html` | Rich news extraction. |
| `session-expired.html` | Login redirect while authenticated. |
| `access-denied.html` | Access-denied classification. |
| `maintenance.html` | Portal outage/maintenance classification. |

### Fixture sanitization checklist

Before committing a fixture:

- Replace usernames and personal names.
- Replace course names/codes and professor names.
- Replace filenames and news content with synthetic equivalents.
- Replace all numeric database identifiers consistently.
- Remove cookies, headers, and embedded tokens.
- Replace ViewState and hidden values.
- Remove image URLs containing user IDs.
- Remove download URLs and JSF arguments that contain real identifiers.
- Search for email addresses, CPF-like values, matriculation IDs, and names.
- Run the automated fixture secret/privacy scanner.
- Manually review the final diff.

Never commit a raw diagnostic capture first and “sanitize later.” Sanitization
must occur outside the repository before the fixture is added.

## Test layers

### Layer 1 — Pure parser and classifier tests

- Run on every pull request.
- Use committed sanitized fixtures.
- Validate every state and structural invariant.
- Validate old and new structures during compatibility transitions.

### Layer 2 — Mocked Playwright navigation tests

- Run on every pull request.
- Simulate timeouts, redirects, missing selectors, popup behavior, context
  closure, and cancellation.
- Assert actionable errors and bounded completion time.

### Layer 3 — Packaged Electron E2E

- Run on release candidates.
- Verify preload boundaries, renderer error handling, cache isolation,
  compatibility degradation UI, and absence of hanging processes.
- Does not require real SIGAA credentials.

### Layer 4 — Live compatibility canary

- Runs nightly and on demand.
- Uses a dedicated minimum-privilege account.
- Is read-only unless a separate download test is explicitly enabled.
- Never runs as part of ordinary PR checks.
- Reports compatibility evidence and safe diagnostics.

### Layer 5 — Manual release verification

Required when a release changes login, session handling, selectors, navigation,
JSF parsing, download behavior, or adapter version.

## Live canary contract

The canary should verify:

1. SIGAA login URL is reachable.
2. Login page classifies as `LOGIN` with high confidence.
3. Authentication reaches an authenticated state.
4. Course listing is structurally valid, including a valid empty state.
5. If a course is available, one course can be entered and classified.
6. Files/news structure can be recognized without requiring any items.
7. Session can be closed cleanly.
8. No unexpected page state or fingerprint change occurred.

The canary must not assert a fixed number of courses, files, or news items.

### Canary outcomes

| Outcome | Meaning | Action |
|---|---|---|
| `PASS` | All required transitions and invariants passed. | Record adapter version and timestamp. |
| `DEGRADED` | Fingerprint changed but invariants passed. | Open investigation; do not disable immediately. |
| `INCOMPATIBLE` | Required state/transition failed structurally. | Activate compatibility protection and alert maintainers. |
| `PORTAL_DOWN` | Network/maintenance prevented evaluation. | Retry later; do not classify as selector drift. |
| `AUTH_FAILED` | Test account could not authenticate. | Check secret/account separately from portal compatibility. |

## Privacy-safe diagnostics

On a compatibility failure, collect by default:

- Timestamp and operation ID.
- Adapter version.
- Normalized URL family.
- Classified state/confidence.
- Matched, missing, and conflicting signals.
- Selector counts.
- Structural fingerprint hash.
- Playwright error category and timeout stage.

Do not collect by default:

- Raw HTML.
- Screenshots.
- Traces.
- Body text.
- Cookies, headers, hidden values, or scripts.

HTML, screenshots, or traces require development mode or explicit diagnostic
consent. They must be sanitized, encrypted at rest where appropriate, retained
for a short documented period, and deleted by clear-all-data.

## Compatibility degradation and kill switch

When repeated high-confidence structural failures occur:

1. Stop scheduled background synchronization.
2. Stop automatic downloads.
3. Cancel queued portal operations.
4. Preserve account-scoped cached data in read-only mode.
5. Display a non-alarming compatibility message:
   “O SIGAA mudou e a sincronização está temporariamente indisponível. Seus
   dados salvos continuam disponíveis.”
6. Avoid repeated automatic login attempts.
7. Provide a diagnostic reference without exposing sensitive details.

Initial implementation may use a local compatibility state:

```ts
interface PortalCompatibilityState {
  status: 'compatible' | 'degraded' | 'incompatible';
  adapterVersion: string;
  failureCount: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  reasonCode?: string;
}
```

Do not add a remotely controlled kill switch without a separate security and
privacy design review.

## Portal change response runbook

### 1. Triage

- Determine whether the failure is network, maintenance, authentication,
  account-specific, or structural.
- Compare adapter version and fingerprint with the last successful canary.
- Reproduce with the dedicated test account, never a contributor's personal
  account if avoidable.

### 2. Contain

- Mark compatibility `degraded` or `incompatible`.
- Disable automatic background operations if session safety is uncertain.
- Keep cached data read-only.
- Avoid repeated retries.

### 3. Capture safely

- Record privacy-safe structural diagnostics.
- If raw evidence is essential, capture it outside the repository.
- Sanitize a new fixture and run the privacy checklist.

### 4. Update compatibility adapter

- Add the new selector/state signals as a new adapter version.
- Keep old fixture compatibility if it remains meaningful.
- Add a regression test before changing production logic.
- Avoid weakening invariants merely to make the new fixture pass.

### 5. Verify

- Run parser/classifier fixtures.
- Run mocked navigation tests.
- Run packaged Electron E2E.
- Run the live canary.
- Manually verify the affected journey when it changes session or download
  behavior.

### 6. Release and observe

- Document the adapter version in release notes.
- Keep the previous adapter logic available for rollback when feasible.
- Monitor canary outcomes after release.
- Close the incident only after repeated successful live checks.

## Release compatibility evidence

For releases that touch portal integration, record:

```text
Adapter version:
Fixture suite commit:
Deterministic portal tests:
Packaged E2E result:
Live canary result and timestamp:
Manual verification performed by:
Known degraded states:
Rollback commit/version:
```

A green fixture suite without a recent canary is insufficient evidence that the
live portal is compatible. A green canary without fixture coverage is
insufficient evidence that known failure states are handled safely.

## Agent handoff for portal work

Every portal-related task handoff must state:

- `PORTAL-*` tracker ID.
- Adapter version before and after the work.
- Portal states/transitions changed.
- Selectors added, changed, or removed.
- Fixtures added or updated.
- Whether any raw diagnostic material existed and how it was destroyed.
- Deterministic test results.
- Live canary status, if run.
- Remaining uncertainty and rollback path.

Do not paste credentials, cookies, ViewState, raw HTML, or personal academic
data into tracker notes, commits, issues, or chat handoffs.


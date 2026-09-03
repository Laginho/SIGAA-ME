# DATA-001 — Bind all persisted state to a stable account identity
Status: open
Priority: P1
Blocked by: SEC-003
Tracker status at migration: `NOT STARTED`

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

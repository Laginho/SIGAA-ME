# DATA-002 — Implement complete logout and clear-all transactions
Status: open
Priority: P1
Blocked by: DATA-001
Tracker status at migration: `NOT STARTED`

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

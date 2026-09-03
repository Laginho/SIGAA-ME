# PORTAL-005 — Add compatibility degradation and kill-switch behavior
Status: open
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `NOT STARTED`

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

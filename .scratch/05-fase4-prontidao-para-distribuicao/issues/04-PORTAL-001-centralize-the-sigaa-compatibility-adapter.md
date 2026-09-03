# PORTAL-001 — Centralize the SIGAA compatibility adapter
Status: open
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `NOT STARTED`

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

# PORTAL-003 — Add privacy-safe structural diagnostics
Status: open
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `PARTIAL`

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

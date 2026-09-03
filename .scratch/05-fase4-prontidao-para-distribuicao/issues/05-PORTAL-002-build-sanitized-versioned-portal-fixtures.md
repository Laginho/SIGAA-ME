# PORTAL-002 — Build sanitized, versioned portal fixtures
Status: open
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `NOT STARTED`

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

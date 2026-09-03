# PORTAL-004 — Add an opt-in scheduled live compatibility canary
Status: open
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `PARTIAL`

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

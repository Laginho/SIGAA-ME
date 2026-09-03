# OBS-001 — Centralize, redact, rotate, and clear logs
Status: open
Priority: P2
Blocked by: DL-002
Tracker status at migration: `NOT STARTED`

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

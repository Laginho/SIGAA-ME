# DL-002 — Correct content-type detection and file validation
Status: open
Priority: P2
Blocked by: DL-001
Tracker status at migration: `NOT STARTED`

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

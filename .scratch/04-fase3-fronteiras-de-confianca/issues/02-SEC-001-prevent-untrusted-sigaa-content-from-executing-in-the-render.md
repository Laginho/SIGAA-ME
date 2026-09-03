# SEC-001 — Prevent untrusted SIGAA content from executing in the renderer
Status: open
Priority: P0
Blocked by: ARCH-001
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `src/security/html-sanitizer.ts`
  - New: `src/utils/dom.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/settings.ts`
  - `src/components/toast.ts`
  - `index.html`
  - `package.json`
  - `package-lock.json`
  - New: `tests/unit/html-sanitizer.test.ts`
  - New: `tests/unit/renderer-content-security.test.ts`

#### Required behavior

- Render account names, course names, course codes, periods, filenames,
  notification titles, dates, paths, and errors with `textContent`.
- Replace inline `onclick` and `onerror` attributes with event listeners.
- Keep untrusted values out of HTML attributes and inline route strings.
- Permit rich HTML only for news bodies and only after a strict allowlist
  sanitizer.
- Sanitize news content before caching and again before rendering.
- Reject event attributes, forms, iframes, SVG, scripts, styles, and unsafe URL
  protocols.
- Add a production Content Security Policy that does not permit inline scripts
  or `unsafe-eval`.

#### Acceptance criteria

- Malicious fixtures cannot create executable renderer nodes.
- No untrusted value is interpolated into `innerHTML`.
- `toast.error('<img onerror=...>')` displays literal text.
- Course cards and notification rows use listeners rather than inline handlers.
- The CSP blocks inline event-handler execution as defense in depth.

#### Verification

```text
npm run test:unit -- html-sanitizer renderer-content-security toast
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Sanitizer/version: —
- Allowlist changes: —

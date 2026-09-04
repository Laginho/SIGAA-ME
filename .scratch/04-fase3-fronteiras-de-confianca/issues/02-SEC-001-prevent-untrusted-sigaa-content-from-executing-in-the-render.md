# SEC-001 — Prevent untrusted SIGAA content from executing in the renderer
Status: resolved
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

- Commit: `41291e2` (TEST), `f6ee46b` (MAKE), `659f0f4` (READ), `c8f0e8f` (MASTER)
- Sanitizer/version: `dompurify@3.4.14` (`src/security/html-sanitizer.ts`), only new dependency
- Allowlist changes: tags `p br b strong i em u s ul ol li blockquote h3 h4 span div table thead tbody tr th td a`; attrs `href title`; URIs `https?:`/`mailto:` only; every `<a>` gets `rel="noopener noreferrer"`, never `target`; `<img>` dropped (known ceiling)

#### Resolution (2026-09-04)

Cycle 01 (initial). Master dev validated on `traycer/quick-rabbit`.

- Decision: DOMPurify with a strict allowlist is the only sanitizer, and
  `sanitizeNewsHtml(...)` is the only `innerHTML` with external data in the
  app (news modal body). Every other SIGAA/config value is built as a node or
  `textContent` through `h()` (`src/utils/dom.ts`). Inline `onclick`/`onerror`
  are gone; the course-card route lives in a listener closure.
- Sanitize on write **and** on read: `mergeCoursesIntoCache` is now the single
  writer of `coursesWithFiles` (the two direct `localStorage.setItem` calls in
  `course-detail.ts` route through it) and sanitizes `news[].content` before
  saving; the modal sanitizes again before rendering, so a pre-existing raw
  cache is safe on read and becomes clean on the next merge.
- CSP meta in `index.html`: `script-src 'self'` with no `unsafe-inline`/
  `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`. `connect-src` keeps
  `localhost` for Vite HMR (harmless in production, marked `ponytail:`).
- ESLint zone `src/**/*.ts`: `innerHTML` only with a literal or
  `sanitizeNewsHtml(...)`; `outerHTML`/`insertAdjacentHTML`/`document.write`
  forbidden. `src/counter.ts` (Vite scaffold) deleted.
- Profile photo enters `img.src` only when `photoUrl` starts with
  `https://si3.ufc.br/`. The service already normalizes relative `src` to that
  host; an absolute URL on another host would drop the photo (known ceiling).
- Red-green: READ reverted MAKE and saw 15 failures across 4 suites; restored,
  226 passed | 4 skipped. Master re-ran the Windows gate on the branch: `tsc`
  clean, lint 0 errors / 74 legacy warnings, 226 passed | 4 skipped;
  `npx vite build` + `visual.spec.ts` 11 passed with 0 console errors under
  real Electron with the CSP on.
- Master correction (`c8f0e8f`, `Role: MASTER`): the plan routed the two
  course-detail cache writes through `mergeCoursesIntoCache` without noting
  that it stamps `cacheTimestamp`, which the dashboard shows as "Sync manual".
  Opening a news item would move that label. Added `keepTimestamp` to
  `MergeOptions`, passed from both call sites; two new assertions fail without
  it. Gate after: 227 passed | 4 skipped.
- Accepted and recorded: `<img>` in news bodies is removed; links inside a
  sanitized news body still navigate the `BrowserWindow` (pre-existing,
  `SEC-003` annotated); old raw cache is sanitized on read.
- Pending (Bruno): manual smoke with DevTools open on every route plus one news
  modal, zero `Refused to execute` in the console. jsdom does not enforce CSP.

## Ciclos PTMR

| cycle | issue | verdict | culprit | reason |
| --- | --- | --- | --- | --- |
| 01 | SEC-001 | correction | MASTER (plan) | Plan routed the course-detail cache writes through `mergeCoursesIntoCache` without noting it stamps `cacheTimestamp` (dashboard "Sync manual" label). TEST (opencode:big-pickle), MAKE (opencode:muse-spark-1.3-contributor-free) and READ (opencode:mimo-v2.5-free) followed the plan faithfully; fixed directly by master dev in `c8f0e8f` (small, root cause in the plan). |

# SIGAA-ME Architecture

## Active engineering documents

- [Hardening Tracker](docs/HARDENING_TRACKER.md) — implementation status,
  dependencies, acceptance criteria, verification, and multi-agent handoff.
- [Portal Compatibility Playbook](docs/PORTAL_COMPATIBILITY.md) — selector
  registry, state classification, fixtures, live canary, diagnostics, and SIGAA
  drift response.
- [Code Review](CODE_REVIEW.md) — originating security and release assessment.

## Scraping Strategy: Hybrid Approach

SIGAA-ME uses a **hybrid Playwright + HTTP** approach to interact with SIGAA (UFC's academic system).

### Why Hybrid?

SIGAA is built on **JavaServer Faces (JSF)**, which presents unique challenges:

1. **ViewState Tokens** - Every page has a unique `javax.faces.ViewState` that must be submitted with forms
2. **JavaScript Navigation** - Course/file links use `jsfcljs()` functions, not regular URLs
3. **Session Validation** - The server validates that requests follow an expected sequence
4. **Cookie Complexity** - Multiple session cookies (`JSESSIONID`, etc.) that must be maintained

Pure HTTP scraping was attempted first but failed due to session invalidation issues.

---

## Service Responsibilities

### `PlaywrightLoginService` (Browser Automation)
Handles operations that require JavaScript execution or complex session state:

| Method | Why Playwright? |
|--------|-----------------|
| `login()` | JS form handling, potential CAPTCHA, secure cookie setup |
| `getCourses()` | Requires authenticated session + DOM parsing |
| `enterCourseAndGetHTML()` | Clicks JSF links via JavaScript, requires ViewState |
| `navigateToFilesSection()` | Client-side navigation within course portal |
| `getNewsDetail()` | JSF form submission with fresh ViewState per request |

### `HttpScraperService` (Fast HTTP Requests)
Handles operations where speed matters and session can be borrowed from Playwright:

| Method | Why HTTP? |
|--------|-----------|
| `getCourseFiles()` | Parsing only (uses HTML from Playwright) |
| `downloadFile()` | Bulk downloads — HTTP is ~10x faster; after HTTP → session refresh + HTTP both fail, `SigaaService.downloadViaPlaywright` falls back to Playwright (dedicated visible browser via `download.service.ts`) |
| `getNewsDetail()` | Has HTTP version but unused - sessions go stale between requests |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User Action                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SigaaService                                 │
│            (Orchestrator - decides which service to use)             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
          ▼                                         ▼
┌──────────────────────┐                 ┌──────────────────────┐
│ PlaywrightLoginService│                 │  HttpScraperService  │
│                      │                 │                      │
│ • Login              │   cookies       │ • Parse HTML         │
│ • Navigate           │ ───────────────►│ • Download files     │
│ • Get fresh HTML     │   + HTML        │ • Fast bulk ops      │
└──────────────────────┘                 └──────────────────────┘
```

---

## Future Improvements

### Could Move to HTTP (with effort)
- **`enterCourseAndGetHTML`** - If ViewState chain is reverse-engineered
- **`getNewsDetail`** - HTTP version exists but needs better session persistence

### Probably Forever Playwright
- **`login`** - Too many JS dependencies, potential CAPTCHA
- **Initial session establishment** - Foundation for everything else

### Key Insight
The current hybrid works because:
1. Playwright establishes and maintains the session
2. HTTP "borrows" cookies from Playwright for fast operations
3. When HTTP fails twice (HTTP → session refresh + HTTP → `SigaaService.downloadViaPlaywright`), system falls back to Playwright via `download.service.ts` (dedicated visible browser)

---

## Files

```
electron/services/
├── sigaa.service.ts           # Orchestrator
├── playwright-login.service.ts # Browser automation (~1000 lines)
├── http-scraper.service.ts     # HTTP requests (~950 lines)
└── logger.service.ts           # Logging utility
```

## Logging and diagnostics

Target state, specified in `OBS-001` → `OBS-004` → `OBS-005` → `OBS-003` →
`OBS-002` (2026-09-08). The migration is expand–contract: `OBS-001` ships the
logger and removes the `console` monkeypatch, `OBS-004`/`OBS-005` move the
services over, `OBS-005` narrows the signature and turns `no-console` on for
all of `electron/**`. Until `OBS-005` closes, services not yet migrated write
to stdout only.

- One logger (`logger.service.ts`), `userData/logs/app.log`, rotated 1 MiB × 5.
  `no-console` is a lint error in `electron/**`; the renderer's `console.*`
  never reaches disk.
- Redaction in every mode for secrets (password, cookie, `Authorization`,
  ViewState, JSF script, HTML, absolute path); in packaged builds also for
  academic content passed as `meta` (course, file, title, user). Messages are
  literal; content goes in `meta` or does not go.
- Raw HTML dumps live in `userData/diagnostics/` through `DiagnosticsService`,
  dev-only, 20 files shared with the structural JSON diagnostics.
- **Logout does not touch logs.** Logs belong to the app, not the account, and
  carry no account content in production. Clear-all removes `logs/` and
  `diagnostics/` and reports a failed deletion instead of swallowing it.

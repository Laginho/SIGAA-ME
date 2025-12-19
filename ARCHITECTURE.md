# SIGAA-ME Architecture

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
| `downloadFile()` | Bulk downloads - HTTP is ~10x faster than Playwright downloads |
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
3. When HTTP fails, system falls back to Playwright (retry logic)

---

## Files

```
electron/services/
├── sigaa.service.ts           # Orchestrator
├── playwright-login.service.ts # Browser automation (~1000 lines)
├── http-scraper.service.ts     # HTTP requests (~950 lines)
└── logger.service.ts           # Logging utility
```

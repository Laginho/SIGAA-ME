# ARCH-001 — Shared domain models and IPC result contracts
Status: open
Priority: P0
Tracker status at migration: `NOT STARTED`

- Status: `NOT STARTED`
- Priority: `P0`
- Owner: —
- Dependencies: none
- Primary files:
  - New: `shared/domain.ts`
  - New: `shared/ipc-contracts.ts`
  - New: `shared/errors.ts`
  - `tsconfig.json`
  - `src/vite-env.d.ts`
  - `electron/electron-env.d.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`

#### Required interfaces

- `AccountId`, `AccountProfile`
- `CourseId`, `CourseSummary`, `CourseSnapshot`
- `CourseFile`, `NewsSummary`, `NewsDetail`
- `DownloadToken`, `DownloadRecord`, `DownloadResult`
- `AppResult<T>` as a discriminated success/failure union
- Stable `AppErrorCode` values for validation, session expiry, selector drift,
  cancellation, storage, downloads, and portal availability
- `RendererApi` as the only public preload contract

Renderer-facing file records must not contain JSF scripts, `onclick` content,
ViewState values, cookies, or internal SIGAA URLs.

#### Acceptance criteria

- Main, preload, and renderer import the same contract definitions.
- No IPC method returns an untyped `Promise<any>`.
- Existing flows compile against `AppResult<T>`.
- Error consumers distinguish retryable portal failures from invalid requests.
- `tsconfig.json` includes the shared contract directory.

#### Verification

```text
npm run typecheck
npm test
```

#### Implementation notes

- Commit: —
- Decisions: —
- Follow-ups: —

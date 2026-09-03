# CONC-001 — Serialize and cancel shared Playwright operations
Status: open
Priority: P1
Blocked by: DATA-002
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/services/session-operation-coordinator.service.ts`
  - New: `shared/operation.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/main.ts`
  - `src/pages/course-detail.ts`
  - New: `tests/unit/session-operation-coordinator.test.ts`
  - New: `tests/integration/background-sync-serialization.test.ts`

#### Required behavior

- Replace `busyCount`; it currently does not serialize work.
- Permit only one Playwright/session-mutating operation at a time.
- Represent operations as `interactive`, `background`, `auth`, or `shutdown`.
- Use `AbortSignal` for cancellation.
- Allow logout/clear-all to cancel queued work and wait for a safe boundary.
- Let interactive work cancel or supersede background work without corrupting
  cookies, ViewState, or page navigation.
- Check cancellation between courses, news items, retry attempts, and downloads.
- ~~Remove nonexistent renderer calls to `pauseSync()` and `resumeSync()`.~~
  **Feito no `BUG-002` (2026-09-01).** Registro: a proteção contra concorrência
  que o `pauseSync` fingia dar está **ausente e é conhecida** — nada serializa
  sync em background e ação do usuário sobre a mesma página Playwright até esta
  tarefa ser implementada. Ver `DÉBITO-03`.
- Return `OPERATION_CANCELLED` rather than a generic failure.

#### Acceptance criteria

- Background sync and course navigation cannot use the same Playwright page
  concurrently.
- Nested background calls do not deadlock by reacquiring the coordinator.
- Logout does not close a browser underneath an untracked operation.
- A cancelled background sweep does not publish partial data as a complete
  successful sync.

#### Verification

```text
npm run test:unit -- session-operation-coordinator
npm run test:integration -- background-sync-serialization
```

#### Implementation notes

- Commit: —
- Queue policy: —
- Cancellation boundaries: —

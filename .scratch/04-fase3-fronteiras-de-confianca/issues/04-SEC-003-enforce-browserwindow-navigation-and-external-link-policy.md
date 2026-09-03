# SEC-003 — Enforce BrowserWindow navigation and external-link policy
Status: open
Priority: P0
Blocked by: SEC-002
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `SEC-002`
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `shared/ipc-contracts.ts`
  - New: `tests/unit/navigation-policy.test.ts`
  - New: `tests/e2e/security-boundaries.spec.ts`

#### Required behavior

- Explicitly set `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, and `webSecurity: true` after preload compatibility is
  verified.
- Deny unexpected `will-navigate` destinations.
- Deny renderer-created windows through `setWindowOpenHandler`.
- Open links only through a validated `openExternal` operation.
- Permit only HTTPS links without embedded credentials.
- Directly allow documented UFC/SIGAA and project GitHub hosts.
- Require confirmation for other HTTPS hosts or deny them according to the
  final product policy.
- Reject `javascript:`, `file:`, `data:`, `blob:`, and unknown schemes.

#### Acceptance criteria

- An external navigation cannot inherit the preload API.
- `window.open()` is denied by default.
- Unsafe schemes never reach `shell.openExternal`.
- Approved links open in the OS browser, not inside the Electron window.

#### Verification

```text
npm run test:unit -- navigation-policy
npm run test:e2e -- security-boundaries
```

#### Implementation notes

- Commit: —
- Approved domains: —
- Sandbox exceptions: —

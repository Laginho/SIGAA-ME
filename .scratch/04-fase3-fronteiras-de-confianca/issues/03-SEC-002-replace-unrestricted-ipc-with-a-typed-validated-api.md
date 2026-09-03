# SEC-002 — Replace unrestricted IPC with a typed, validated API
Status: open
Priority: P0
Blocked by: SEC-001
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/ipc/register-handlers.ts`
  - New: `electron/ipc/validation.ts`
  - New: `electron/ipc/sender-policy.ts`
  - New: `electron/services/session-catalog.service.ts`
  - `electron/preload.ts`
  - `electron/main.ts`
  - `electron/electron-env.d.ts`
  - `src/vite-env.d.ts`
  - `src/main.ts`
  - `src/pages/course-detail.ts`
  - `src/pages/dashboard.ts`
  - `src/pages/settings.ts`
  - `src/pages/sync-selection.ts`
  - New: `tests/unit/ipc-validation.test.ts`

#### Required API changes

- Remove `window.ipcRenderer` completely.
- Expose only explicitly named `RendererApi` methods.
- Validate the sender frame/origin before executing every handler.
- Validate payload types, lengths, allowed properties, and identifiers.
- Replace arbitrary `updateSetting(key, value)` with a discriminated union.
- Exclude `lastBackgroundSync` and the download root from renderer-mutable
  settings.
- Move JSF scripts and internal file URLs into `SessionCatalogService`.
- Renderer downloads reference an opaque `DownloadToken`.
- Renderer course/news requests send stable IDs, not trusted names or scripts.
- Renderer must not submit arbitrary base directories or filesystem paths.
- Event subscriptions expose data only, never the Electron event object.
- Move `simulateNewFile` into an optional development-only `testApi`.

#### Acceptance criteria

- `window.ipcRenderer` is undefined in the packaged renderer.
- Unknown channels cannot be invoked from renderer code.
- Invalid payloads return `INVALID_REQUEST` without touching services.
- JSF scripts never cross the IPC boundary.
- Download tokens expire on logout/relogin.
- Production builds do not expose the cache mutation test API.

#### Verification

```text
npm run typecheck
npm run test:unit -- ipc-validation
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Channel migration: —
- Removed APIs: —

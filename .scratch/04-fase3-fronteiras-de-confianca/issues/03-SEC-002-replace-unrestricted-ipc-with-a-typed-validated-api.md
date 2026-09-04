# SEC-002 — Replace unrestricted IPC with a typed, validated API
Status: resolved
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
- Download tokens expire on logout/relogin. — superseded, see Resolution: the token is the public file id (ARCH-001), not session material.
- Production builds do not expose the cache mutation test API.

#### Verification

```text
npm run typecheck
npm run test:unit -- ipc-validation
npm run test:e2e
```

#### Implementation notes

- Commit: `a313f2b` (TEST), `960898a` (MAKE), `0287cbf` (READ), `8577e76` (MASTER)
- Channel migration: no channel renamed. `load-all-news` takes one `{ courseId, courseName }` object instead of two positional args; `check-files-existence` returns `AppResult<{ path, exists }[]>` so it can answer `INVALID_REQUEST`. All 14 handlers (15 in dev) moved from `electron/main.ts` to `electron/ipc/register-handlers.ts` behind one wrapper: sender check, then allowlist parse, then service.
- Removed APIs: `window.ipcRenderer` (preload bridge, `src/vite-env.d.ts`, `electron/electron-env.d.ts`, the `main-process-message` listener in `src/main.ts` and its sender in `main.ts`); `RendererApi.simulateNewFile` (now `window.testApi.simulateNewFile`, exposed only with `--sigaa-dev`). No new dependency.

#### Resolution (2026-09-04)

Cycle 02 (initial). Master dev validated on `traycer/crisp-swan`.

- Sender policy: every `ipcMain.handle` goes through `handle()` in
  `register-handlers.ts`, which rejects the invoke (throws) unless the sender
  is the main frame of our window (`webContents.id` match, `parent === null`)
  loaded from our origin: `new URL(VITE_DEV_SERVER_URL).origin` in dev,
  `'file:'` packaged (`isTrustedSender`, pure, `electron/ipc/sender-policy.ts`).
- Payload validation by allowlist copy (`electron/ipc/validation.ts`, no
  library): SIGAA ids `[A-Za-z0-9_-]{1,64}` (closes the `newsId` CSS-selector
  interpolation in `getNewsDetail`), texts bounded and control-char free,
  `files` <= 500, paths <= 500 x 4096, `SettingUpdate` restricted to
  `theme|runInBackground|openAtLogin|autoDownloadUpdates|syncInterval` plus
  `lastDownloadPath: null`. Extra fields (`script`, `basePath`) never reach a
  service; invalid payload returns `INVALID_REQUEST` without touching one.
  The DL-001 `if` in `update-app-setting` is subsumed by `parseSettingUpdate`.
- Decisions: `SessionCatalogService` and `DownloadToken` expiry were **not**
  built. ARCH-001 already keeps JSF scripts out of the IPC; the token is the
  public file id, reconstructed from a fresh page per request, so expiring it
  protects nothing. `courseName` stays in payloads as a validated display and
  folder label (it never selects a course in main; the folder is contained by
  DL-001). `checkFilesExistence` keeps receiving paths: read-only probe,
  already containment-aware. `webPreferences`, `will-navigate` and
  `setWindowOpenHandler` stay in SEC-003.
- ESLint boundary zone now covers `electron/ipc/**`; `preload-contract.test.ts`
  reads the handled channels from `register-handlers.ts` and asserts the
  preload only invokes literal channels and nothing outside it mentions
  `ipcRenderer`.
- Red-green: TEST reported `8 failed | 185 passed` in `tests/unit` before MAKE;
  MAKE/READ 279 passed | 4 skipped. Master re-ran the Windows gate on the
  branch: `tsc` clean, lint 0 errors / 71 legacy warnings, 279 passed | 4
  skipped; `npx vite build` + `visual.spec.ts` 11 passed with 0 console errors
  under real Electron, i.e. the sender policy accepts the real renderer on the
  packaged `file:` path.
- Master correction (`8577e76`, `Role: MASTER`): the plan prescribed
  `if (!r.success) return` in `course-detail.ts` before the file list is
  rendered, so an `INVALID_REQUEST` from `checkFilesExistence` would blank the
  list. The rejection now goes to the existing catch and the list renders;
  one new test fails without it. Also removed an `as unknown as` cast on
  `senderFrame` (Electron 30 types `parent`). Gate after: 280 passed | 4 skipped.
- Dev origin smoke (Bruno, 2026-09-04): `npm run dev` opened normally, so the
  sender policy accepts the `http://localhost:5173` origin too. No automated
  tier covers that path (the visual spec runs the built app on `file:`); the
  boot `tryAutoLogin` invoke is what would have failed.
- Pending (Bruno): `test:e2e` with `.env`, which now calls
  `window.testApi.simulateNewFile()`.

## Ciclos PTMR

| cycle | issue | verdict | culprit | reason |
| --- | --- | --- | --- | --- |
| 02 | SEC-002 | correction | MASTER (plan) | Plan prescribed `if (!r.success) return` in `course-detail.ts` before the file list renders; an `INVALID_REQUEST` from `checkFilesExistence` would blank the list. TEST (opencode:big-pickle), MAKE (opencode:muse-spark-1.3-contributor-free) and READ (opencode:mimo-v2.5-free) followed the plan faithfully; fixed directly by master dev in `8577e76` (small, root cause in the plan). |

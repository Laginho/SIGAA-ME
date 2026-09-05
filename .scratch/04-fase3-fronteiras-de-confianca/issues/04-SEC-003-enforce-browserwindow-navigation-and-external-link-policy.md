# SEC-003 — Enforce BrowserWindow navigation and external-link policy
Status: claimed
Priority: P0
Blocked by: SEC-002
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `SEC-002`
- Primary files (corrected 2026-09-05; the migrated list named files that do
  not exist):
  - `electron/main.ts` — `webPreferences`, wiring of the guard
  - New: `electron/security/navigation-policy.ts` — pure policy + guard
  - `eslint.config.js` — add `electron/security/**/*.ts` to the boundary zone
  - New: `tests/unit/navigation-policy.test.ts`
  - New: `tests/e2e/security-boundaries.spec.ts`
  - **Not touched:** `electron/preload.ts`, `shared/ipc.ts` (there is no
    `shared/ipc-contracts.ts`). See decision 1 below.

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

#### Contract (spec session, 2026-09-05)

Read before writing: `electron/main.ts` (`createWindow`, the only
`BrowserWindow`), `electron/preload.ts`, `shared/ipc.ts`,
`electron/ipc/sender-policy.ts` (the pure-policy pattern to copy),
`src/security/html-sanitizer.ts` and `renderNewsIntoModal` in
`src/pages/course-detail.ts` (the only place a SIGAA-authored `<a href>`
reaches the DOM; it keeps `https:` and `mailto:`, never `target`).

**Decisions**

1. **No new IPC channel.** The renderer has no external link of its own; the
   only vector is an anchor inside a news body, and a `will-navigate` guard
   in main intercepts it without touching preload or `RendererApi`. If a
   future screen needs an "open on GitHub" button, that is when
   `openExternal` enters the contract — with validation, like every channel
   since SEC-002.
2. **Product policy for HTTPS outside the allowlist: confirm, then open**
   (Bruno, 2026-09-05). `dialog.showMessageBox(win, ...)` naming the host;
   button index `0` = open (`shell.openExternal`), anything else = drop.
   `mailto:` is classified exactly like an untrusted HTTPS link — one rule,
   no special case (Bruno, same date).
3. **Direct allowlist:** hostname `ufc.br` or any `*.ufc.br`; `github.com`
   only when the path is `/Laginho/SIGAA-ME` or starts with
   `/Laginho/SIGAA-ME/` (so `SIGAA-ME-bench` and other repos are *untrusted*,
   not blocked — they get the dialog). Port is irrelevant; the URL parser
   already lowercases the host.
4. **`window.open()` is always denied**, including for trusted URLs. The
   sanitizer never emits `target`, so a popup can only come from something
   that should not be running.
5. **In-window navigation is allowed only to the app itself:** same origin as
   `VITE_DEV_SERVER_URL` in dev; in the packaged app, a `file:` URL with the
   same `pathname` as `dist/index.html` (hash and query ignored). Reload and
   HMR keep working; every other `file:` URL is blocked.
6. **Everything else is blocked** without a dialog: `javascript:`, `data:`,
   `blob:`, `file:` (other than rule 5), plain `http:` (even on an allowlisted
   host), `about:`, `ftp:`, unknown schemes, unparsable strings, and any
   `https:` URL carrying `username` or `password`.
7. `sandbox: true` is already the effective default (Electron ≥ 20 sandboxes
   renderers unless `nodeIntegration: true`), and the bundled `preload.mjs`
   is CommonJS (`require("electron")`) — that is why it loads today. Setting
   the four flags explicitly is documentation, not a behaviour change; the
   visual spec (`npx playwright test visual.spec.ts`) is the compatibility
   proof for the preload under the explicit flags.

**Shape** (`electron/security/navigation-policy.ts`; zero `electron` imports
except the `WebContents` type):

```ts
export type NavigationVerdict =
  | { kind: 'in-app' }
  | { kind: 'external'; trusted: boolean }
  | { kind: 'blocked'; reason: string }

export function classifyNavigation(target: string, appUrl: string): NavigationVerdict

export interface NavigationGuardDeps {
  appUrl: string
  openExternal: (url: string) => Promise<void>
  /** Resolves true when the user chose to open. */
  confirmExternal: (url: string) => Promise<boolean>
}

export function installNavigationGuard(
  contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
  deps: NavigationGuardDeps,
): void
```

`installNavigationGuard` registers `will-navigate` (read the URL from
`details.url`) and `setWindowOpenHandler`. `in-app` → do nothing; every other
verdict → `preventDefault()`; `external` trusted → `openExternal`; `external`
untrusted → `confirmExternal` then `openExternal` only on `true`; `blocked` →
log and stop. Rejections from `openExternal`/`confirmExternal` are caught and
logged (an event handler has no caller to propagate to; the updater does the
same).

`main.ts` passes `openExternal: (url) => shell.openExternal(url)` — **late
binding**, so the E2E can stub `shell.openExternal` from
`electronApp.evaluate` and observe the call without opening a real browser —
and `confirmExternal` backed by `dialog.showMessageBox(win, ...)` whose
options mention the target host. `appUrl` is `VITE_DEV_SERVER_URL` in dev,
`pathToFileURL(path.join(RENDERER_DIST, 'index.html')).href` otherwise.

**Corrections to the migrated text**

- `webContents.getLastWebPreferences()` no longer exists in Electron 30, so
  the E2E cannot read `webPreferences` at runtime. The explicit flags are
  asserted by the unit tier, which imports the real `main.ts` with `electron`
  mocked and lets `whenReady` run `createWindow()` (pattern of
  `tests/unit/updater-consent.test.ts`). The E2E asserts the observable
  consequences: `window.api` present, `require`/`process` absent.
- `mailto:` is not exercised by the E2E on purpose: in the red state it would
  open the real mail client on the developer's machine. Unit tier covers the
  classification; Bruno checks a real `mailto:` click once, manually.
- There is no `npm run test:unit`; see Verification.

#### Acceptance criteria

- An external navigation cannot inherit the preload API — the window never
  navigates away from the app: `will-navigate` to anything but the app's own
  URL is prevented (`security-boundaries.spec.ts`: `page.url()` unchanged,
  `window.api` still present after clicking `file:`/`https:` links).
- `window.open()` is denied by default — returns `null` in the renderer, the
  window count stays 1, `shell.openExternal` is not called.
- Unsafe schemes never reach `shell.openExternal` — `javascript:`, `data:`,
  `blob:`, foreign `file:`, plain `http:`, credentialed `https:` are
  `blocked`: no dialog, no `openExternal` (unit tier, `classifyNavigation`
  and the installed guard).
- Approved links open in the OS browser, not inside the Electron window —
  `https://si3.ufc.br/...` reaches `shell.openExternal` with the exact URL,
  no dialog; `https://example.com/...` shows the dialog first and opens only
  on button `0` (unit + E2E with stubbed `shell`/`dialog`).
- `BrowserWindow` is constructed once with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- `electron/security/**/*.ts` is in the ESLint boundary zone (`as any` is an
  error there).

#### Verification

```text
npx vitest run tests/unit/navigation-policy.test.ts
npm run quality
npx vite build && npx playwright test security-boundaries.spec.ts
npx playwright test visual.spec.ts        # preload still loads under explicit flags
```

Red today (2026-09-05): `navigation-policy.test.ts` fails at import
(`electron/security/navigation-policy.ts` does not exist); once the module
exists, the `main.ts` describe fails on missing `webPreferences` flags and on
`will-navigate`/`setWindowOpenHandler` never being registered.
`security-boundaries.spec.ts` fails because `window.open` returns a window,
the `file:` link navigates the app window and `shell.openExternal` is never
called.

#### Implementation notes

- Commit: —
- Approved domains: `ufc.br`, `*.ufc.br`, `github.com/Laginho/SIGAA-ME[/...]`
- Sandbox exceptions: none

#### Note from SEC-001 (2026-09-04)

`sanitizeNewsHtml` (`src/security/html-sanitizer.ts`) keeps `<a href>` for
`https:`/`mailto:` only and adds `rel="noopener noreferrer"`, never `target`.
Clicking such a link inside a news modal still navigates the `BrowserWindow`
itself to the external site: pre-existing behaviour, left for this issue.
The `will-navigate` handler here must route those clicks through
`shell.openExternal` (host allowlist above) and deny the in-window navigation.

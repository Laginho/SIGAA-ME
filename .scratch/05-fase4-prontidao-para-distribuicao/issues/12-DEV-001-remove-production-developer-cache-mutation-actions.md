# DEV-001 — Remove production developer cache mutation actions
Status: open
Priority: P2
Tracker status at migration: `PARTIAL`

- Owner: —
- Dependencies: none
- Primary files:
  - `electron/main.ts`
  - `electron/preload.ts`
  - `src/vite-env.d.ts`
  - `tests/e2e/app.spec.ts`

#### Current state

- The IPC handler is guarded by `!app.isPackaged`.
- The tray still always includes `[Dev] Simular Arquivo Novo`.
- The preload still always exposes `simulateNewFile`.

#### Acceptance criteria

- Production tray contains no cache mutation command.
- Production preload exposes no simulation method.
- E2E retains an explicit development-only test bridge.

#### Verification

```text
npm run build
npm run test:e2e
```

#### Implementation notes

- Commit: —

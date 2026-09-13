# QA-001 — Add deterministic test, lint, coverage, and audit gates
Status: open
Stage: to-implement
Priority: P1
Blocked by: DEP-001
Tracker status at migration: `PARTIAL`

- Owner: —
- Dependencies: `ARCH-001`, critical security tests
- Primary files:
  - `package.json`
  - `vitest.config.ts`
  - `playwright.config.ts`
  - New: `eslint.config.js`
  - New: `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - Existing tests under `tests/`

#### Current state

- Unit suite parse failure is fixed.
- Live SIGAA tests are opt-in.
- `package.json` still has no default `test`, lint, coverage, audit, or quality
  script.
- Release workflow publishes after only install/build.

#### Required scripts

- `test`
- `test:unit`
- `test:integration`
- `test:live`
- `typecheck`
- `lint`
- `coverage`
- `audit:prod`
- `quality`

#### Acceptance criteria

- Pull requests run deterministic checks without SIGAA credentials.
- Live canary is separate and opt-in/scheduled.
- Coverage thresholds protect sanitizer, IPC validation, account storage,
  coordinator, and download path modules.
- Publishing cannot start unless quality checks pass.
- Lint prevents new unrestricted `any` usage in shared/security code.

#### Verification

```text
npm ci
npm run quality
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Coverage thresholds: —

## Comments

- Da revisão do `PORTAL-004` (2026-09-12): o script `test:live` da lista
  "Required scripts" **já existe** — `PORTAL-004` o adicionou como
  `vitest run tests/integration/scraper.test.ts`, e o próprio teste trata
  `npm_lifecycle_event === 'test:live'` como opt-in. Não redefina o script; o
  que resta aqui é `test:unit`, `test:integration`, `coverage` e `audit:prod`.

- Da revisão do `DL-005` (2026-09-11): `tests/unit/sync-selection.test.ts:259`
  (`expect(window.location.hash).not.toBe("#/dashboard")`) falhou uma vez num
  `npm run quality` completo e passou sozinho e na repetição imediata, sem
  mudança nenhuma no meio. Instabilidade na suíte cheia, não no arquivo — é o
  tipo de coisa que "deterministic test gate" existe para pegar.

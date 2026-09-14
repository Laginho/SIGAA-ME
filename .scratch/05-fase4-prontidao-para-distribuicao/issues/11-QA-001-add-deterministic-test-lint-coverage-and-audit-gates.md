# QA-001 — Add deterministic test, lint, coverage, and audit gates
Status: open
Stage: blocked
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

- 2026-09-14 Attempt 1 failed: exit 0. Log tail: ...ams myself when the ticket doesn't name them — that's explicitly the back-to-stage-1 case. /  / This ticket is also unusual: it's infra/config work (npm scripts, ESLint config, CI workflows, coverage thresholds), not a feature with an obvious unit-test seam. What "tests stage 2 writes" should mean here is a call stage 1 needs to make — e.g.: / - a test asserting `package.json` declares the required scripts (`test:unit`, `test:integration`, `coverage`, `audit:prod`, `quality`) / - an ESLint rule test/fixture proving `no-explicit-any` is enforced in `shared/`+security paths / - a check that the release workflow's publish step is gated behind the quality job /  / I'm stopping here rather than guessing. Options: /  / 1. I run stage 1 (`grill-me`/`to-spec`/`to-tickets`) on QA-001 myself right now to add the missing seams section, then continue to stage 2. / 2. You tell me directly what seams you want tested, and I fold them into the ticket before implementing. / 3. You confirm this ticket is meant to be verified only by the `Verification` block (`npm ci && npm run quality && npm run test:e2e`), with no additional unit tests — i.e., the gate itself is the test, nothing to write red-first. /  / Which do you want? /

- 2026-09-14 Attempt 2 failed: exit 0; blocked after two attempts. Log tail: QA-001 already has a stalled attempt (Attempt 1, logged 2026-09-14). The ticket predates the current template and has no `## Tests stage 2 writes` section — every other ticket in this batch has one. Stage 2 correctly refused to invent test seams for infra/config work rather than guess. /  / The question from that attempt, still open: /  / 1. **I (as stage 1) add the missing seams section now**, then continue to stage 2. My read: reasonable seams would be a test asserting `package.json` declares the required scripts, an ESLint fixture proving `no-explicit-any` is blocked in `shared/`+security paths, and a check that the release workflow gates publish behind the quality job. / 2. **You tell me the seams directly** and I fold them into the ticket before implementing. / 3. **No unit-test seam at all** — the ticket is verified only by the `Verification` block (`npm ci && npm run quality && npm run test:e2e`), gate-as-test, nothing red-first. /  / Which one do you want? /

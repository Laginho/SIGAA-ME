# DEP-001 — Upgrade vulnerable and incompatible dependencies
Status: open
Stage: blocked
Priority: P1
Blocked by: DEP-003, DEP-004, DEP-005, DEP-006, DEP-007
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: security tests should be in place before broad upgrades
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `vite.config.ts`
  - `vitest.config.ts`
  - `playwright.config.ts`

#### Split (2026-09-11)

Este ticket virou guarda-chuva. Os passos abaixo foram divididos em cinco
filhos, cada um com uma verificação própria que muda de saída antes/depois,
porque um bump de dependência não tem teste unitário vermelho/verde:

- `DEP-003` axios (passo 1)
- `DEP-004` remover `@vitest/browser` e `@vitest/ui` sem uso, alinhar vitest (passo 5)
- `DEP-007` alinhar playwright e @playwright/test (passo 3, parte Playwright)
- `DEP-005` Electron (passo 3, parte Electron)
- `DEP-006` electron-builder + electron-updater e audit residual (passos 4 e 7)

Passos 2 e 6 já foram feitos pelo `DEP-002` (Vite 6.4.3, lock regenerado).
Este ticket fecha quando o último filho mergear e os critérios de aceite abaixo
forem checados uma vez sobre o `master`.

#### Required sequence (original)

1. Upgrade Axios to a release outside the current vulnerable ranges.
2. Select a Vite major supported by Vitest 4 and the Electron Vite plugins.
3. Upgrade Electron and Playwright as a tested runtime set.
4. Upgrade electron-builder and electron-updater together.
5. Align all Vitest browser/UI/coverage packages to one version.
6. Regenerate the lockfile from a clean dependency install.
7. Run `npm ls`, full audit, production audit, packaging, and scraper tests.

#### Acceptance criteria

- `npm ls` reports no invalid peer tree.
- Production audit has no high or critical findings.
- Full audit findings are documented or fixed before release.
- Packaged Electron login/navigation/download smoke tests pass.

#### Verification

```text
npm ls
npm audit
npm audit --omit=dev
npm run quality
npm run test:e2e
```

#### Implementation notes

- Commit: —
- Selected Vite major: —
- Audit summary: —

## Comments

- 2026-09-11 (revisão do `DEP-003`): o axios 1.20 declara
  `https-proxy-agent@^5.0.1` como dependência direta. No lock, ele e o
  `agent-base@6.0.2` perderam o `"dev": true` — são produção agora. Nenhum dos
  dois tem achado de audit hoje; entra no passo 7 (audit residual) só como
  superfície nova a conferir.

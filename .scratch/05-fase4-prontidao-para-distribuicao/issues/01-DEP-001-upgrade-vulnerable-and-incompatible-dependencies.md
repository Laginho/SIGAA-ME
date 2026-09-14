# DEP-001 — Upgrade vulnerable and incompatible dependencies
Status: resolved
Stage: done
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

Guarda-chuva: não tem código próprio. Fechado por verificação dos quatro
critérios sobre o `master` depois do último filho mergear, em 2026-09-14.

- Commit: nenhum de código. Os filhos entregaram tudo —
  `DEP-003` (b29fc46), `DEP-004` (351e01f, b3812b1, PR #18),
  `DEP-007` (51b3304, 3525193, PR #19), `DEP-005` (a3e3c74, 850d920, PR #24),
  `DEP-006` (c08d948, b76c51d, 3bd1c9a, 472cb60, PR #25). Passos 2 e 6 vieram
  do `DEP-002` (2026-08-09).
- Selected Vite major: **6** (`vite@6.4.3`, resolvido hoje). Escolhido no
  `DEP-002`, não aqui: é o major que o Vitest 4.1.4 aceita. Lock regenerado no
  Windows na mesma ocasião, que é o passo 6.
- Audit summary: **0 vulnerabilidades** em `npm audit` e em
  `npm audit --omit=dev`. Não sobrou achado para documentar como aceito — a
  cláusula "documented or fixed" fecha pelo lado "fixed". O `DEP-006` foi quem
  zerou o resto (`npm audit fix` sem `--force`, depois do bump do
  electron-builder).
- `npm ls`: sem UNMET, invalid, extraneous ou peer quebrado.
- Smoke empacotado: fechado pelo autor no `DEP-006` em 2026-09-14 — `Setup.exe`
  instalado, app abre, login com credencial real, navegação e download verdes.
  É o único critério daqui que exige artefato empacotado, e foi contra ele que
  rodou.
- Comment do `DEP-003` resolvido: `https-proxy-agent` e `agent-base` de fato
  passaram a produção pelo axios 1.20, e era isso que o passo 7 mandava
  conferir. O audit de produção em 0 cobre a superfície nova; sem ação.
- `vite.config.ts`, `vitest.config.ts` e `playwright.config.ts` estão nos
  Primary files mas não foram tocados por este fechamento — quem mexeu neles
  foi o `DEP-004`.

## Comments

- 2026-09-11 (revisão do `DEP-003`): o axios 1.20 declara
  `https-proxy-agent@^5.0.1` como dependência direta. No lock, ele e o
  `agent-base@6.0.2` perderam o `"dev": true` — são produção agora. Nenhum dos
  dois tem achado de audit hoje; entra no passo 7 (audit residual) só como
  superfície nova a conferir.

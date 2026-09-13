# DEP-007: Alinhar playwright e @playwright/test numa só versão
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum

- Owner: —
- Dependencies: nenhuma. Filho de `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `playwright.config.ts` (só se a versão nova exigir)

#### What to build

`playwright@^1.56.1` e `@playwright/test@^1.59.1` estão em minors diferentes.
Suba os dois para a mesma versão (1.63.0 era a atual em 2026-09-11) e regenere
o lock no Windows.

O `playwright` aqui é dependência de **produção**: é ele que mantém a sessão
JSF do SIGAA (`ARCHITECTURE.md`). Subir o Chromium que ele baixa muda o
user-agent visto pelo portal, por isso o live smoke no critério 4.

#### Acceptance criteria

1. `npm ls playwright @playwright/test` mostra uma só versão para cada, iguais.
2. `npm run quality` verde.
3. `tests/e2e/visual.spec.ts` e os 2 testes de `app.spec.ts` sem credencial
   passam.
4. Live smoke do scraper (`RUN_LIVE_SIGAA_TESTS=true`) rodado **uma vez** pelo
   autor no Windows, resultado colado nas notas. Não entra em loop.

#### Verification

```text
npm ls playwright @playwright/test
npm run quality
npx playwright test visual.spec.ts
npx playwright test app.spec.ts
```

#### Implementation notes

- Commit: (na branch `dep-007`, ver commit de código)
- Versão escolhida: 1.63.0 (`playwright` e `@playwright/test`)
- `npm ls playwright @playwright/test`: uma versão só, 1.63.0 para os dois
  (deduped) — critério 1 ok.
- `npm run quality`: verde (0 erros, 55 warnings pré-existentes de
  `no-explicit-any`/`no-empty`, nenhum novo) — critério 2 ok.
- `npx playwright test visual.spec.ts`: 11 passed — critério 3 ok.
- `npx playwright test app.spec.ts`: 2 passed, 3 skipped (os 3 com credencial,
  esperado sem `.env` de conta real) — critério 3 ok.
- Live smoke: rodado pelo autor no Windows em 2026-09-13 (`npm run test:live`,
  `.env` real): `tests/integration/scraper.test.ts` 6 passed em 27,6s — login,
  enumeração de disciplinas, arquivos e notícias da primeira disciplina,
  logout. Ruído sem efeito: o logger falha ao gravar em
  `D:/tmp/sigaa-me-test/logs/app.log` (ENOENT) e desliga o sink — critério 4 ok.

#### Review (2026-09-13, etapa 3)

Verdito: **Needs your call** — critério 4 só o autor fecha. Fechado em
2026-09-13 com o live smoke verde (ver Implementation notes). Merge por PR #19
(`ab92ae9`).

- Critério 1 ✅ `npm ls`: `@playwright/test@1.63.0` e `playwright@1.63.0`
  (deduped), uma versão de cada.
- Critério 2 ✅ `npm run quality` no Windows: 60 arquivos, 685 passed,
  5 skipped; lint 0 erros, 55 warnings pré-existentes.
- Critério 3 ✅ `npm run test:e2e` na suíte **inteira**: 39 passed, 3 skipped
  (os credenciados). A etapa 2 tinha rodado só `visual` e `app`; os outros três
  specs (`accessibility`, `clear-all`, `security-boundaries`) também passam.
- Critério 4 ❌ pendente. É login real; agente não roda (CLAUDE.md, tiers).
- Diff dentro dos Primary files. `playwright.config.ts` não foi tocado, e não
  precisava. Lock honesto: o `fsevents` sumiu porque o 1.63.0 upstream não tem
  mais `optionalDependencies`, não por ter sido gerado numa plataforma só.
- `engines` subiu para `node >=20`; CI usa 22, sem `engines` no `package.json`.
- `playwright` não tem install script, então `allowScripts` não muda.

**Premissa errada no corpo deste ticket, corrigida aqui:** "Subir o Chromium que
ele baixa muda o user-agent visto pelo portal" não vale. O app lança o Chrome do
sistema (`channel: 'chrome'`, `playwright-login.service.ts:92,280,753,873`) e
ainda sobrescreve o UA com string fixa (linha 97) — o Chromium empacotado do
Playwright nunca é baixado nem usado. O live smoke continua valendo, por outro
motivo: são quatro minors de mudança no `playwright-core`, que é o que dirige a
sessão JSF.

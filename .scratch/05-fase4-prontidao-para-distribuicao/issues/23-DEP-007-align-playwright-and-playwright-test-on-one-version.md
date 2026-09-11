# DEP-007: Alinhar playwright e @playwright/test numa só versão
Status: open
Stage: to-implement
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

- Commit: —
- Versão escolhida: —
- Live smoke: —

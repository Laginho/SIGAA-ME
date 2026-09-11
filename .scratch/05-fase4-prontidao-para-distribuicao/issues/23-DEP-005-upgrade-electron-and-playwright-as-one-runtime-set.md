# DEP-005: Subir Electron e Playwright como um conjunto de runtime
Status: open
Stage: to-implement
Priority: P1
Blocked by: DEP-004

- Owner: —
- Dependencies: `DEP-004` (suíte estável antes de trocar o runtime). Filho de
  `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `playwright.config.ts`
  - `electron/main.ts` (só se a API do Electron novo exigir)

#### What to build

`electron@^30.0.1` está na faixa `<=40.10.2` (high). Suba para a menor
versão fora de toda a faixa listada pelo audit (41.7.2+, 42.3.4+ ou 43/44).
São vários majors; leia as breaking-changes notes do Electron entre 30 e a
versão escolhida e liste no ticket o que tocou o código, se algo tocou.

`playwright@^1.56.1` e `@playwright/test@^1.59.1` estão em minors diferentes.
Alinhe os dois na mesma versão (1.63.0 era a atual em 2026-09-11). O
Playwright aqui é dependência de **produção**: é ele que mantém a sessão JSF
do SIGAA (`ARCHITECTURE.md`). Subir o Chromium que ele baixa muda o
user-agent visto pelo portal.

A pinagem de `allowScripts` no `package.json` é por versão: ao subir o
Electron, rode `npm install-scripts approve electron` e `npm rebuild electron`
(ver `CLAUDE.md`, "npm 12 bloqueia scripts").

#### Acceptance criteria

1. `npm audit` sem a linha `electron`; `npm ls` limpo.
2. `npm run quality` verde.
3. `tests/e2e/visual.spec.ts` passa: todas as rotas renderizam nos dois temas
   sem erro de console.
4. Os 2 testes de `app.spec.ts` sem credencial passam.
5. `allowScripts` atualizado para a versão nova do Electron.
6. Live smoke do scraper (`RUN_LIVE_SIGAA_TESTS=true`) rodado **uma vez** pelo
   autor no Windows, resultado colado nas notas. Não entra em loop.

#### Verification

```text
npm ls
npm audit
npm run quality
npx playwright test visual.spec.ts
npx playwright test app.spec.ts
```

#### Implementation notes

- Commit: —
- Electron escolhido e breaking changes que tocaram código: —
- Playwright escolhido: —
- Live smoke: —

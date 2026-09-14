# DEP-005: Subir o Electron para fora da faixa vulnerável
Status: resolved
Stage: done
Priority: P1
Blocked by: DEP-004, DEP-007

- Owner: —
- Dependencies: `DEP-004` (suíte estável antes de trocar o runtime),
  `DEP-007` (Playwright já alinhado, para o live smoke isolar o Electron).
  Filho de `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `electron/main.ts` (só se a API do Electron novo exigir)

#### What to build

`electron@^30.0.1` está na faixa `<=40.10.2` (high). Suba para a menor
versão fora de toda a faixa listada pelo audit (41.7.2+, 42.3.4+ ou 43/44).
São onze majors; leia as breaking-changes notes do Electron entre 30 e a
versão escolhida e liste no ticket o que tocou o código, se algo tocou.

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

- Commit: `a3e3c74`, `850d920`, PR #24 (merge `008b1ca`).
- Electron escolhido: `41.10.7`. A faixa vulnerável do `npm audit` mudou entre
  o corpo do ticket e a execução: além de `<=40.10.2 || 41.0.0-alpha.1-41.7.1
  || 42.0.0-alpha.1-42.3.3 || 43.0.0-alpha.1-43.0.0-beta.8` (a faixa original),
  uma segunda entrada cobre `40.0.0-alpha.2 - 41.10.2` — `41.7.2` (a "menor
  versão fora de toda a faixa" original) cai dentro dela. `41.10.7` é o último
  patch do major 41 e escapa das duas.
- Breaking changes que tocaram código: nenhuma. `electron/main.ts` e os demais
  arquivos que importam de `'electron'` usam só API estável entre 30 e 41
  (`app`, `BrowserWindow`, `dialog`, `session`, `shell`, `Tray`, `Menu`,
  `safeStorage`, `Notification`, `ipcRenderer`, `contextBridge`, `ipcMain`) —
  nada do que as breaking-changes notes do Electron 31–41 removem. Diff fora de
  `package.json`/`package-lock.json`: nenhum.
- `allowScripts`: `electron@30.5.1` → `electron@41.10.7`
  (`npm install-scripts approve electron` + `npm rebuild electron`).
- `npm ls`: limpo, `electron@41.10.7` deduped — critério 1 ok.
- `npm audit`: sem linha `electron` — critério 1 ok.
- `npm run quality`: verde (0 erros, 55 warnings pré-existentes de
  `no-explicit-any`/`no-empty`, nenhum novo; 61 arquivos, 697 passed, 5
  skipped) — critério 2 ok.
- `npx playwright test visual.spec.ts`: 11 passed — critério 3 ok.
- `npx playwright test app.spec.ts`: 5 passed (`.env` real presente nesta
  máquina, então os 3 com credencial também rodaram, além dos 2 sem) —
  critério 4 ok.
- `allowScripts` atualizado para `electron@41.10.7` — critério 5 ok.
- Live smoke (critério 6): **verde**, rodado pelo autor no Windows em
  2026-09-14 com `npm run test:live`, uma vez só. 6/6 passed em 21,36s
  (`tests/integration/scraper.test.ts`): alcança a página de login (94ms),
  loga com as credenciais (2538ms), enumera as disciplinas com linhas bem
  formadas (8366ms), entra na primeira disciplina e traz arquivos e notícias
  bem formados (9164ms), desloga e libera o browser (120ms). Critério 6 ok.

#### Review (2026-09-13, etapa 3)

Veredicto: **Needs your call** — o critério 6 só o autor fecha. Nada a corrigir.

Verificado de forma independente nesta máquina, não lido das notas:

1. ✅ `npm ls` limpo, `electron@41.10.7`. `npm audit` sem linha `electron`. As
   entradas de `undici` que o audit ainda aponta vêm de `cheerio@1.0.0`
   (6.25.0) e `jsdom@29.0.2` (7.25.0), pré-existentes; a do Electron é
   `@electron/get@5.1.0 → undici@7.29.1`, fora da faixa do aviso. O bump não
   introduziu advisory nenhum.
2. ✅ `npm run quality` verde: 0 erros de lint, 55 warnings pré-existentes,
   61 arquivos, 697 passed, 5 skipped. Bate com as notas.
3. ✅ `visual.spec.ts`: 11 passed, nenhum erro de console.
4. ✅ `app.spec.ts` filtrado nos 2 sem credencial: 2 passed. Os 3 com
   credencial não foram repetidos de propósito — são login real.
5. ✅ `allowScripts` = `electron@41.10.7`, casa com o instalado.
6. ✅ Live smoke: rodado pelo autor em 2026-09-14, 6/6 verde (ver notas).

Sobre "nenhuma breaking change tocou código": confirmado. O levantamento do uso
de `electron` no repo devolve só API estável entre 30 e 41 (`app`,
`BrowserWindow` com `webPreferences` de chaves inalteradas, `dialog`, `session`,
`shell`, `Tray`, `Menu`, `safeStorage`, `Notification`, `ipcMain`/`ipcRenderer`,
`contextBridge`, `setWindowOpenHandler`, `will-navigate`). Nada de `BrowserView`,
`protocol.*`, `remote`, `webFrame` ou `utilityProcess` — exatamente as áreas onde
as breaking-changes de 31–41 mexeram. O `tsc --noEmit` verde roda contra os
`.d.ts` do próprio Electron 41, então remoção de API de nível de tipo teria
falhado o gate.

Fora dos critérios, checado porque este esforço é prontidão para distribuição:

- **Empacotamento funciona com o Electron 41.** `electron-builder@24.13.3`
  gerou `release/1.2.0/win-unpacked/` completo, e o `SIGAA-ME.exe` reporta
  `FileVersion 41.10.7`. Não há incompatibilidade builder 24 × Electron 41.
- **`npm run build` completo falha nesta máquina**, e **não é por causa deste
  ticket**: o `7za` não consegue criar symlink ao extrair o toolchain de
  `winCodeSign` (`A required privilege is not held by the client`, nos
  `libcrypto.dylib`/`libssl.dylib` do darwin). É privilégio do Windows
  (Developer Mode ou admin), acontece antes de qualquer coisa ligada ao
  Electron, e falharia igual no `master` com o Electron 30. Vale anotar para o
  `DEP-006`, não bloqueia aqui.
- `@types/node` subiu 20 → 24 por arrasto do Electron. Typecheck verde. Risco
  teórico e baixo: tipa API de Node mais nova que o runtime do Electron 41.
  Sem ação.

Diff confinado aos Primary files: `package.json`, `package-lock.json` e este
ticket. `electron/main.ts` não foi tocado, como o ticket previa. As 646 deleções
no lock são a subárvore do `@electron/get` 2 → 5, que troca a cadeia
`got`/`cacheable-request`/`global-agent` por `undici`.

Fechado em 2026-09-14: live smoke verde pelo autor (6/6) e PR #24 mergeado.

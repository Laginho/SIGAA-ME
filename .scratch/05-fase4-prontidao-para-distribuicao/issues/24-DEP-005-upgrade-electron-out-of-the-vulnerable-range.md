# DEP-005: Subir o Electron para fora da faixa vulnerável
Status: open
Stage: to-review
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

- Commit: (na branch `dep-005`, ver commit de código)
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
- Live smoke (critério 6): **pendente, fica para o autor.** É login real no
  SIGAA; o agente não roda esse tier (CLAUDE.md, tabela de tiers de teste).
  Rodar `npm run test:live` (ou `RUN_LIVE_SIGAA_TESTS=true`) no Windows e colar
  o resultado aqui antes de fechar.

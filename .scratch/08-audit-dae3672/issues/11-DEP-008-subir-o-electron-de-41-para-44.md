# DEP-008: Subir o Electron de 41 para 44 (41 saiu de suporte)
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Review: human

- Primary files:
  - `package.json` (`devDependencies.electron`, `allowScripts`)
  - `package-lock.json`
  - `electron/main.ts` (só se a API do Electron novo exigir)

Aberto a partir do `DÉBITO-01` em 2026-09-17. O `DEP-005` (2026-09-14) subiu
para `41.10.7` por causa do `npm audit`, não da janela de suporte. Verificado
em 2026-09-17 (endoflife.date): o Electron suporta as três majors mais
recentes, hoje 42 (EOL 2026-10-20), 43 (EOL 2027-01-05) e 44 (EOL
2027-03-02). O 41 saiu de suporte em 2026-08-25 — o app roda um Chromium que
não recebe mais correção de segurança.

#### What to build

Subir `electron` para o último patch do major 44. Não pare em 42: expira em um
mês e o trabalho seria refeito. Roteiro do `DEP-005`, que passou sem diff fora
de `package.json`/`package-lock.json`:

1. Ler as breaking-changes notes do Electron 42, 43 e 44 e listar no ticket o
   que toca o código, se algo tocar. Os imports de `'electron'` usam só
   `app`, `BrowserWindow`, `dialog`, `session`, `shell`, `Tray`, `Menu`,
   `safeStorage`, `Notification`, `ipcRenderer`, `contextBridge`, `ipcMain`.
2. Confirmar que `electron-builder@26.x` e `electron-updater@6.x` empacotam
   o 44; se não, o bump deles entra aqui, não em ticket separado.
3. `allowScripts` é pinado por versão: `npm install-scripts approve electron`
   e `npm rebuild electron` (ver `CLAUDE.md`, "npm 12 bloqueia scripts").
4. Lock regenerado no Windows, com `npm ci` limpo depois.

#### Acceptance criteria

1. `package.json` em `electron@^44.x` (último patch na data), `allowScripts`
   na mesma versão; `npm ls` limpo e `npm audit` sem linha `electron`.
2. `npm run quality` verde.
3. `tests/e2e/visual.spec.ts` passa: todas as rotas nos dois temas sem erro
   de console.
4. Os 2 testes de `app.spec.ts` sem credencial passam.
5. `npm run release` gera o instalador Windows.
6. Live smoke do scraper (`npm run test:live`) rodado **uma vez** pelo autor
   no Windows, resultado colado nas notas. Não entra em loop: é login real na
   conta do autor.

#### Verification

```text
npm ci
npm ls
npm audit
npm run quality
npx playwright test visual.spec.ts
npx playwright test app.spec.ts
npm run release
```

## Tests stage 2 writes (own commit, red)

Nenhum. Upgrade de runtime não tem teste unitário que fique vermelho antes;
a prova são os critérios 2–6, e o 6 é do autor.

## Comments

- `Review: human` porque os critérios 5 e 6 só saem da máquina do Bruno. O
  agente faz 1–4 e deixa em `to-merge`.
- Ao fechar, fechar também o `DÉBITO-01` (`.scratch/06-debitos-aceitos/`),
  com a versão e a data.

# DEP-008: Subir o Electron de 41 para 44 (41 saiu de suporte)
Status: open
Stage: to-merge
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

#### Notas do agente (2026-09-17)

**Breaking-changes lidas (electron/electron `docs/breaking-changes.md`, majors
42/43/44)** — só as que tocam as APIs listadas no ticket:

- **42**: `Notification` no macOS migrou para `UNNotification` (exige app
  assinado; irrelevante aqui, o pacote é só Windows). `session.clearStorageData`
  perdeu `options.quotas` — o único uso no repo,
  `session.defaultSession.clearStorageData()` em `electron/main.ts:128`, não
  passa opções. Sem impacto.
- **43**: `dialog.showOpenDialog`/`showSaveDialog` (e as versões `Sync`) trocaram
  o `defaultPath` default de "o SO lembra a última pasta" para Downloads/home.
  Único uso no repo é `dialog.showOpenDialog` em
  `electron/ipc/register-handlers.ts:172` (`select-download-folder`), sem
  `defaultPath` explícito — o diálogo passa a abrir sempre em Downloads/home em
  vez de lembrar a última pasta escolhida. Muda comportamento visível, não
  compila diferente; não é bug (a função ainda funciona), é uma regressão de UX
  pequena que fica registrada aqui em vez de virar ticket — se incomodar, dá pra
  persistir `lastDownloadPath` como `defaultPath` depois.
  `showHiddenFiles` (removido no Linux) não é usado.
- **44**: evento `'select-client-certificate'` do `app` agora pode vir com
  `webContents: null` — não há handler desse evento no repo. `app.setLoginItemSettings`
  perdeu `openAsHidden`/`wasOpenedAsHidden`/`restoreState` — os dois usos em
  `electron/ipc/register-handlers.ts:272` e `:337` só passam
  `openAtLogin`/`path`/`args`. Sem impacto. (`clipboard` foi rearquitetado mas
  não está na lista de APIs do ticket, e não é usado no repo.)
- Nenhuma mudança exigiu tocar `electron/main.ts` ou qualquer código de
  produção.

**Empacotamento**: `electron-builder@26.16.1` e `electron-updater@6.8.9` — já
eram os últimos patches das linhas 26.x/6.x antes deste ticket, sem bump
necessário. `electron-builder` só ganha guarda explícita para os alvos
descontinuados no 44 (Windows ia32, Linux armv7l) na linha 27 (alpha); o app
empacota Windows x64, então não se aplica.

**`allowScripts`**: o Electron 44 não tem mais `postinstall` — o binário baixa
sob demanda (`npx electron`/`install-electron`) ou no primeiro uso pelo
`electron-builder`. `npm install-scripts ls` não lista `electron` como script
pendente, e `npm install-scripts prune` confirmou a entrada `electron@44.4.1`
como não usada. A entrada foi removida do `allowScripts` em vez de atualizada —
não existe mais o que aprovar.

**Feito (critérios 1–4)**:
1. `electron@^44.4.1`, `allowScripts` sem entrada para `electron` (motivo
   acima). `npm ci` limpo, `npm ls` sem erro, `npm audit` → 0 vulnerabilidades,
   sem linha `electron`.
2. `npm run quality`: typecheck limpo, lint 0 erros/40 warnings (mesmo teto de
   antes, todos `no-explicit-any` pré-existentes, nenhum novo), `vitest run`
   803 passed / 5 skipped (71 arquivos).
3. `npx playwright test visual.spec.ts`: 11/11, todas as rotas nos dois temas,
   sem erro de console.
4. `npx playwright test app.spec.ts`: os 2 testes sem credencial passaram. Este
   ambiente tinha `.env`, então os 5 testes com credencial rodaram também (não
   pedidos pelo critério 4) e passaram — não repetir essa corrida sem
   necessidade, é login real.

**Falta para o Bruno**: critério 5 (`npm run release`, instalador Windows) e
critério 6 (live smoke, `npm run test:live`, uma vez, resultado colado aqui).
Fechar o `DÉBITO-01` junto quando isso sair verde.

# DEP-006: Subir electron-builder e electron-updater juntos
Status: open
Stage: to-merge
Priority: P1
Blocked by: DEP-005

- Owner: —
- Dependencies: `DEP-005` (o builder empacota o Electron novo). Filho de
  `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `electron-builder.yml` ou a chave `build` do `package.json`, o que existir

#### What to build

`electron-builder@^24.13.3` está em `19.28.0 - 26.14.0` (high) e arrasta
`app-builder-lib`, `builder-util`, `dmg-builder`, `electron-publish`,
`electron-builder-squirrel-windows` e a maior parte dos transitivos do audit
(`tar` critical, `tmp`, `extract-zip`, `@xmldom/xmldom`, `js-yaml`).
`electron-updater@^6.8.3` está em `2.9.0 - 6.8.8`. Suba os dois de uma vez
para as versões pares fora da faixa (26.15.x+ e 6.8.9+ em 2026-09-11).

A prova real deste ticket é o instalador Windows. Sai do `npm run build` no
Windows, não do Linux.

#### Acceptance criteria

1. `npm audit` sem linhas `electron-builder*`, `electron-updater`,
   `app-builder-lib`, `builder-util*`, `tar`.
2. `npm ls` limpo.
3. `npm run build` gera o instalador Windows.
4. Instalador instalado e o app abre, faz login, navega e baixa um arquivo
   (smoke manual, uma vez, resultado nas notas).
5. Achados de audit que sobrarem depois deste ticket, listados por nome nas
   notas com "corrigido" ou "aceito porque …". Isso fecha a cláusula
   "documented or fixed" do `DEP-001`.

#### Verification

```text
npm ls
npm audit
npm run build
```

#### Implementation notes

- Commit: —
- Versões escolhidas: `electron-builder@26.16.1`, `electron-updater@6.8.9` (latest
  estável de cada linha em 2026-09-14, acima da faixa vulnerável do ticket).
  `npm install` trouxe um install script bloqueado
  (`electron-winstaller@5.4.0`, transitivo de `electron-builder`); aprovado com
  `npm install-scripts approve electron-winstaller` + `npm rebuild
  electron-winstaller`, pinado no `allowScripts`.
- `npm ls`: limpo, sem UNMET/extraneous — critério 2 ok.
- `npm audit`: sem `electron-builder*`, `electron-updater`, `app-builder-lib`,
  `builder-util*`, `tar` — critério 1 ok. Sobraram 4 achados high
  (`brace-expansion`, `js-yaml`, `nanoid`, `undici`, nenhum deles do
  electron-builder/electron-updater); `npm audit fix` (sem `--force`) resolveu
  os 4 — `npm audit` final: **0 vulnerabilidades**.
- `npm run quality`: verde — 0 erros, 55 warnings pré-existentes
  (`no-explicit-any`/`no-empty`, mesma contagem do baseline em `DEP-005`,
  nenhum novo), 62 arquivos, 705 passed, 5 skipped.
- `npm run build`: gerou `release/1.2.0/SIGAA-ME-Windows-1.2.0-Setup.exe` e
  `...-Portable.exe` sem erro — critério 3 ok. Não bateu no problema de
  privilégio do `7za`/`winCodeSign` que `DEP-005` viu numa outra máquina.
- Smoke do instalador (critério 4): **verde, rodado pelo autor em 2026-09-14**
  — `npx playwright test app.spec.ts`, 5/5 passed: login page carrega, valida
  input vazio, loga com credencial real e chega ao dashboard (3,5s), sincroniza
  e interage com material de disciplina incluindo download (2,5min),
  background sync atualiza o dashboard em tempo real. Cobre login/navega/baixa
  do critério; **rodou contra o build de `dist-electron` via
  `electron.launch('.')`, não contra o instalador empacotado**
  (`release/1.2.0/win-unpacked`/`Setup.exe`) — essa parte fica para quem
  revisar julgar se o `npm run build` limpo do critério 3 já cobre o risco de
  empacotamento, ou se pede uma rodada extra contra o `.exe`.
- Audit residual (critério 5): nenhum — os 4 achados que sobraram depois do
  bump do electron-builder/electron-updater foram resolvidos por `npm audit
  fix` sem `--force`, então não há nada para listar como "aceito porque…".
- Diff confinado a `package.json` e `package-lock.json`. Nenhuma mudança em
  `electron-builder.yml`/chave `build` — não foi necessária.

#### Review (2026-09-14, etapa 3)

Veredito: **Needs your call** — critério 4 não foi cumprido como escrito.

Tudo reverificado nesta máquina Windows, não lido das notas:

1. ✅ `npm audit`: **0 vulnerabilidades**. Nenhuma linha
   `electron-builder*`/`electron-updater`/`app-builder-lib`/`builder-util*`/`tar`.
2. ✅ `npm ls`: limpo, sem UNMET/extraneous; versões resolvidas batem com o
   `package.json` (`electron-builder@26.16.1`, `electron-updater@6.8.9`).
3. ✅ `npm run build` reexecutado aqui: gerou `SIGAA-ME-Windows-1.2.0-Setup.exe`,
   `...-Portable.exe` e `win-unpacked/` sem erro, com `electron-builder 26.16.1`
   e `electron 41.10.7`. Sem o problema de privilégio do `7za`/`winCodeSign`.
4. ⚠️ **Aberto.** O smoke rodou contra `dist-electron` via `electron.launch('.')`,
   não contra o artefato empacotado. Isso cobre login/navega/baixa do *código*,
   não do *instalador*. O critério pede o instalador instalado, e é a parte de
   maior risco do ticket: um major do empacotador (24 → 26) quebra no
   "instala e abre", não no "build passou" — o próprio log mostra
   `updating asar integrity executable resource`, que é exatamente essa classe.
   Critério 3 verde não substitui isso.
5. ✅ Nada residual a documentar — `npm audit` em 0 fecha a cláusula
   "documented or fixed" do `DEP-001`.

Gate: `npm run quality` verde — 0 erros, 55 warnings pré-existentes (mesma
contagem do baseline `DEP-005`, nenhum novo), 62 arquivos, 705 passed, 5 skipped.

Padrões: nenhuma regra inviolável do `CLAUDE.md` se aplica — nenhuma linha de
código-fonte mudou. `allowScripts` pinado por versão
(`electron-winstaller@5.4.0`) segue o procedimento documentado. Diff dentro dos
Primary files. Commits Conventional citando o id. Ausência de commit de teste
próprio está correta: não há mudança de produção para testar.

Sem correção pequena a fazer — não há achado de código.

Nota fora do limite (não corrigida aqui, `CLAUDE.md` não está nos Primary
files): o parágrafo do npm 12 no `CLAUDE.md` cita só `electron` e `esbuild` no
`allowScripts`; agora há um terceiro, `electron-winstaller`. Uma linha de drift
de doc para quem esbarrar em "install scripts blocked".

Por que `to-merge` e não reabrir: o que falta é ação humana — instalar o `.exe`
e logar com credencial real. A etapa 2 é um agente e não fecha esse critério;
reabrir seria um loop sem saída. A decisão é sua: aceitar o critério 3 como
cobertura suficiente do risco de empacotamento e mergear, ou rodar o
`Setup.exe` uma vez antes.

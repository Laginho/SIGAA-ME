# CLAUDE.md — contexto deste projeto

App desktop Electron que faz scraping do SIGAA da UFC (`si3.ufc.br`) para dar ao
aluno leitura offline de disciplinas, arquivos e notícias.

**Leia antes de trabalhar aqui:** `docs/PLANO.md` (plano ativo e decisões) e
`.scratch/` (uma pasta por fase, `NN-faseN-slug/`, com `spec.md`, `ledger.md` e
`issues/NN-ID-slug.md`; a linha `Status:` no topo da issue é a verdade sobre a
tarefa). Antes de mexer em scraping, `ARCHITECTURE.md`.

## Arquitetura em uma frase

Playwright estabelece e mantém a sessão JSF do SIGAA; HTTP pega emprestado os
cookies para parsing e download (~10x mais rápido) e cai de volta no Playwright
quando falha.

Persistência: **JSON no `userData`** (main) + **`localStorage`** (renderer).
Não existe SQLite, apesar de `sqlite@5` no `package.json` e do README dizerem o
contrário.

Dois fatos que uma busca não revela:

- `download.service.ts` é carregado por `await import()` (invisível para grep de
  `import ... from`) e **não é alcançável**: os dois métodos que o importam não
  têm chamador. O download real é `httpScraper.downloadFile`. O fallback
  Playwright que `ARCHITECTURE.md` descreve existe como código e não está ligado.
- Código que parece proteger algo pode não fazer nada (`pauseSync()` tinha
  chamada, `try/catch` e cast, e o método não existia no preload). Ao encontrar
  proteção importante, confirme que o outro lado existe.

## Loop de trabalho

Três papéis em **três sessões separadas**, porque quem escreve os testes não é
quem os faz passar (14 testes verdes já ficaram em cima de um parser quebrado).

1. **Especificar**: grilling da tarefa, issue em `.scratch/` com critérios de
   aceite e os testes **falhando**, contra código de produção. Antes de declarar
   um contrato de IPC, abrir o handler **e** o serviço por trás dele.
2. **Implementar** (sessão limpa, só a issue e os testes): fazer os testes
   passarem e refatorar. Nada além disso.
3. **Revisar** (sessão limpa, sem ver a sessão que especificou): conferir o diff
   contra a issue e subir a cadeia de chamadores de tudo que o diff toca. Só
   reporta achado com cenário de falha concreto; zero achados é resposta válida.
   Discordância vira teste, não debate. Fecha a issue, commita e abre o PR.

Tarefa trivial vai direto, sem loop. Gate, convenções de teste, commits e
registro na issue: `docs/agents/orchestration.md`.

## Comandos

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção (só Windows)
npm run quality      # typecheck + lint + testes, nessa ordem — é o gate
npm test             # só a suíte (vitest run)
npm run typecheck
npm run lint
```

**Instalação só no Windows, pelo autor, com `npm ci`** (o lock foi regenerado no
Windows; `npm install` resolveria fora do lock). Electron e Playwright têm
binários por plataforma: instalar de um Linux para dentro desta pasta quebra o
setup local. Um agente num Linux **copia o repo sem `node_modules`** e instala
lá; o gate inteiro roda em ~12s. Do Linux não saem `npm run build` nem
`test:e2e`.

O npm 12 bloqueia scripts de instalação; a aprovação está em `allowScripts` no
`package.json`, pinada por versão. Ao subir `electron` ou `esbuild`:
`npm install-scripts approve electron esbuild` e `npm rebuild electron esbuild`.

### Verificação visual (Linux)

```bash
npx vite build
node node_modules/electron/install.js
xvfb-run -a npx playwright test visual.spec.ts     # PNGs em _agent_tmp/shots/
```

Duas armadilhas, meia hora cada se você não souber:

1. Precisa de um `google-chrome` no PATH. Sem ele, `main.ts` abre um
   `dialog.showErrorBox` **antes** de `createWindow()` e o Playwright dá timeout
   sem dizer por quê. Solução: `ln -s <chromium do playwright> ~/bin/google-chrome`.
2. O boot chama `tryAutoLogin()` de verdade. Para inspecionar UI, plante fixture
   em `sessionStorage["sigaa-me:v2:session:account"]` (um `AccountProfile` com
   `id`) e `localStorage["sigaa-me:v2:<id>:courses"]` e navegue por hash, como
   `tests/e2e/visual.spec.ts` faz.

### Tiers de teste

| Tier | Onde | Precisa de |
|---|---|---|
| Unit + integração mockada | `tests/unit/`, `tests/integration/` (vitest) | nada |
| Parser contra fixture | `tests/integration/parser-real.test.ts` | nada |
| Visual | `tests/e2e/visual.spec.ts` (playwright) | nada |
| E2E sem credencial | `tests/e2e/app.spec.ts`, 2 testes | nada |
| Live smoke do scraper | `tests/integration/scraper.test.ts` | `.env` + `RUN_LIVE_SIGAA_TESTS=true` |
| E2E fluxo completo | `app.spec.ts`, 3 testes | `.env` |

- `tests/e2e/` é só `*.spec.ts`. Um `.test.ts` ali zera a coleta do Playwright
  sem erro óbvio.
- Os tiers com credencial são login real na conta do usuário. Rodam à mão,
  antes de release, só o Bruno.
- Teste chama código de produção, não uma cópia da lógica (`tests/fixtures/README.md`).

## Regras do código

Cada uma existe por causa de um bug real deste repositório.

1. **Nunca `innerHTML` com dado do SIGAA** (nome de disciplina, arquivo,
   notícia, foto). Use `textContent`. O corpo da notícia é a única exceção
   possível, e só depois de um sanitizador com allowlist (`SEC-001`, não feita).
   Não existe sanitizador no projeto; não improvise um inline.
2. **Nunca `as any` para atravessar o IPC.** Foi assim que `pauseSync()`
   inexistente passou meses. Se `window.api` não tem o método, o problema é o
   contrato do preload.
3. **`try/catch` que só faz `console.error` é bug.** Ou o erro importa e é
   tratado ou propagado, ou o `try` não deveria existir.
4. **Canal IPC novo: nomeado, tipado, com validação de payload no main.** O
   preload ainda expõe `ipcRenderer` genérico (`SEC-002`, aberta); não amplie
   essa superfície. Nunca passe script JSF, ViewState, cookie ou URL interna do
   SIGAA para o renderer.
5. **Credencial só de `process.env`, sem valor padrão.** Um
   `process.env.SIGAA_PASS || '<senha>'` já foi para um repositório público.
   Sem a variável, o programa falha, e falhar é o correto.
6. **Retorno de IPC é união discriminada**, `{ success: true; x: T } | { success: false }`,
   não `{ success: boolean; x?: T }`. Erro de `undefined` repetido em vários
   consumidores quase sempre é união faltando na origem. E o contrato declara o
   que o handler **devolve**: abra o handler e o serviço, não deduza.
7. **Sem abstração para um caso.** São 6.282 linhas de TypeScript para um app
   que lista arquivos; o problema não é falta de estrutura.

## Antes de commitar

`npm run quality` verde, sem `any` novo em `preload.ts`/handlers, sem
`innerHTML` novo com dado externo. Bug corrigido tem um teste que falharia sem
a correção; se nenhum teste falharia ao reverter a mudança, ela não está
verificada. Cada implementação concluída é um commit Conventional Commit
próprio, com o gate verde.

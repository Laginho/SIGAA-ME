# CLAUDE.md — regras deste projeto

App desktop Electron que faz scraping do SIGAA da UFC (`si3.ufc.br`) para dar ao
aluno leitura offline de disciplinas, arquivos e notícias.

**Leia antes de trabalhar aqui:** `AGENTS.md` (fluxo de trabalho por ticket),
`docs/PLANO.md` (plano ativo e decisões tomadas) e `.scratch/` (tracker de
tarefas; layout, IDs e estados em `docs/agents/issue-tracker.md`). O
`CODE_REVIEW.md` é registro histórico com correções marcadas inline.

## Loop de trabalho

O loop é a skill `ticket-flow` (única cópia); gate, branch base e modelo por
etapa no bloco `## Bindings do fluxo` do `AGENTS.md`; convenções de teste,
commits e registro na issue em `docs/agents/orchestration.md`.

Histórico, para não repetir experimento: o PTMR (PLAN/TEST/MAKE/READ) deixou um
plano errado atravessar TEST e MAKE (`DL-001`) e foi removido. `PROC-001`
(2026-09-07) validou Fable especifica / Sonnet implementa / Opus revisa — revisão
cega do Fable sobre `DATA-002`, `CONC-001` e `DL-002` não achou nada além do
Opus. `PROC-002` testou dois Sonnets (red e green) com auditoria cega do spec;
conclusão: todo spec deixa buraco, o que segura é a auditoria. Em 2026-09-08 o
fluxo foi refeito do zero por grilling e ficou com **um** Sonnet fazendo red e
green (testes em commit próprio): a trava é o `diff --stat`, não um segundo
agente. Se a dúvida voltar, alterne por ticket e conte merges diretos.

## Agent skills

### Issue tracker

Markdown local em `.scratch/`, IDs estilo Jira. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/`, ainda inexistentes). See `docs/agents/domain.md`.

## Como trabalhar numa sessão

Valem para qualquer papel, e principalmente para o implementador.

- **Edite, não reescreva.** Mudança em arquivo existente é edição pontual do
  trecho afetado. Reescrever o arquivo inteiro gasta tokens e, pior, apaga em
  silêncio o que o diff teria preservado.
- **Limites explícitos.** Só toque no que a tarefa pede. Implementador não edita
  arquivo de teste — quem escreve os testes não é quem os faz passar. Ninguém
  edita `docs/PLANO.md` nem issue em `.scratch/` que não seja a sua. Se algo
  fora do limite precisa mudar, diga no relatório em vez de mudar.
- **Ninguém está assistindo.** Ação reversível coberta pelo pedido original
  (editar, rodar o gate, commitar na branch da tarefa) segue sem perguntar.
  Parar para pedir permissão bloqueia o trabalho. Push, PR e merge dentro do
  fluxo seguem o que a skill `ticket-flow` e a linha `Review:` do ticket mandam.
  Só pare em ação destrutiva ou mudança de escopo. Autonomia sem o limite acima
  vira creep de escopo; os dois andam juntos.
- **Defina "pronto" antes de começar.** Pronto é: testes da issue passam,
  `npm run quality` verde, nada fora do limite tocado. Regra de estilo nenhuma
  substitui isso.
- **Busca vai para subagente Sonnet.** Sessão de modelo caro não explora o
  repositório: 30 leituras para achar 2 arquivos relevantes é o maior
  desperdício de token do loop. Delegue com o `Agent`, `subagent_type:
  "Explore"` e **`model: "sonnet"`** — sem o `model`, o subagente cobra a taxa
  do modelo da sessão. Ele gasta o contexto dele na varredura e devolve só a
  conclusão: a sessão recebe caminhos e faixas de linha, não os arquivos.
  Depois abra os 3 que importam. Vale para o revisor também — os chamadores
  saem de `grep`, e você lê a função que chama, não o arquivo inteiro.
- **Prosa direta.** Sem metáfora, sem floreio, sem parêntese explicativo.
  Frase curta, resultado primeiro. Em código, comentário só quando o porquê não
  está óbvio no próprio código.

## Comandos

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção
npm run quality      # typecheck + lint + testes, nessa ordem — é o gate
npm test             # só a suíte (vitest run, termina sozinho)
npm run typecheck    # só os tipos
npm run lint         # só o ESLint
```

**`npm install` roda no Windows, pelo autor.** O projeto depende de binários
nativos por plataforma (Electron, Playwright). Instalar de um ambiente Linux
para dentro desta pasta baixa binários errados e quebra o setup local.

O que um agente com esta pasta montada de um Linux consegue rodar, medido em
2026-08-04:

| Comando | Funciona? | Detalhe |
|---|---|---|
| `tsc --noEmit` | **Sim** | JS puro, ~20s. É o loop de feedback útil |
| `eslint .` | Inviável | ~40s **por arquivo** — ligado por I/O na montagem, não por CPU |
| `vitest run` | **Não** | o `node_modules` montado é do Windows: `.bin/vitest` chama `node.exe` |

O `vitest` não falha por incompatibilidade do `rolldown` — ele publica binding
por plataforma, e o lock lista todas as 15, `linux-x64-gnu` inclusive. O que
existe na montagem é só a `win32` porque foi lá que o `npm install` rodou.
Instalado no Linux, o `vitest` roda.

**Copiar o repositório (sem `node_modules`) para o ambiente do agente e instalar
as dev-deps lá é o caminho bom, e é bem mais rápido que a montagem.** Medido em
2026-08-05, num container Linux:

| Comando | Tempo | Resultado |
|---|---|---|
| `tsc --noEmit` | 3,1s | limpo |
| `eslint .` | 2,8s no repo **inteiro** | 0 erros, 125 warnings (`no-explicit-any`) |
| `vitest run` | 5,8s | 68 passed, 4 skipped |

O gate inteiro em ~12s. O que **não** sai de um Linux: `npm run build`
(`electron-builder --win` precisaria de wine) e `test:e2e`. O binário do Electron
para Linux baixa normalmente, e o app abre com
`xvfb-run electron --no-sandbox` — dá para inspecionar a UI, não para gerar
instalador.

**`npm ci` voltou a ser o caminho autoritativo em 2026-08-09 (`DEP-002`).** O
Vite subiu de 5.4.21 para 6.4.3, major aceita pelo Vitest 4.1.4, e o lock foi
regenerado no Windows. Uma instalação limpa, `npm run quality` e o empacotamento
Windows passaram. Os workflows usam `npm ci`; não troque de volta para
`npm install`, que resolveria versões fora do lock.

**A execução no Windows continua sendo a autoridade** para build, E2E e empacotamento.

**npm 12 bloqueia scripts de instalação por padrão.** Num PC novo (2026-09-02), o
`npm ci` terminou sem o binário do Electron nem do esbuild e o gate não rodava. A
aprovação fica em `allowScripts` no `package.json`, pinada por versão. Ao subir
`electron` ou `esbuild`, rode `npm install-scripts approve electron esbuild` e
`npm rebuild electron esbuild`; se o `npm ci` avisar "install scripts blocked",
é isso.

### Loop de verificação visual (num Linux)

O gate prova que nada quebrou; ele não mostra como ficou. Para trabalho de UI,
depois de copiar o repo e instalar as dev-deps:

```bash
npx tsc --noEmit && npx eslint . && npx vitest run       # ~12s
npx vite build                                           # ~7s, não precisa do Electron
node node_modules/electron/install.js                    # baixa o binário Linux
xvfb-run -a npx playwright test visual.spec.ts           # ~16s, screenshots por rota
```

`tests/e2e/visual.spec.ts` abre o app de verdade, navega por hash em todas as
rotas em tema claro e escuro, falha se alguma renderizar vazia, e no final falha
se qualquer navegação deixou erro no console. Os PNGs ficam em
`_agent_tmp/shots/` para alguém olhar — não são snapshots comparados
automaticamente.

Duas armadilhas medidas em 2026-08-05, ambas custam meia hora se você não souber:

1. **Precisa de um `google-chrome` no PATH.** O `whenReady` do `main.ts` procura o
   Chrome e, se não achar, chama `dialog.showErrorBox` — um modal que **bloqueia
   antes de `createWindow()`**. Sem window, o Playwright dá timeout e não diz por
   quê. Num container com Playwright: `ln -s <chromium do playwright> ~/bin/google-chrome`.
2. **Não espere o boot real.** O boot chama `window.api.tryAutoLogin()`, que faz
   login de verdade no SIGAA. Para inspecionar UI isso é ruído: plante fixture em
   `sessionStorage["sigaa-me:v2:session:account"]` (um `AccountProfile` com `id`) e
   `localStorage["sigaa-me:v2:<id>:courses"]` e navegue por hash,
   como o spec faz.

### Os tiers de teste

| Tier | Onde | Precisa de | Runner |
|---|---|---|---|
| Unit + integração mockada | `tests/unit/`, `tests/integration/` | nada | vitest |
| Parser contra fixture | `tests/integration/parser-real.test.ts` | nada | vitest |
| Visual | `tests/e2e/visual.spec.ts` | nada | playwright |
| E2E sem credencial | `tests/e2e/app.spec.ts` (2 testes) | nada | playwright |
| Live smoke do scraper | `tests/integration/scraper.test.ts` | `.env` **+** `npm run test:live` (ou `RUN_LIVE_SIGAA_TESTS=true`) | vitest |
| E2E fluxo completo | `app.spec.ts` (3 testes) | `.env` | playwright |

Regras que sustentam isso:

- **`tests/e2e/` é só `*.spec.ts`.** O `playwright.config.ts` fixa
  `testMatch: '**/*.spec.ts'` porque o vitest inclui `tests/**/*.test.ts` e o
  Playwright, pelo padrão dele, pegava os dois. Um teste de vitest em
  `tests/e2e/` fazia o Playwright morrer na transformação e **zerar a coleta
  inteira** — 0 testes, sem erro óbvio.
- **Os tiers com credencial não entram em loop.** São login real na conta do
  usuário no portal da universidade: rodar em ciclo é dezenas de logins
  automatizados e risco de bloqueio. Manual, antes de release.
- **Teste não espelha implementação.** `tests/unit/parser.test.ts` declara que
  suas funções "mirror the parsing logic in the service" — ele testa uma cópia,
  e a cópia não tem a detecção de selector drift que o serviço real tem. Foi
  assim que um `/['"](\\d+)['"]/` (barra invertida literal, não dígito) ficou
  quebrado no parser real com 14 testes verdes em cima. Teste novo chama o
  código de produção; ver `tests/fixtures/README.md`.

O que este loop **não** cobre: empacotamento, assinatura, e qualquer coisa que
dependa de sync real contra o `si3.ufc.br`.

## Arquitetura em uma frase

Playwright estabelece e mantém a sessão JSF do SIGAA; HTTP "pega emprestado" os
cookies para o que é possível (parsing e download, ~10x mais rápido) e cai de
volta no Playwright quando falha. Detalhes em `ARCHITECTURE.md` — leia antes de
mexer em scraping.

Persistência hoje: **JSON no `userData`** (main) + **`localStorage`** (renderer).
Não existe SQLite, apesar de `sqlite@5` estar no `package.json` sem uso e do
README dizer o contrário.

## Regras invioláveis

Cada uma existe por causa de um bug real deste repositório.

### 1. Nunca `innerHTML` com dado que veio do SIGAA

Nome de disciplina, nome de arquivo, título de notícia, corpo de notícia, foto de
perfil — tudo isso é **entrada não confiável**. Use `textContent`.

O corpo da notícia é a única exceção que pode precisar de HTML, e só depois de
sanitização com allowlist estrita. O sanitizador é `src/security/html-sanitizer.ts`
(`SEC-001`, fechada em 2026-09-04) — use ele, não improvise um inline.

### 2. Nunca `as any` para atravessar o IPC

Foi exatamente isso que escondeu o bug do `pauseSync()`:

```ts
// ERRADO — foi assim que um método inexistente passou meses sem ser notado
(window as any).api.pauseSync()
```

O cast desliga o verificador de tipos. Se `window.api` não tem o método que você
quer, o problema é o contrato do preload, não o TypeScript.

### 3. `try/catch` que só faz `console.error` é quase sempre um bug

Ou o erro importa — e precisa ser tratado ou propagado — ou não importa, e o
`try` não deveria existir. Engolir erro silenciosamente foi a segunda defesa que
falhou no caso do `pauseSync`.

### 4. Canal IPC novo precisa de tipo e validação

O preload expunha `ipcRenderer` genérico (`send`/`on`/`invoke`), o que permitia
ao renderer invocar qualquer canal. `SEC-002` (fechada em 2026-09-04) trocou isso
por uma API nomeada e validada. Não reintroduza o genérico.

**Não amplie essa superfície.** Todo canal novo: nomeado explicitamente, com
tipo, e com validação de payload no main. Nunca passe script JSF, ViewState,
cookie ou URL interna do SIGAA para o renderer.

### 5. Credencial nunca em código-fonte, e nunca com fallback

```ts
// ERRADO — aconteceu de verdade aqui, e foi para um repositório público
const password = process.env.SIGAA_PASS || '<senha real estava aqui>'
```

Credencial vem de `process.env` **sem valor padrão**. Se a variável não existir,
o programa falha — falhar é o comportamento correto. O `||` transforma um erro
de configuração numa credencial hardcoded permanente.

O `.gitignore` protege `.env`. Ele não protege senha escrita num arquivo `.ts`.

### 6. Retorno de IPC é união discriminada, não objeto com campos opcionais

```ts
// ERRADO — `if (!r.success) return` não estreita nada; `folderPath` continua
// `string | undefined` depois do early return, e o erro reaparece em todo
// consumidor
Promise<{ success: boolean; folderPath?: string }>

// CERTO — o early return estreita, e `folderPath` vira `string`
Promise<{ success: true; folderPath: string } | { success: false }>
```

Padrão a reconhecer: **erro de `null`/`undefined` repetido em vários call sites
quase sempre é uma união discriminada faltando na origem.** No `PIPE-002`,
corrigir a origem apagou 4 erros de uma vez sem tocar em nenhum consumidor.

E o contrato precisa casar com o que o main **devolve**, não com o que parece
razoável. O `vite-env.d.ts` foi escrito por leitura parcial do main e omitia
`account`, `photoUrl`, `skipped` e `results`. Ao declarar um retorno, abra o
handler **e** o serviço por trás dele.

### 7. Não crie abstração para um caso

Sem interface com uma implementação, sem factory para um produto, sem config para
valor que nunca muda. Este repositório já tem 6.282 linhas de TypeScript para um
app que lista arquivos — o problema não é falta de estrutura.

## Antes de commitar

1. `npx tsc --noEmit` passa.
2. `npx vitest run` passa.
3. Você não adicionou `any` em código de fronteira (`preload.ts`, handlers IPC).
4. Você não adicionou `innerHTML` com dado externo.
5. Se corrigiu um bug, existe um teste que falharia sem a correção.
6. Cada implementação concluída vira um commit Conventional Commit próprio,
   depois que o gate estiver verde.

`npm run quality` verde prova que **as coisas cobertas pela suíte** continuam
funcionando. Não prova que a sua mudança funciona, se nada exercita a sua
mudança. Antes de escrever "verificado", pergunte qual teste falharia se a
correção fosse revertida — se a resposta for "nenhum", o item 5 não foi
cumprido. Ver `QA-003` no tracker para o exemplo real disso neste repositório.

## Contexto histórico útil

Este projeto foi construído com foco em resultado, e o processo ficou para
depois. A dívida resultante está catalogada e sendo paga em ordem — não é
descuido, é plano.

Dois padrões de falha que já aconteceram aqui e vale reconhecer:

**Código que finge implementar algo.** O `pauseSync()` tinha chamada, `try/catch`
e cast — parecia proteção contra concorrência. Não fazia nada. Ao encontrar
código que parece cuidar de algo importante, confirme que o outro lado existe.

**Relatório de ferramenta tratado como fato.** O caso do `download.service.ts`
teve três conclusões erradas em sequência, e vale como aula:

1. Uma busca automática disse "código morto, não há `import ... from` dele".
   Errado — ele é carregado por `await import('./download.service')`.
2. A correção disse "está vivo, é o fallback do download". Também errado — os
   dois métodos que fazem esse import dinâmico
   (`playwrightLogin.downloadFile`/`downloadAllFiles`) **não têm chamador
   nenhum**. O download real vai por `httpScraper.downloadFile`, e o retry
   também é HTTP.
3. O `ARCHITECTURE.md` descreve um fallback Playwright para download. Ele existe
   como código e **não está ligado**.

**Desatualizado desde o `BUG-004`:** `sigaa.service.ts` hoje chama
`playwrightLogin.downloadFile` via `downloadViaPlaywright` depois de o HTTP falhar
duas vezes. O fallback **está ligado**. A auditoria do `OBS-001` (2026-09-07) pegou
um spec repetindo a afirmação antiga daqui; a lição do item 2 vale contra este
próprio parágrafo: suba a cadeia, não confie no documento.

Duas lições: busca por `import ... from` não encontra `await import()`, e provar
que um arquivo é importado **não** prova que ele é alcançável — é preciso subir a
cadeia de chamadores até um ponto de entrada real (handler IPC, `main.ts`, teste).

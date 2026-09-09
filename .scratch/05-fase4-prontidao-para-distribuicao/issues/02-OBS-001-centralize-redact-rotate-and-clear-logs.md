# OBS-001 — Centralize, redact, rotate, and clear logs
Status: open
Priority: P2
Blocked by: nenhum (DL-002 fechada em 2026-09-07)
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files:
  - `electron/services/logger.service.ts` (reescrito)
  - `electron/main.ts`
  - `electron/ipc/register-handlers.ts`
  - `electron/services/persistence.service.ts`, `cache.service.ts`,
    `electron/security/navigation-policy.ts`, `electron/updater.ts` (só
    migração `console.* → logger`)
  - `eslint.config.js`
  - New: `tests/unit/logger-redaction.test.ts`
  - Editados: `tests/integration/clear-all-data.test.ts`,
    `tests/unit/log-reset.test.ts` (apagado; casos migram), e os testes que
    hoje fazem asserção em `console.error` para `navigation-policy`,
    `updater-consent`, `cache-service` e `persistence-auth-recovery`;
    `ipc-validation` ganha mock de `logger`

Fatiado em 2026-09-08, em duas rodadas. Primeira (grilling): dumps de HTML e
limpeza de legado são `OBS-003`; IDs de operação são `OBS-002`. Segunda
(`/to-tickets`): migrar ~275 call sites (202 `console.*` + 73 chamadas ao
logger antigo) em 11 arquivos é wide refactor e segue expand → migrate →
contract. Este ticket é o **expand** mais o primeiro lote: o logger novo com
todo o comportamento, `main.ts` sem monkeypatch, e a infraestrutura do main.
O pipeline de scraping migra em `OBS-004`; `playwright-login` e o contract
(`no-console` em `electron/**`, assinatura `meta?`) em `OBS-005`. Cadeia:
`OBS-001` → `OBS-004` → `OBS-005` → `OBS-003` → `OBS-002`.

Interino aceito: entre este ticket e `OBS-005`, o `console.*` dos serviços
ainda não migrados vai só para stdout, invisível em produção. Tudo fecha antes
do release.

#### Required behavior

- Remove global console monkeypatching.
- Remove `sigaa-me.log`. (`scraper.log` is `OBS-004`.)
- One logger with component scopes. `no-console` enforced by lint in the files
  this ticket migrates: the existing boundary zone (`main.ts`, `ipc/**`,
  `security/**`) plus `persistence`, `cache`, `updater`. `electron/**` is
  `OBS-005`.
- Transitional signature `info(message, ...args)` so the 73 old-logger call
  sites in `sigaa` and `playwright-login` keep compiling; `OBS-005` narrows it
  to `meta?`.
- Buffered writes, size rotation, finite retention.
- Redact passwords, cookies, headers, ViewState, JSF scripts, HTML and absolute
  paths in every mode; redact usernames, course names, filenames, titles and
  paths passed as `meta` in production.
- Logger failures never recurse into the logger.
- `clear()` removes the logs and rejects when deletion fails.

#### Acceptance criteria

- Secrets and academic content do not appear in production logs.
- Log growth is bounded.
- Clear-all removes logs; a failed deletion is reported, never swallowed.
- Logger failures do not recursively call the same failing logger.
- `npm run lint` green with `no-console: error` in the migrated files.

#### Verification

```text
npx vitest run tests/unit/logger-redaction.test.ts tests/integration/clear-all-data.test.ts
npm run quality
```

#### Implementation notes

- Commit: —
- Rotation policy: `logs/app.log`, 1 MiB por arquivo, 5 arquivos (`app.log`,
  `app.1.log` … `app.4.log`). Teto: 5 MiB.
- Redaction policy: ver "Redação" abaixo.

---

## Releitura (2026-09-08, especificação)

O que existe hoje, com evidência. Atualiza a releitura de 2026-09-07 da branch
`obs-001-logging` com o que `DEV-002` e `PORTAL-003` mudaram.

1. **Três sumidouros independentes, nenhum com limite.**
   - `electron/main.ts:27-68` troca `console.log/error/warn` por wrappers que
     escrevem em `logs/app_<timestamp>.log` — um arquivo novo por launch,
     nunca apagado. No `userData` de produção do autor: 183 arquivos, 135 MB.
   - `LoggerService` (`logger.service.ts`, 65 linhas) faz `appendFileSync` por
     linha em `sigaa-me.log` **e** `console.log` — que, patchado, grava a
     mesma linha em `logs/app_*.log`. `sigaa-me.log` está com 24 MB. Sem
     redação: `formatMessage` faz `JSON.stringify` dos argumentos.
   - `HttpScraperService.log` (`http-scraper.service.ts:59-83`) grava em
     `scraper.log` (`flags: 'w'`, cresce sem teto dentro da sessão) **e**
     `console.log`. `resetLog()` (`:115-121`) só é chamado por
     `SigaaService.clearDiagnostics()` (`sigaa.service.ts:123-125`), que só o
     `clear-all-data` chama.
2. **202 chamadas `console.*` em 11 arquivos de `electron/`.**
   `playwright-login.service.ts` 85, `background-sync.service.ts` 26,
   `download.service.ts` 25, `main.ts` 22, `sigaa.service.ts` 18,
   `http-scraper.service.ts` 6, `register-handlers.ts` 6,
   `persistence.service.ts` 5, `cache.service.ts` 4, `navigation-policy.ts` 3,
   `logger.service.ts` 2. O renderer (`src/`) tem 19 e nenhuma vai para disco.
3. **Conteúdo sensível já vai para o disco, por interpolação.** Nome de
   disciplina (`playwright-login.service.ts:516,606`, `sigaa.service.ts:342`,
   `background-sync.service.ts:134,169,171,246`), nome de arquivo
   (`download.service.ts:96,302`, `playwright-login.service.ts:850`,
   `sigaa.service.ts:452-472`), título de notícia
   (`background-sync.service.ts:228,232`, `playwright-login.service.ts:1215`,
   `sigaa.service.ts:631,641`), caminho completo com o usuário do Windows
   (`download.service.ts:88,195`, `sigaa.service.ts:344`,
   `http-scraper.service.ts:1003`), script JSF (`http-scraper.service.ts:751`,
   `download.service.ts:98`), nome do aluno (`playwright-login.service.ts:142`),
   saída do console do navegador com `href`/`onclick`
   (`playwright-login.service.ts:254,315`).
4. **Cookie de sessão no log em qualquer falha HTTP.**
   `http-scraper.service.ts:714` faz `console.error('...', error)` com o
   `AxiosError` inteiro. O wrapper do `main.ts` serializa objetos com
   `JSON.stringify`; `AxiosError.toJSON()` inclui `config.headers`, e o header
   `Cookie` (`JSESSIONID=...`, montado em `getCookieHeader`) vai para
   `logs/app_*.log`. Um 500 do portal basta. Um grep por `cookie`/`headers`
   ao lado de `console.*` não acha isso: o vazamento é pelo objeto de erro,
   não por identificador.
5. **Caminho lido no import.** `logger.service.ts:10` chama
   `app.getPath('userData')` ao construir o singleton, antes do
   `app.setPath('userData', '<nome>-dev')` do `main.ts:20-25`. Em dev,
   `sigaa-me.log` cai na pasta de produção. `DEV-002` corrigiu `cache` e
   `persistence`; `PORTAL-003` tropeçou neste defeito e contornou. Este é o
   único `app.getPath` em tempo de import que sobrou.
6. **`download.service.ts` tem chamador.** Cadeia real: IPC `download-file`
   (`register-handlers.ts:173-184`) → `SigaaService.downloadFile` →
   `_downloadFileInternal` → `downloadViaPlaywright` (`sigaa.service.ts:192-198`;
   chamado em `:270` sem script, quando nenhum parse estático lista o arquivo,
   e em `:311` depois de o HTTP falhar duas vezes) →
   `PlaywrightLoginService.downloadFile` (`playwright-login.service.ts:707,779`)
   → `DownloadService.downloadFile`. É o plano B **ativo** do download; o
   parágrafo do `CLAUDE.md` que o dá como morto está desatualizado desde o
   `BUG-004`.
7. **Diagnóstico estrutural já tem casa.** `PORTAL-003` criou
   `electron/services/diagnostics.service.ts` (`DiagnosticsService.record()`,
   `.clear()`, `prune()` de 20, `dir` como getter preguiçoso,
   `shouldCaptureRawArtifact(isPackaged, consent)`). Os ~11 dumps `debug_*.html`
   continuam inline e `DiagnosticsService.clear()` não tem chamador — ambos
   são `OBS-003`, não este ticket.
8. **Quit gracioso existe.** `main.ts:199` tem `before-quit` com lógica própria;
   o `flush` do logger entra nele.
9. Os testes existentes mockam `logger` como `{ info, warn, error }` em nove
   arquivos e fazem asserção em `console.error` em quatro. A migração
   `console.* → logger` quebra os dois grupos.

## Decisões

Grilling de 2026-09-08 (Fable + Bruno). As decisões 1 e 7 do spec de
2026-09-07 caíram porque o fato mudou (`PORTAL-003`); as demais foram
reconfirmadas.

1. **Um módulo, um singleton, só log.** `logger.service.ts` reescrito. Sem
   `saveDiagnostic`: diagnóstico é do `DiagnosticsService` (`OBS-003`). Sem
   `getLogPath()`: não tem chamador.
2. **Artesanal.** Nenhuma biblioteca de log está instalada. `electron-log`
   daria rotação (um arquivo morto, não N) e traria transporte para o renderer
   e canal IPC próprio, o oposto da regra 4 do `CLAUDE.md`. Redação, caminho
   preguiçoso, `clear()` que rejeita e `flush()` no quit seriam código nosso de
   qualquer jeito. Regra 7: sem dependência nova para 40 linhas de rotação.
3. **`no-console` como erro, por catraca de arquivos.** É o que torna "um
   logger" verificável: a regra pega também `console.log = ...` (o monkeypatch)
   e `const x = console.log`. Neste ticket a regra entra na zona de fronteira
   que já existe no `eslint.config.js` (`main.ts`, `ipc/**`, `security/**`)
   mais `persistence`, `cache` e `updater`; `OBS-004` acrescenta os quatro do
   pipeline; `OBS-005` colapsa tudo em `electron/**` exceto o próprio
   `logger.service.ts`. O renderer (`src/`) fica de fora: levar log do
   renderer ao disco exige canal IPC novo e é outro ticket se um dia fizer
   falta.
4. **Escopo é API, não prefixo.** `logger.scope('HttpScraper')` devolve
   `{ info, warn, error }` que carimba `[HttpScraper]`. O scraper troca
   `this.log(msg)` por `this.log.info(msg)`.
5. **Redação em duas camadas.** (a) `redact(text)` por padrão, em **todos os
   modos**: senha, cookie, `Authorization`, `ViewState`, `jsfcljs(...)`, HTML,
   caminho absoluto, teto de 4 KiB por linha. (b) por chave do `meta`: chaves
   de segredo em todos os modos; chaves de conteúdo (nome, título, caminho,
   usuário) só em produção. `Error` vira `{ name, message, code }` — nunca o
   objeto inteiro (releitura, item 4); `stack` só em dev, passando por
   `redact()`. Em dev, conteúdo **pode** passar: o modo dev só existe rodando
   do código-fonte, na máquina de quem desenvolve, sobre a conta dele mesmo;
   não há dado de terceiro, e sem o nome da disciplina o log de dev não serve
   para depurar o scraper. Sem impacto de LGPD no build distribuído, que
   redige tudo.
6. **Nome e caminho não são redigíveis por regex.** A camada (b) só funciona
   se o dado for `meta`, não interpolado na mensagem. Regra para os call sites:
   mensagem é literal; id, contagem, código de erro e duração podem ir na
   mensagem; nome de disciplina/arquivo/notícia, caminho, usuário e HTML vão
   em `meta` ou não vão. O teste de fronteira exercita os serviços de verdade
   para pegar interpolação.
7. **Rotação:** 1 MiB × 5 arquivos, `app.log` é o atual, em `userData/logs/`.
   `userData/logs/` e não `app.getPath('logs')`: acompanha o `setPath` de dev
   do `DEV-002`, é o que o `clear-all` conhece, e `userData` existe nos três
   SOs — só no macOS `app.getPath('logs')` apontaria para outro lugar, e não
   há build macOS. Depois da redação e do fim do eco duplicado, 5 MiB cobre
   semanas de uso.
8. **Buffer é o `WriteStream`.** Sem fila própria: `fs.createWriteStream` em
   append, contagem de bytes para decidir a rotação. `flush()` resolve quando
   tudo está no disco e nunca rejeita. `main.ts` faz `await logger.flush()`
   dentro do `before-quit` existente. `error` não força disco na hora: o
   `before-quit` cobre o quit normal, e crash de main é raro o bastante para
   não valer dois caminhos de escrita.
9. **Falha do sink:** `info/warn/error` nunca lançam; a falha é avisada **uma
   vez** via `console.error` (o único `console` permitido) e o sink fica
   desligado até `clear()`. Nunca chamar o próprio logger para reportar a
   falha do logger.
10. **`clear()`**: `flush`, fecha, apaga `logs/`, reabre preguiçosamente no
    próximo write. Propaga falha (DATA-002: o handler precisa saber): rejeita
    com o erro original da exclusão, não resolve. Apaga com `fs.promises`
    (`rm`/`unlink`/`rmdir`); o teste de falha injeta a rejeição nesses três, e
    `rmSync` não é interceptável no Vitest 4 (namespace ESM). `resetAppLog` e
    `sigaa-me.log` somem aqui. `SigaaService.clearDiagnostics`,
    `HttpScraperService.resetLog` e `scraper.log` somem em `OBS-004`; até lá o
    handler continua chamando `clearDiagnostics`. O loop de `debug_*` do
    handler **fica** até `OBS-003`.
11. **Caminho preguiçoso por injeção.** `userDataPath()` e `production()` são
    funções passadas ao construtor, lidas no primeiro write. Corrige a
    releitura, item 5. Diferente do padrão `private get dir()` de `cache`,
    `persistence` e `diagnostics`, de propósito: rotação e o bug de ordenação
    do DATA-002 não se reproduzem com `fs` mockado, e o teste precisa de disco
    real numa pasta temporária e de trocar produção/dev no mesmo processo.
    `maxFileBytes`/`maxFiles` opcionais existem pelo mesmo motivo: testar
    rotação sem gravar 5 MiB.
12. **Eco no console só em dev** (`!production()`). Em produção nada vai para
    o console: não há quem leia o console do main, e o eco é o que hoje faz
    cada linha existir em dois arquivos.
13. **Logout não toca em log.** Log é do app, não da conta, e em produção não
    carrega conteúdo da conta. A expectativa é que o usuário nunca faça
    logout. Documentado no `ARCHITECTURE.md`. Nota de futuro, sem ticket: um
    hook "encontrou um bug?" que incentive o usuário a mandar o log.
14. **Sem `[op:<id>]` neste ticket.** O formato reserva o campo; `OBS-002` o
    preenche.
15. **Assinatura de transição (expand).** `info(message, ...args: unknown[])`
    em vez de `meta?`, para as 73 chamadas ao logger antigo em `sigaa` (49) e
    `playwright-login` (24) compilarem sem que este ticket toque nesses
    arquivos. Cada `arg`: `Error` → `{ name, message, code }`; objeto plano →
    camada (b); primitivo → `String()` e `redact()`. Chamada nova neste ticket
    passa **um** objeto `meta` ou nada. `OBS-005` estreita para
    `meta?: LogMeta` e o typecheck acha qualquer vararg que sobrou: o tipo é a
    catraca do contract.

## Contrato

Os testes importam exatamente estes nomes.

```ts
// electron/services/logger.service.ts
export type LogLevel = 'info' | 'warn' | 'error';
export type LogMeta = Record<string, unknown>;

// Transição (decisão 15). OBS-005 troca `...args: unknown[]` por `meta?: LogMeta`.
export interface ScopedLogger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

export interface LoggerOptions {
    /** Raiz do `userData`. Lida no primeiro write, nunca no construtor. */
    userDataPath: () => string;
    /** `app.isPackaged`. Decide redação de conteúdo, `stack` e eco no console. */
    production: () => boolean;
    maxFileBytes?: number;    // default 1 MiB
    maxFiles?: number;        // default 5
}

export class LoggerService implements ScopedLogger {
    constructor(options: LoggerOptions);
    scope(component: string): ScopedLogger;
    info(message: string, ...args: unknown[]): void;   // escopo 'main'
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    /** Resolve com tudo no disco. Nunca rejeita. */
    flush(): Promise<void>;
    /** flush + fecha + apaga `logs/` via `fs.promises` + reabre no próximo write. Rejeita com o erro da exclusão. */
    clear(): Promise<void>;
}

/** Camada (a). Pura. Ver "Redação". */
export function redact(text: string): string;

export const logger: LoggerService; // { userDataPath: () => app.getPath('userData'), production: () => app.isPackaged }
```

```ts
// electron/ipc/register-handlers.ts — IpcDeps
logger: Pick<LoggerService, 'clear'>;   // continua
// removido: resetAppLog
// sigaaService.clearDiagnostics continua até OBS-004
// userDataPath continua (mensagem de erro e o loop de debug_* até OBS-003)
```

Arquivos: `<userData>/logs/app.log`, rotacionados `app.1.log` …
`app.<maxFiles-1>.log` (`app.1.log` é o mais recente dos antigos).

## Formato da linha

```text
<ISO-8601> <LEVEL> [<scope>] <message> <meta em JSON, se houver>
```

Os testes fazem asserção em `[<scope>]` e no conteúdo; a ordem dos outros
campos é livre. `OBS-002` acrescenta `[op:<id>]` depois de `[<scope>]`.

Escopos que os testes de `OBS-004` exigem, por componente: `HttpScraper`
(`http-scraper.service.ts`), `Sigaa` (`sigaa.service.ts`), `Download`
(`download.service.ts`), `BackgroundSync` (`background-sync.service.ts`). Os
demais componentes escolhem o próprio nome; os deste ticket usam `main`,
`Ipc`, `Persistence`, `Cache`, `NavigationPolicy`, `Updater`.

## Redação

Camada (a), `redact(text)`, sempre. Marcadores: `[redacted]`, `[path]`,
`[jsf]`, `[html omitted]` (sem `<>`: HTML é detectado por `<`).

| Alvo | Padrão | Exemplo → resultado |
|---|---|---|
| Senha | `password\|senha\|passwd\|pwd` seguido de `=`/`:` (com ou sem aspas) | `senha=abc` → `senha=[redacted]` |
| Cookie | valor de `Cookie:`/`Set-Cookie:` inteiro; qualquer `<nome contendo SESSION>=<valor>` | `JSESSIONID=A.srv1; x=1` → `JSESSIONID=[redacted]` |
| Header de auth | `Authorization` seguido de `=`/`:` | `Authorization: Bearer t` → `Authorization: [redacted]` |
| ViewState | `javax.faces.ViewState` seguido de `=`/`:` | valor → `[redacted]` |
| Script JSF | `jsfcljs(` até o `)` que fecha | → `[jsf]` |
| HTML | do primeiro `<` seguido de `!` ou letra até o fim | → `[html omitted]` |
| Caminho | Windows (`X:\...`, `\\server\...`) e POSIX sob `/home /Users /tmp /var /root /opt /mnt` | → `[path]` |
| Teto | linha > 4096 chars | cortada, com marcador |

Risco aceito da heurística de HTML: uma mensagem literal com `<` seguido de
letra é cortada. A mensagem é literal escrita por nós; não se escreve `<` nela.

Camada (b), por chave do `meta`, recursiva (profundidade ≤ 4), comparação sem
caixa no nome inteiro da chave:

- **Sempre:** `password senha passwd pwd cookie cookies header headers
  authorization viewstate token`.
- **Só em produção:** `name username user fileName filename courseName title
  path filePath basePath dir html body script onclick href url`.
- `Error` (qualquer modo) → `{ name, message: redact(message), code }`; em dev
  também `stack: redact(stack)`.
- Objeto não-`Error` → JSON com as chaves acima trocadas por `[redacted]`,
  depois `redact()` sobre a linha inteira.

O que **não** é redigido, em nenhum modo: id de disciplina/arquivo/notícia,
contagens, códigos `AppErrorCode`, status HTTP, duração, nome de componente.

## Critérios de aceite (detalhados)

Os cinco do cabeçalho valem; assim são medidos. Os achados 1, 3, 4 e 5 da
auditoria cega de 2026-09-07 (abaixo) estão embutidos.

1. **Segredo e conteúdo acadêmico fora do log de produção.**
   `tests/unit/logger-redaction.test.ts`: camadas (a) e (b), um `AxiosError`
   real com `config.headers.Cookie` passado como `arg` (o cookie não chega ao
   arquivo, `{ name, message, code }` chega), a assinatura de transição com
   primitivo, objeto e `Error`, e o modo dev (conteúdo passa, `stack`
   presente). A prova nos **serviços reais** (`getCourseFiles`, falha de rede,
   `downloadFile`, plano B, `syncNow`) é `OBS-004`.
2. **Crescimento limitado.** ≤ `maxFiles` arquivos em `logs/`, soma ≤
   `maxFiles × maxFileBytes` mais uma linha de folga por arquivo; a linha mais
   nova está em `app.log`. Linha ≤ 4 KiB.
3. **Clear-all apaga o log e reporta falha.** `logger.clear()` apaga `logs/`,
   inclusive o que ainda estava no buffer (DATA-002), e o logger continua
   utilizável. Com a exclusão rejeitando (`EPERM` injetado em
   `fs.promises.rm/unlink/rmdir`), `clear()` rejeita com essa mensagem e
   `app.log` continua no disco — nunca resolve com o log intacto. Esse caso
   vive em `logger-redaction.test.ts`, **no serviço real** (era o caso de
   `log-reset.test.ts`, que morre); a agregação da rejeição no handler fica em
   `clear-all-data.test.ts`, que também prova que o handler não apaga caminho
   de log por conta própria.
4. **Falha do logger não recorre.** Sink impossível (`userDataPath` aponta
   para um arquivo): 20 writes não lançam, `flush()` resolve, `console.error`
   é chamado no máximo uma vez.
5. **Um logger.** `npm run lint` verde com `no-console: error` na zona de
   fronteira mais `persistence`, `cache` e `updater`. O monkeypatch do
   `main.ts`, `logsDir`, `resetAppLog`, `sigaa-me.log` e `getLogPath` não
   existem mais. (`scraper.log`, `resetLog` e `clearDiagnostics`: `OBS-004`.)
6. **Preguiça.** `app.getPath` não é chamado no import do módulo; é chamado
   no primeiro write.
7. **Produção não ecoa no console.** Nenhum `console.*` chamado por um write
   com `production() === true`.
8. **Quit.** `before-quit` aguarda `logger.flush()` (prova por leitura na
   revisão; o `before-quit` não é testável em vitest).

## Testes que a etapa 2 escreve (commit próprio, vermelhos)

Um `beforeEach` em cada arquivo novo faz asserção sobre a existência dos
membros do contrato, **não** um `beforeAll`: um `beforeAll` que falha marca a
suíte inteira como skipped e nenhum caso aparece falhando por conta própria
(auditoria cega, achado 1). Com `beforeEach`, cada `it` falha por asserção
nomeando o membro ausente; depois, cada teste falha ou passa pelo próprio
comportamento.

Novos:

- `tests/unit/logger-redaction.test.ts` — `redact()`, camadas de `meta`,
  assinatura de transição (primitivo, objeto, `Error`, `AxiosError` com
  cookie), modo dev (conteúdo passa, `stack` presente), rotação, `flush`,
  `clear` (sucesso e `EPERM`), falha do sink, preguiça do singleton, eco só em
  dev. `fs` real em pasta temporária.

Editados, e por quê:

- `eslint.config.js` — `no-console: error` na zona de fronteira e nos três
  arquivos de serviço deste ticket.
- `tests/integration/clear-all-data.test.ts` — `IpcDeps` sem `resetAppLog`;
  `logger.clear` assíncrono; o handler não apaga caminho de log por conta
  própria.
- `tests/unit/log-reset.test.ts` — apagado; os dois comportamentos (buffer não
  sobrevive ao clear; falha de clear propaga **no serviço real**) estão em
  `logger-redaction.test.ts`.
- Testes que faziam asserção em `console.error` passam a fazer em
  `logger.error` do mock: `navigation-policy`, `updater-consent`,
  `cache-service`, `persistence-auth-recovery`.
- `ipc-validation` ganha mock de `logger` para não escrever
  `test-userdata/logs/` de verdade.

Os mocks de `logger` dos testes de serviço **não** mudam aqui: os serviços
ainda chamam `logger.info(...)` no formato antigo, e a assinatura de transição
o aceita. `scope()` entra nos mocks em `OBS-004`/`OBS-005`, quando cada
serviço passa a usá-lo.

## Para o revisor (o que os testes não cobrem)

- `main.ts`: patch de `console` removido; `resetAppLog` e `logsDir` removidos;
  `before-quit` aguarda `logger.flush()`; deps do `registerIpcHandlers` sem
  `resetAppLog`. `updater` usa `logger.scope('Updater')`.
- Grep no diff por interpolação de conteúdo em chamada de log:
  `\$\{[^}]*(\.name|\.title|fileName|courseName|basePath|filePath|Path\b)` dentro
  de `logger.*(`. Deve dar zero nos arquivos deste ticket.
- Chamada nova ao logger passa um objeto `meta` ou nada; vararg posicional só
  nos arquivos que este ticket não toca.
- Nenhum `try/catch` novo que só chame `logger.error` (regra 3).
- `http-scraper`, `sigaa`, `download`, `background-sync` e `playwright-login`
  ficam **intocados** (`OBS-004`, `OBS-005`).

## Fora de escopo, com ticket

- `OBS-004` — pipeline de scraping (`http-scraper`, `sigaa`, `download`,
  `background-sync`) migra para o logger; `scraper.log`, `resetLog` e
  `clearDiagnostics` somem; teste de fronteira nos serviços reais.
- `OBS-005` — `playwright-login` migra; contract: assinatura `meta?` e
  `no-console: error` em `electron/**`.
- `OBS-003` — dumps de HTML cru via `DiagnosticsService`, `diagnosticsService.clear()`
  no clear-all, limpeza de legado (`sigaa-me.log`, `scraper.log`, `debug_*`,
  `logs/app_*.log`) a cada boot.
- `OBS-002` — `[op:<id>]` via `AsyncLocalStorage` no coordenador.

## Histórico

- 2026-09-07: spec de Fable + 46 testes de Astra na branch `obs-001-logging`
  (`da8cc8f`, `3709e58`), como controle do `PROC-002`. Auditoria cega (Astra)
  achou 6 pontos, todos confirmados: (1) `beforeAll` escondia os casos novos
  como skipped; (2) teste de traversal contradizia `sanitizeSegment`; (3) o
  teste de falha real de `clear()` foi apagado junto com `log-reset.test.ts`;
  (4) plano B do download ativo e sem prova de redação; (5) ciclo de
  background nunca chegava ao log do título; (6) `filter(Boolean)` aceitava
  linha sem op id. Correções entraram no spec e nos testes da branch.
- 2026-09-08: fluxo por ticket substituiu o `PTMR`; `PORTAL-003` criou o
  `DiagnosticsService`. Grilling novo (Fable + Bruno): spec da branch vira
  insumo, testes da branch são descartados (a etapa 2 escreve os dela), os 6
  achados viram critérios de aceite, ticket fatiado em `OBS-001`/`OBS-003`/
  `OBS-002`. A branch `obs-001-logging` pode ser apagada depois que
  `OBS-001` fechar.
- 2026-09-08, segunda rodada (`/to-spec` + `/to-tickets` sobre o grilling):
  spec inalterado; o fatiamento mudou. ~275 call sites em 11 arquivos é wide
  refactor, e a etapa 2 devolveria o ticket. Virou expand (`OBS-001`) →
  migrate (`OBS-004`, `OBS-005`) → contract (dentro de `OBS-005`), com a
  assinatura de transição da decisão 15. `OBS-003` passa a depender de
  `OBS-005`; `OBS-002`, de `OBS-004`.

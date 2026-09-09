# OBS-001 — Redact, rotate, and scope the logger
Status: resolved
Priority: P2
Blocked by: DL-002 (fechada em 2026-09-07)
Tracker status at migration: `NOT STARTED`

**Escopo reduzido em 2026-09-09**, de "centralizar todo o logging" para "o seam
do `LoggerService`". O resto virou `CLEAN-003` (funil do `console.*`),
`CLEAN-004` (apagar o `scraper.log`) e ficou com o `PORTAL-003` (dumps
`debug_*`). Ver `## Comments`.

- Owner: —
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files:
  - `electron/services/logger.service.ts`
  - `tests/unit/logger-redaction.test.ts`

#### Required behavior

- Redigir, em `LoggerService`, senha, cookie, header, username, caminho
  absoluto, HTML cru, script JSF, nome de disciplina e nome de arquivo.
- Rotacionar por tamanho, com retenção finita.
- Expor escopo por componente e operation ID.
- `clear()` remove o log atual e os rotacionados.
- Falha de escrita não recursa no próprio logger.

#### Acceptance criteria

- Uma linha escrita pelo `LoggerService` não contém segredo nem conteúdo
  acadêmico.
- `sigaa-me.log` não cresce sem limite.
- `clear()` remove as três gerações do arquivo.
- Falha persistente de escrita não recursa.

Fora daqui: "segredo não aparece em log de produção" **no app inteiro** depende
do `CLEAN-003` — hoje 200 das 201 chamadas de log do `electron/` não passam por
este arquivo.

#### Verification

```text
npm run test:unit -- logger-redaction
```

#### Implementation notes

- Commit: `cdbaec5` (testes), `ab8372e` (implementação).
- Rotation policy: 1 MiB por arquivo, 2 rotações (`sigaa-me.log.1`, `.2`),
  `clear()` remove as três.
- Redaction policy: chave sensível (password/senha/pass, cookie(s), token,
  authorization/auth/header(s), username/user/email/matricula, path/filepath/
  dirpath, courseName, fileName, script, viewState — normalizada e comparada
  sem distinguir maiúscula) vira `[REDACTED]` inteira em argumentos
  estruturados; string livre passa por regex para cookie/Authorization/Bearer,
  ViewState/`j_id`, caminho absoluto Windows/Unix e blob de HTML cru.
- "Buffer writes" saiu do escopo: `appendFileSync` por linha basta neste volume,
  e buffer sem flush no crash perde justamente a linha que interessa. Reabrir se
  alguém medir o custo.

## Comments

- 2026-09-09: ticket dividido na prática pela etapa 2 — só o `logger.service.ts`
  foi tocado, com a justificativa de que o resto era "migração mecânica de ~180
  call sites em 6+ arquivos, sem seam próprio para testar".

- 2026-09-09 (correção): a contagem está certa (201 chamadas `console.*` no
  `electron/`), a conclusão não. Existem dois seams, cada um em **um** arquivo:

  1. `main.ts:55-68` já monkeypatcha `console.log/error/warn`. Apontar os três
     wrappers para o `logger` redige e rotaciona as 201 chamadas de uma vez, sem
     tocar em nenhuma. → `CLEAN-003`.
  2. `http-scraper.service.ts:74-83` já chama `console.log` antes de escrever no
     `scraper.log`. Depois do (1), o `scraper.log` é duplicata pura: apagar o
     stream é remoção, não migração. → `CLEAN-004`.

  A migração call-site a call-site nunca precisou existir.

  Consequência para o status: os critérios "segredo não aparece em log de
  produção" e "crescimento limitado" **não estão cumpridos no app** — o destino
  redigido tem 1 chamador, e `logs/app_*.log` continua ilimitado e sem redação
  recebendo os outros 200. Foi por isso que o escopo deste ticket foi reescrito
  em vez de marcado como resolvido: o corte original ficava do lado errado do
  vazamento.

- 2026-09-09: `diagnostics.service.ts` saiu daqui. Os dumps `debug_*` do
  `playwright-login.service.ts` (8 pontos de `writeFileSync`) são o objeto do
  `PORTAL-003`, que já lista consentimento, retenção e clear-all para eles.

#### Resolution (2026-09-09)

- Decisão: o ticket fecha no escopo corrigido — o seam do `LoggerService`, não
  o logging do app. Os cinco itens de "Required behavior" estão implementados e
  cada um tem um teste que falha sem a implementação. Os critérios de nível de
  app ("segredo não aparece em log de produção", "crescimento limitado") são do
  `CLEAN-003` por decisão registrada em `## Comments`, e não são creditados
  aqui.
- Arquivos: `electron/services/logger.service.ts`,
  `tests/unit/logger-redaction.test.ts` (commits `cdbaec5` testes, `ab8372e`
  implementação — a implementação não tocou `tests/`, confirmado por
  `git show --stat`).
- Prova de vermelho-verde, refeita na revisão sem confiar no relatório: com
  `git checkout master -- electron/services/logger.service.ts` a suíte nem
  coleta (o singleton de módulo do master chama `app.getPath` no import e morre
  com ENOENT) — vermelho verdadeiro, mas cego. Refeita com uma variante do
  master com **só** o caminho preguiçoso: 5 de 9 falham pelo motivo certo —
  redação de chave estruturada (`segredo123` no arquivo), redação em objeto
  aninhado (`lista1.pdf`), redação em string livre (`JSESSIONID=xyz`), rotação
  (`4236000` bytes contra o limite de `1048576`) e prefixo de escopo
  (`[http-scraper:op-42]` ausente). O sexto critério, `clear()` das rotações,
  passa vacuamente nessa variante porque sem rotação não há irmão para apagar;
  provado por mutação sobre a branch — removido o laço `fs.rmSync` de `clear()`,
  o teste falha (`[ 'sigaa-me.log', …(2) ]` contra `[ 'sigaa-me.log' ]`).
  Restaurado, 9/9 verdes.
- Gate: `npm run quality` verde no Windows. `tsc --noEmit` limpo; `eslint .`
  0 erros, 63 warnings (`no-explicit-any` legado — caiu de 67 no `DEV-002`,
  os `any[]` do logger viraram `unknown[]`); `vitest run` 46 arquivos,
  **537 passed | 4 skipped (541)**.
- Ambiente, não é falha do projeto: o gate abortou na primeira execução com
  `TS2307: Cannot find module 'dompurify'`. O pacote está no `package.json` e no
  lock desde o `SEC-001`, mas faltava no `node_modules` local. `npm install`
  ("added 2 packages") resolveu sem sujar o lock.

## Revisão (Opus)

**Zero achados bloqueantes.** Aprovado. Três achados de classe C, nenhum toca
código desta branch.

#### Escopo, conferido contra o escopo corrigido

Os cinco itens de "Required behavior" batem um a um com o arquivo: redação por
chave (`SENSITIVE_KEYS`, normalizada por `normalizeKey`) e por padrão em string
livre (`STRING_PATTERNS`: cookie, Authorization, Bearer, ViewState/`j_id`,
caminho Windows e Unix, blob de HTML); rotação em 1 MiB com 2 gerações;
`scope(component, operationId)`; `clear()` apagando as três gerações; e o
`catch` de `write()` que cai em `console.error` em vez de `this.error`. Nada
fora disso foi tocado — o `diff --stat` da branch é 2 arquivos de código, e o
commit de implementação não entra em `tests/`.

A resolução preguiçosa do caminho **não** é creep: o `DEV-002` a delegou
explicitamente a este ticket ("`logger.service.ts:10` has the same defect;
OBS-001 owns it").

#### O re-split, verificado nos arquivos e não no documento

O `CLEAN-003` e o `CLEAN-004` são parte do que esta revisão precisa validar,
porque foi o re-split que autorizou o fechamento reduzido. Ambas as premissas
se confirmam na fonte:

- `main.ts:27-88` é o bloco do segundo destino, e os três wrappers
  (`main.ts:55-68`) fecham sobre `logStream`. Apontá-los para o `logger` cobre
  todas as chamadas `console.*` do `electron/` sem tocar em nenhuma — é um seam
  de um arquivo, como o `CLEAN-003` afirma.
- `http-scraper.service.ts` chama `console.log` antes de escrever no
  `scraper.log`, então depois do `CLEAN-003` o arquivo é duplicata — remoção,
  não migração, como o `CLEAN-004` afirma.

#### Achado C-1 — a contagem de chamadas `console.*`

O `## Comments` e o `CLEAN-003` dizem "201 chamadas `console.*` no `electron/`".
Medido hoje: **195** com
`grep -rn "console\.(log|error|warn|info|debug)(" electron/ --include=*.ts`
(203 se a busca for por `console.` cru, que conta os
`originalConsoleLog`/`Error`/`Warn` e as reatribuições do `main.ts`). A
conclusão do re-split não depende do número, mas o `CLEAN-003` repete o 201
como estado atual; corrigir lá é do dono daquele ticket, não desta revisão.

#### Achado C-2 — `Error` em argumento estruturado vira `{}`

`redact()` devolve `{}` para uma instância de `Error` (`message` e `stack` são
não-enumeráveis), e `JSON.stringify` sela isso. Os seis call sites do formato
`logger.error('SIGAA: Login error', error)` gravam a mensagem seguida de `{}`.
**Não é regressão** — o `master` fazia `JSON.stringify(a)` no mesmo lugar, com o
mesmo resultado — e não é critério de aceite daqui, por isso não foi corrigido
nesta revisão. Tem casa natural no `CLEAN-003`: o `formatLog` do `main.ts:47-53`
tem o defeito idêntico (`JSON.stringify(arg, null, 2)`) e vai ser apagado lá.

#### Achado C-3 — o `console.error` do `catch` só é seguro enquanto o console não for funilado

A garantia de não-recursão de hoje depende de `console.error` **não** passar
pelo logger. O `CLEAN-003` já nomeia a armadilha e a troca por
`process.stderr.write`, e reserva para si a única edição autorizada no teste
existente. Registrado aqui só para que o vínculo não se perca se o `CLEAN-003`
for repriorizado: se aquele ticket for feito sem essa troca, este critério de
aceite cai.

#### O que continua não coberto

`scope()` não tem chamador de produção — o primeiro será o `CLEAN-004`. Não é
abstração especulativa (é item explícito de "Required behavior"), mas até lá
só os testes o exercitam.

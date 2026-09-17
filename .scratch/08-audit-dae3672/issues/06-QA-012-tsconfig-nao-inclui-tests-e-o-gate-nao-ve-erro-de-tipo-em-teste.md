# QA-012: `tsconfig.json` não inclui `tests/`, e o gate não vê erro de tipo em arquivo de teste
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `tsconfig.json` (o `include` da última linha)
  - os 19 arquivos sob `tests/` listados abaixo

Observação deixada na revisão do `QA-011` (2026-09-16), medida em 2026-09-17.

#### What to build

`tsconfig.json` termina com:

    "include": ["src", "electron", "shared"]

`tests` está fora. `npm run typecheck` é `tsc --noEmit`, então **nenhum** erro de
tipo em arquivo de teste chega ao gate. Foi assim que a chamada de 5 argumentos
numa função de 6 sobreviveu no `logging-boundary.test.ts` até o `QA-011` — todo
parâmetro era `string`, o vitest não reclama de aridade, e o `tsc` não olhava.
O `QA-011` corrigiu aquele arquivo; o buraco que o deixou passar continua aberto.

Correção: acrescentar `"tests"` ao `include` e zerar o que aparecer. Medido em
2026-09-17 com um `tsconfig` de sonda: **78 erros em 19 arquivos**.

    27  tests/integration/clear-all-data.test.ts
     8  tests/unit/merge-courses-cache.test.ts
     8  tests/unit/dashboard-listener.test.ts
     4  tests/unit/updater-consent.test.ts
     4  tests/unit/preload-dev-gate.test.ts
     4  tests/integration/audit-download-disk.test.ts
     3  tests/unit/logger-redaction.test.ts
     3  tests/unit/ipc-validation.test.ts
     3  tests/unit/course-detail-a11y.test.ts
     2  tests/unit/sigaa-service.test.ts
     2  tests/unit/cache-service.test.ts
     2  tests/integration/portal-adapter.test.ts
     2  tests/integration/download-real.test.ts
     1  cada em html-sanitizer, download-path-security, logging-boundary,
        dev-cache-mutation-boundary, audit-background-sync-downloads,
        account-isolation

Por código: 26 `TS18046` (`unknown`), 12 `TS2353`, 9 `TS2339`, 7 `TS6133`,
6 `TS2345`, 5 `TS2722`, 4 `TS2739`, 3 `TS2769`, 3 `TS2322`, 2 `TS2683`,
1 `TS2493`.

A maioria é tipagem de mock frouxa. Dois grupos não são:

- `TS6133` em `sigaa-service.test.ts:481` e `:493` — `const result = await
  service.downloadAllFiles(...)` e `result` nunca é lido. O teste afirma sobre
  os mocks e joga fora o retorno.
- `TS2722` em `updater-consent.test.ts:119,130,144,161` — `handler(...)` onde
  `getHandler` devolve `| undefined`. No caso de `:119` existe um
  `expect(handler).toBeDefined()` antes, que não estreita para o TS; no de
  `:130` não existe nem isso, e um `getHandler` que devolvesse `undefined`
  quebraria com `TypeError` em vez de falhar no critério.

**Como não corrigir:** `as any`, `@ts-expect-error` ou `// eslint-disable` para
calar erro. Silenciar devolve o buraco fechado e some com os dois achados
acima. Onde o mock é genuinamente parcial, tipar o objeto do mock (ou uma
factory de fixture tipada no próprio arquivo) é o caminho. `as any` pontual só
onde a alternativa for reescrever a lógica do teste — e nesse caso, uma linha
no relatório dizendo onde e por quê.

**Escopo:** um ticket só, não vários. O gate não fica verde enquanto houver um
erro: flipar o `include` e parar no meio deixa `npm run typecheck` vermelho e
nada commitável. Os 78 entram juntos ou não entram.

Fora do escopo: mudar regra do ESLint, mexer em `tsconfig` fora do `include`,
e corrigir a lógica de qualquer teste além do necessário para tipar. Um teste
que revele bug de produção ao ser tipado vira ticket próprio, não conserto aqui.

#### Acceptance criteria

1. `tsconfig.json` inclui `tests` e `npx tsc --noEmit` sai limpo, 0 erros.
2. `npx vitest run` continua em 71 arquivos, 800 passed | 5 skipped — nenhum
   teste apagado, pulado ou afrouxado para calar o `tsc`.
3. Nenhum `as any`, `@ts-expect-error` ou `@ts-ignore` novo em `tests/` além do
   que for justificado por escrito no relatório, com arquivo e motivo.
4. `sigaa-service.test.ts:481,493`: o `result` descartado vira asserção sobre o
   retorno de `downloadAllFiles`, não uma variável apagada. O que o teste já
   afirma sobre os mocks continua.
5. `updater-consent.test.ts`: os quatro `handler(...)` deixam de invocar valor
   possivelmente `undefined`, e cada caso falha com mensagem de asserção — não
   com `TypeError` — se o handler não existir.
6. `npm run quality` verde, `--max-warnings 40` intacto.

#### Verification

    npx tsc --noEmit
    npm run quality

## Tests stage 2 writes (own commit, red)

Ticket de configuração: o vermelho é o próprio `tsc`, não um caso de vitest
novo. O commit de teste é o `include` do `tsconfig.json` sozinho — depois dele
`npx tsc --noEmit` lista os 78 erros, e o commit seguinte os zera. Essa ordem
é o que prova que o gate passou a enxergar `tests/`.

Exceção, teste de verdade: os critérios 4 e 5 são mudança de comportamento de
teste e devem ser verificáveis sem o `tsc`. Para o 5, um caso em
`updater-consent.test.ts` onde `getHandler` não acha o handler e a expectativa
é a falha de asserção.

#### Resolution (2026-09-17)

**Verdict: Approve.** PR [#43](https://github.com/Laginho/SIGAA-ME/pull/43),
merge `a69c15f`. Os seis critérios passam.

Três commits:

- `25f0c05` — só `"tests"` no `include` do `tsconfig.json`. O vermelho: 78 erros
  em 19 arquivos, exatamente a contagem que a sonda do ticket previu.
- `9c155fa` — zera os 78 tipando contra o domínio real, não silenciando:
  narrowing de `AppResult` antes de ler `.filePath`/`.error`
  (`audit-download-disk`, `download-real`, e o helper `invoke<T>` do
  `clear-all-data`); mocks completados para `CourseSnapshot`,
  `NotificationItem`, `BackgroundSyncUpdate`, `AppSettings`,
  `CompatibilityStatus` e `IpcDeps`; `this: Storage` nos dois
  `mockImplementation` que leem `this`; `vi.fn()` com tipos de parâmetro reais
  onde `.mock.calls` é lido; imports e consts mortos removidos.
- `26d9cdd` — correção da revisão, abaixo.

**Critério 4:** `sigaa-service.test.ts:481,493` ganharam
`expect(result.success).toBe(true)`; o que os testes já afirmavam sobre os mocks
continua. **Critério 5:** `assertHandler` (`asserts handler is T`) estreita os
quatro `handler(...)` e falha com mensagem nomeando o evento; um teste novo prova
que o erro é `Error`, nunca `TypeError`.

**Critério 3 — os casts que entraram, e por quê:**

- `cache-service.test.ts` ×2, `as unknown as { id: string }[]`: os testes
  alimentam de propósito ids que a constraint genérica proíbe, para provar o
  guard de runtime que só existe porque JS não checa tipo. Sem o cast o teste
  não pode ser escrito.
- `logger-redaction.test.ts` ×3, `as unknown as LogMeta`: o tipo é que está
  estreito, não o teste — `sanitizeMeta` tem `if (value instanceof Error)` como
  primeiro branch (`electron/services/logger.service.ts:109`), então `Error`
  como `meta` é suportado em runtime; `LogMeta = Record<string, unknown>` não
  diz isso. Alargar é código de produção, fora das Primary files.
- `ipc-validation.test.ts` ×1, `as unknown as BrowserWindow` no `getWindow`
  falso: a mesma saída que `clear-all-data.test.ts` já usa. Substituiu dois
  `as never`.

**Correção aplicada na revisão (`26d9cdd`).** `ipc-validation.test.ts` era o
único arquivo onde a premissa do ticket não valia: `let deps: any`
(pré-existente) mais dois `registerIpcHandlers(makeDeps(...) as never)` deixavam
a forma do mock sem checagem nenhuma — no arquivo que guarda o contrato IPC.
Trocado por `const base = { ... } satisfies IpcDeps`, que checa sem alargar os
tipos de mock que os 18 `expect(deps.x.y)` leem; os dois `as never` saíram.
Vermelho-verde: apagar `cache: { clear: vi.fn() }` do mock quebra o `tsc` com
TS1360 no `satisfies` e TS2345 nos dois call sites; antes do commit, silêncio.

**Gate** (Windows, `npm run quality`): `tsc` limpo; eslint 0 erros / 40 warnings
com `--max-warnings 40` intacto; 71 arquivos, 801 passed | 5 skipped — a baseline
de 800 mais o teste novo do critério 5. CI do PR: os três jobs verdes.

## Comments

- Follow-ups para a etapa 1, deliberadamente não abertos pelo revisor:
  - `LogMeta` (`electron/services/logger.service.ts:7`) é estreito demais.
    `sanitizeMeta` trata `Error` no topo do `meta`, o tipo não permite. Alargar
    para `Record<string, unknown> | Error` apaga os três casts do
    `logger-redaction.test.ts`.
  - `let deps: any` em `ipc-validation.test.ts:281` continua. O `satisfies`
    cobre a forma do mock; tirar o `any` da variável exige tipar as 18 leituras
    `deps.x.y.mock*`.
  - `IncomingCourse` (`src/utils/ui-helpers.ts:69`) só declara `id`/`news`, e é
    por isso que `merge-courses-cache.test.ts` precisou de uma factory e
    `account-isolation.test.ts` de um `const` intermediário — literal fresco bate
    em excess-property check, variável não. Funciona, mas é contorno: o tipo não
    descreve o que os chamadores de produção passam.

- Achado do revisor do `QA-011`, que deliberadamente não abriu o ticket: "o
  root cause é que o `tsconfig.json` não inclui `tests/` (...) Abrir o
  follow-up é trabalho da etapa 1, não do revisor."
- Alternativa considerada e descartada: `tsconfig.tests.json` separado com uma
  segunda chamada de `tsc` no script `typecheck`. Dois arquivos de config e uma
  string de script mais longa para o mesmo resultado que uma palavra no
  `include` — só valeria se `tests/` precisasse de `compilerOptions` diferente,
  e a sonda mostrou que não precisa.

- Follow-ups triados em 2026-09-17: `IncomingCourse` e `let deps: any` viraram
  o `CLEAN-012` (um ticket, dois itens). `LogMeta` avaliado e recusado —
  nenhum chamador de produção passa `Error` no topo do `meta`; motivo completo
  em `## Comments` do `CLEAN-012`.

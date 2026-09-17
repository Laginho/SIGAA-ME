# CLEAN-012: `mergeCoursesIntoCache` aceita `CourseSnapshot`, e `deps` do `ipc-validation.test.ts` sem `any`
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/utils/ui-helpers.ts` (`IncomingNews`/`IncomingCourse`, `:64-72`;
    `isIncomingNews`, `:74`; `mergeCoursesIntoCache`, `:93-157`)
  - `tests/unit/merge-courses-cache.test.ts` (a factory `course()`, `:16-20`)
  - `tests/integration/account-isolation.test.ts` (`COURSE_A`, `:39-43`;
    `COURSE_9`, `:130`)
  - `tests/unit/ipc-validation.test.ts` (`makeDeps`, `:246-283`; `let deps:
    any`, `:285`)

Follow-up do `QA-012` (comentários, 2026-09-17). Dois itens de honestidade de
tipo em código que o `tsconfig` passou a ver. Um commit por item, o item 1
primeiro. O terceiro follow-up do `QA-012` (alargar `LogMeta` para aceitar
`Error` no topo) foi avaliado e **não** entra: ver `## Comments`.

#### What to build

**1. `IncomingCourse` descreve o que os chamadores passam.** Hoje
`mergeCoursesIntoCache(incoming: IncomingCourse[], …)` com

    interface IncomingCourse { id: string; news?: unknown[] }

Os cinco chamadores de produção passam `CourseSnapshot[]` de
`shared/domain.ts:53`: `dashboard.ts:88` (`BackgroundSyncUpdate.courses`,
tipado em `shared/ipc.ts:173`), `sync-selection.ts:280` e `:293` (`synced:
CourseSnapshot`, `coursesWithContent: CourseSnapshot[]`), `course-detail.ts:104`
e `:588` (item de `readCoursesCache()`, que devolve `CourseSnapshot[]`). Nenhum
passa `news` opcional nem `unknown`. O tipo local é mais estreito **e** mais
frouxo que a realidade, e o efeito aparece nos testes: literal fresco com `name`
bate em excess-property check, então `merge-courses-cache.test.ts` precisou de
uma factory e `account-isolation.test.ts` de um `const` intermediário.

Trocar o parâmetro para `CourseSnapshot[]` e apagar `IncomingCourse`. A leitura
do cache existente (`:98`, `JSON.parse(...) as IncomingCourse[]`) vira
`readCoursesCache()` de `src/data/account-storage.ts:108`, que já valida forma
(`DATA-005`) — o `try/catch` em volta do parse some junto. `IncomingNews` e
`isIncomingNews` ficam: o guard protege a leitura do cache antigo e do `news`
de cada item, que continua vindo de `localStorage`; se com `NewsSummary[]`
tipado o guard virar redundante para o lado `incoming`, mantê-lo só onde o dado
é do storage.

Fora do item: os `(c: any) => c.id === courseId` de `course-detail.ts:84,97` e
o `(n: any)` de `:580`. Já são `CourseSnapshot` pelo retorno de
`readCoursesCache()`; tirar o `any` ali é o mesmo tipo de corte, mas
`course-detail.ts` não está nos Primary files deste ticket.

**2. `let deps: any` em `ipc-validation.test.ts:285`.** `makeDeps` devolve
`{ ...base, ...overrides }` com `base satisfies IpcDeps`; o `satisfies` já checa
o mock contra o contrato real. O `any` na variável desliga isso nas 19 leituras
`deps.x.y` abaixo (`:308-426`), inclusive as três que chamam
`.mockImplementation`/`.mockReturnValue` (`:404`, `:412`, `:418`). Trocar por
`ReturnType<typeof makeDeps>`. Se o spread com `overrides: Record<string, any>`
alargar o tipo a ponto de perder `sigaaService.downloadFile` como `Mock`,
tipar `overrides` como `Partial<ReturnType<typeof makeBase>>` extraindo `base`
para uma função — ou o que for a menor mudança que deixe as 19 leituras
compilando sem cast. Não adicionar `as any` em nenhuma delas.

#### Acceptance criteria

1. `grep -n "IncomingCourse" src/` não devolve nada;
   `mergeCoursesIntoCache` recebe `CourseSnapshot[]`.
2. `grep -n "JSON.parse" src/utils/ui-helpers.ts` não devolve parse de
   `courses`; a leitura passa por `readCoursesCache()`.
3. `tests/unit/merge-courses-cache.test.ts` monta as turmas como literal (ou
   com uma factory que devolve `CourseSnapshot`, se o literal completo ficar
   longo demais para ler) e o comentário `:18-19` sobre excess-property check
   some. `account-isolation.test.ts` pode manter `COURSE_A` como `const` — é
   fixture reutilizada, não contorno — mas o `COURSE_9` inline em `:130` vira
   literal na chamada, se couber na linha.
4. `grep -n ": any" tests/unit/ipc-validation.test.ts` não devolve a linha do
   `deps`. As 19 leituras `deps.x.y` compilam sem cast novo.
5. Dois commits, um por item, cada um verde sozinho. `npm run quality` verde
   no final.

#### Verification

    npm run quality
    npx vitest run tests/unit/merge-courses-cache.test.ts tests/integration/account-isolation.test.ts tests/unit/ipc-validation.test.ts

## Tests stage 2 writes (own commit, red)

- Item 1: nenhum teste novo — é mudança de tipo, e `tsc` é o teste. O commit
  de teste é a edição de `merge-courses-cache.test.ts` (apagar a factory,
  montar literal) e do `COURSE_9`. Não fica vermelho no vitest; fica vermelho
  no `npm run typecheck` **antes** do commit de código, porque o literal com
  `name`/`code`/`files` excede o `IncomingCourse` atual. Registrar a saída do
  `tsc` no relatório: é a prova de que o tipo era o problema.
- Item 2: o commit de teste **é** a mudança (`let deps: any` →
  `ReturnType<typeof makeDeps>`). Se compilar de primeira, ótimo — o que o
  item prova é que o `any` nunca foi necessário. Se não compilar, o ajuste
  em `makeDeps`/`overrides` vai no mesmo commit; é arquivo de teste inteiro.

## Comments

- **`LogMeta` não entra.** O follow-up do `QA-012` propunha alargar
  `LogMeta` (`logger.service.ts:7`) para `Record<string, unknown> | Error`,
  apagando três casts de `logger-redaction.test.ts:171,180,196`. Medido em
  2026-09-17: nenhum chamador de produção passa `Error` no topo do `meta`; os
  58 pontos em `electron/` embrulham como `{ error: err }`, e `sanitizeMeta`
  trata o `Error` aninhado pela ramificação de objeto. O único código que
  atinge o `instanceof Error` no topo (`:109`) são os três testes com cast.
  Alargar o tipo descreveria uma forma que a produção não usa para apagar
  três casts honestos. Os casts ficam.
- A contagem "18 leituras `deps.x.y.mock*`" do comentário original estava
  inflada: são 3 chamadas `.mock*` e 16 `expect(deps.x.y)`. Total 19, e o
  `satisfies` já cobre a forma — por isso o item 2 é uma linha, não um ticket
  próprio.

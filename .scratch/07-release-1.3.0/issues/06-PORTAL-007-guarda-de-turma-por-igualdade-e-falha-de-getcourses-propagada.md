# PORTAL-007: Entrada na turma: guarda por igualdade e falha de `getCourses` propagada
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`isExpectedCoursePage` `:45-49`; `enterCourseAndGetHTML` `:430-445` e o `catch` do método)
  - `tests/unit/course-verification.test.ts`
  - `tests/integration/portal-course-entry.test.ts`

Itens 1 e 2 do gabarito. Achados por Sol e Fable, independentes.

#### What to build

Item 1: `isExpectedCoursePage` usa `includes`. Cabeçalho "FÍSICA II" ou
"LABORATÓRIO DE FÍSICA I" passa para "FÍSICA I". Só age quando o clique JSF já
falhou, mas é a guarda contra a atribuição cruzada de arquivos entre turmas que
já aconteceu neste projeto.

Item 2: `enterCourseAndGetHTML` chama `this.getCourses()` para relançar o
navegador e ignora o resultado; com `context` nulo, `this.context!.newPage()`
vira `TypeError`, capturado pelo `catch` do método e devolvido sem
`errorCode`. O relogin por `SESSION_EXPIRED` não acontece e o toast mostra
mensagem interna. O fluxo de notícias tem guarda própria.

#### Acceptance criteria

1. `isExpectedCoursePage` aceita só quando o nome da turma extraído do
   cabeçalho (sem código e período em volta) é igual, normalizado, ao
   `courseName`. "FÍSICA II" e "LABORATÓRIO DE FÍSICA I" são rejeitados para
   "FÍSICA I". Os casos que o teste já cobre (código e período em volta, caixa
   e pontuação, "Curso I" vs "Curso II", cabeçalho vazio) continuam passando.
2. Em `enterCourseAndGetHTML`, quando o navegador precisa relançar, o
   resultado de `getCourses()` é verificado: falha devolve
   `{ success: false, errorCode, error }` com o `errorCode` de `getCourses`,
   sem tocar em `this.context`. `SESSION_EXPIRED` chega ao chamador e o
   relogin existente dispara.
3. ❌ Nenhuma mensagem de `TypeError` sai desse método como `error`: exceção
   interna devolve `errorCode` (`UNKNOWN` ou o que o método já usa) com
   mensagem genérica. — código escrito, nenhum teste falha se ele for
   revertido (ver revisão de 2026-09-15).
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/course-verification.test.ts tests/integration/portal-course-entry.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/course-verification.test.ts`: dois casos novos, cabeçalho
  "FÍSICA II - ABC123 - 2026.1" e "LABORATÓRIO DE FÍSICA I ..." para
  `courseName: 'FÍSICA I'` → `false`. Vermelho porque `includes` aceita.
- `tests/integration/portal-course-entry.test.ts`: `getCourses` devolvendo
  `{ success: false, errorCode: 'SESSION_EXPIRED' }` com `context` nulo →
  `enterCourseAndGetHTML` devolve esse `errorCode` e nunca chama `newPage`.
  Vermelho porque hoje estoura `TypeError` e sai sem `errorCode`.

#### Revisão (2026-09-15) — reaberto

Verdict: Reaberto, critério 3 sem teste.

Critérios 1, 2 e 4 ✅. Critério 3 ❌.

O que já está certo, verificado:

- Separação de commits limpa: `eba084b` toca só testes, `b2c4f5a` toca só
  `playwright-login.service.ts` (`diff --stat` confere).
- Vermelho provado: com o fonte de `eba084b` e os testes novos, 3 falhas —
  as duas de `isExpectedCoursePage` (`includes` aceitava "FÍSICA II" e
  "LABORATÓRIO DE FÍSICA I") e a de `enterCourseAndGetHTML`, que devolvia a
  mensagem de `TypeError` sem `errorCode`.
- Gate verde no Windows: 66 arquivos, 753 passed, 5 skipped, 0 erro de lint.
- Critério 1: a extração casa com o cabeçalho real da fixture
  (`course-page-real-with-tasks.html:411`, `"TI0116 - SINAIS E SISTEMAS
  (2026.2 - T01)"`) e com o parse que produz o `courseName`
  (`playwright-login.service.ts:369`, `parts.slice(1).join(' - ')`): os dois
  lados cortam no primeiro `-`, então nome com hífen continua casando. Os 5
  casos antigos passam.
- Critério 2: o early return acontece antes de `this.context!.newPage()`; o
  `errorCode` de `getCourses` chega ao chamador.

O que falta, e é só isso:

1. **Critério 3 não tem teste.** `if (error instanceof TypeError)` em
   `playwright-login.service.ts` pode ser revertido e a suíte inteira continua
   verde — nenhum teste assere a mensagem genérica nem `errorCode: 'UNKNOWN'`.
   É a regra 5 do `CLAUDE.md` e o caso `QA-003` outra vez. O teste é barato:
   em `tests/integration/portal-course-entry.test.ts`, `getCourses` com
   `mockRejectedValue(new TypeError(...))` → `enterCourseAndGetHTML` devolve
   `errorCode: 'UNKNOWN'` e um `error` que não contém a mensagem do
   `TypeError`. Vermelho hoje se o `instanceof` sair.

Não é achado, fica registrado:

- `classifyMessage(error.message)` no `catch` duplica o que
  `failFromResult` já faz quando `errorCode` vem vazio (`shared/errors.ts:95-102`).
  Mesmo resultado para os consumidores; ganho real é o contrato do método
  passar a carregar `errorCode` sozinho. Mantido.
- Igualdade é fail-closed: se o formato do `#nomeTurma` mudar (período fora
  de parênteses, por exemplo), toda entrada em turma passa a falhar, onde o
  `includes` ainda passaria. É o comportamento pedido — a atribuição cruzada
  de arquivos é pior que um erro visível —, mas é a superfície nova de drift.

## Comments

- O formato do `#nomeTurma` está nas fixtures de `tests/fixtures/`; extraia o
  nome com o que o cabeçalho real mostra, não com um separador chutado. Se o
  cabeçalho carregar o `course.code`, comparar pelo código é aceitável em vez
  do nome; diga qual foi no PR.
- `PORTAL-008` muda o que `getCourses` devolve com zero turmas e espera este
  ticket.
- Reaberto em 2026-09-15 pela revisão acima. O trabalho continua na branch
  `portal-007`: falta só o teste do critério 3, em commit de teste próprio,
  vermelho antes.

# PORTAL-007: Entrada na turma: guarda por igualdade e falha de `getCourses` propagada
Status: open
Stage: to-review
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
3. Nenhuma mensagem de `TypeError` sai desse método como `error`: exceção
   interna devolve `errorCode` (`UNKNOWN` ou o que o método já usa) com
   mensagem genérica.
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

## Comments

- O formato do `#nomeTurma` está nas fixtures de `tests/fixtures/`; extraia o
  nome com o que o cabeçalho real mostra, não com um separador chutado. Se o
  cabeçalho carregar o `course.code`, comparar pelo código é aceitável em vez
  do nome; diga qual foi no PR.
- `PORTAL-008` muda o que `getCourses` devolve com zero turmas e espera este
  ticket.

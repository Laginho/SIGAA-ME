# PORTAL-007: Entrada na turma: guarda por igualdade e falha de `getCourses` propagada
Status: resolved
Stage: done
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

#### Revisão (2026-09-15) — segunda passada

Verdict: Needs your call: a segunda frase do critério 2 ("o relogin existente
dispara") não acontece — nenhum chamador reage a `errorCode: 'SESSION_EXPIRED'`
vindo de `enterCourseAndGetHTML`, e consertar isso é fora dos Primary files.

Critérios 1, 2 (primeira metade), 3 e 4 ✅.

Provas refeitas nesta sessão, não herdadas da revisão anterior:

- Separação de commits: `diff --stat` por commit confere. `eba084b` e `14304c0`
  tocam só testes; `b2c4f5a` toca só `playwright-login.service.ts`.
- Vermelho do critério 3: com `if (error instanceof TypeError)` trocado por
  `if (false)` no fonte final, `portal-course-entry.test.ts` dá 1 falha —
  `expected 'Cannot read properties of null (readi…' not to contain` a mesma
  string. O guard é o que segura o teste.
- Vermelho dos critérios 1 e 2: com o fonte de `eba084b` e os testes finais,
  4 falhas (2 em `course-verification.test.ts`, 2 em `portal-course-entry.test.ts`).
- Gate no Windows, fonte final: 66 arquivos, 754 passed, 5 skipped, 0 erro de
  lint (52 warnings pré-existentes).
- Rebase sobre `master` (`0ae58ce`) limpo, sem conflito.

O que sustenta o "Needs your call":

1. **Critério 2, segunda frase, não se realiza.** `getCourses` de fato devolve
   `SESSION_EXPIRED` (`playwright-login.service.ts:278` e `:310`), o early
   return propaga, e `failFromResult` preserva o código até o renderer — essa
   parte está certa e testada. Mas o único relogin no caminho de entrada em
   turma é `sigaa.service.ts:411`, que decide por texto da mensagem
   (`error?.includes('not found in portal')`), não por `errorCode`. O único
   consumidor de `SESSION_EXPIRED` que relogar é
   `background-sync.service.ts:103`, e ele lê o resultado do `getCourses()`
   dele, não o de `enterCourseAndGetHTML`. O renderer também não reage: o
   único `error.code` em `src/` é `'CANCELLED'` (`dashboard.ts:258`).
   Resultado real: o toast deixa de mostrar mensagem interna e passa a mostrar
   erro de sessão classificado — o ganho principal do ticket —, mas o relogin
   automático continua não disparando. Nenhum teste pode cobrir essa frase
   dentro deste ticket: `sigaa.service.ts` não está nos Primary files, e a
   correção exigiria teste novo. Por isso não é conserto pequeno da etapa 3 nem
   reabertura útil (a etapa 2 pararia no mesmo limite) — é ticket próprio, e a
   decisão de abri-lo é sua.

Não é achado, fica registrado:

- `withoutCode = withoutPeriod.replace(/^[^-]*-\s*/, '')` corta até o primeiro
  `-`. É seguro porque os dois lados da comparação vêm do mesmo formato
  "CÓDIGO - NOME": o `courseName` sai de `parts.slice(1).join(' - ')`
  (`playwright-login.service.ts:369`), que já cortou no primeiro `-` também.
  Cabeçalho sem código e com hífen no nome ("PRÉ-CÁLCULO") seria rejeitado,
  mas o parse em `:365` exige `parts.length >= 2`, então esse cabeçalho não
  produz turma nenhuma.
- O early return passa `relaunch.errorCode` adiante sem classificar, enquanto o
  `catch` do mesmo método classifica com `classifyMessage`. Se `getCourses`
  falhar pelo `catch` dele (`:432`, sem `errorCode`), o retorno sai com
  `errorCode: undefined` — e `failFromResult` classifica pela mensagem no
  consumidor. Mesmo resultado final; não vale mudar sem teste.
- `classifyMessage` não casa "Cannot read properties of null (reading
  'newPage')" com a regra `\b(browser|context|page)\b` ("newPage" não tem
  fronteira antes de "Page"), então o código já seria `UNKNOWN` sem o guard.
  Quem segura o critério 3 é a asserção da mensagem, não a do `errorCode`.

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
- Critério 3 fechado em 2026-09-15 (`14304c0`): teste novo em
  `tests/integration/portal-course-entry.test.ts` mocka `getCourses`
  rejeitando com `TypeError`; vermelho comprovado localmente removendo o
  guard `instanceof TypeError` (não commitado) e verde com ele de volta.
  `npm run quality`: 0 erros de lint (52 warnings pré-existentes), 754
  passed, 5 skipped. Stage: to-review.
- Revisado em 2026-09-15 (segunda passada): `Needs your call`, PR aberto,
  `Stage: to-merge`. A pendência é só a do bloco acima — o relogin automático
  por `SESSION_EXPIRED` vindo da entrada em turma precisa de ticket próprio
  sobre `sigaa.service.ts:411`, que hoje decide relogin por texto da mensagem.
- Fechado em 2026-09-16: PR #34 mergeado em `master` (`350ed62`). A pendencia do
  relogin automatico por `SESSION_EXPIRED` (`sigaa.service.ts:411` decide por
  texto) fica para ticket proprio, conforme a revisao da etapa 3.

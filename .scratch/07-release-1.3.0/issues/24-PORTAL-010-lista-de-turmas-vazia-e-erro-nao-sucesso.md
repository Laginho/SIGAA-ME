# PORTAL-010: Lista de turmas vazia é erro, não sucesso silencioso
Status: open
Stage: to-review
Priority: P2
Blocked by: nenhum
Review: human

- Primary files:
  - `electron/services/playwright-login.service.ts` (`getCourses`, o ramo de
    zero linhas, `:376-397`)
  - `tests/integration/portal-selector-resilience.test.ts` (`:174`, `:303`,
    `:352`)
  - `docs/PORTAL_COMPATIBILITY.md` (o parágrafo do registro de seletores que
    manda distinguir "valid empty course list" de "selector disappeared")

Achado da revisão do `PORTAL-008` (2026-09-15), registrado sob `## Comments` do
`DEBITO-04`. Decisão do autor em 2026-09-16, e ela **reverte deliberadamente o
critério 1 do `PORTAL-008`**.

#### What to build

O `PORTAL-008` fez `getCourses` parar de tratar "zero linhas de turma" como
drift e perguntar ao adapter qual é o estado da página. O
`validateCourseListDocument` testa o landmark autenticado (`.nome_usuario`)
**antes** de manutenção e acesso negado, então qualquer página que venha dentro
do shell autenticado — inclusive "Acesso Negado" — devolve `null`, e o
`getCourses` loga "treating as an empty list" e devolve sucesso com zero
turmas. Falha silenciosa: o app diz que está tudo bem e mostra nada.

A correção que o `PORTAL-008` não fez era inverter a ordem dos testes, e isso
exige fixture real de acesso negado, que ninguém tem — as atuais são sintéticas
(`DEBITO-04`).

**Não precisa da fixture.** A decisão do autor troca a premissa: conta
autenticada com zero turmas praticamente não existe na população real do app, e
quem não tem turma nenhuma não instala o SIGAA-ME. Nos 99%+ dos casos, lista
vazia é erro. Então a lista vazia passa a ser erro, sem depender de saber qual
página o portal serviu.

Isso resolve a falha silenciosa por cima, em vez de pela classificação: não
importa mais se era acesso negado, manutenção dentro do shell ou drift — o
usuário vê erro, e não uma tela vazia que finge sucesso.

#### Acceptance criteria

1. `getCourses`, ao terminar com zero turmas numa página que o
   `validateCourseListDocument` aceitou (`portalCheck === null`), devolve
   falha, não `{ success: true, courses: [] }`. A mensagem diz que o portal não
   devolveu turma nenhuma e que isso normalmente significa sessão ou acesso, não
   "você não tem turmas".
2. **O `errorCode` não pode ser `SELECTOR_DRIFT`.** Esse é o único código que o
   `recordStructuralFailure` aceita
   (`portal-compatibility.service.ts:48`), e usá-lo aqui religa o kill-switch
   que o `PORTAL-008` tirou desse caminho de propósito — três chamadas em
   `background-sync.service.ts` (`:110`, `:124`, `:295`). Reutilizar
   `NOT_FOUND` é a menor mudança e cabe na descrição dele; código novo no
   `AppErrorCode` só se a etapa 1 justificar por escrito.
3. Os outros três desfechos do `validateCourseListDocument`
   (`SESSION_EXPIRED`, `PORTAL_UNAVAILABLE`, `SELECTOR_DRIFT`) ficam como
   estão. Este ticket muda só o ramo que hoje devolve sucesso vazio.
4. Os testes que fixavam o comportamento antigo mudam junto, com o ID deste
   ticket no nome: `portal-selector-resilience.test.ts:174` ("returns an empty
   course list instead of drift"), `:303` ("continues to accept a valid empty
   course page") e `:352` ("classifies and accepts an empty student portal").
   O `:352` testa o `classify` do adapter, não o `getCourses` — confira se ele
   ainda descreve a verdade antes de mexer; classificar a página como portal
   autenticado continua certo, o que muda é o que o `getCourses` faz com ela.
5. `docs/PORTAL_COMPATIBILITY.md` para de mandar distinguir "valid empty course
   list" de "selector disappeared" e passa a registrar esta decisão com o
   motivo.
6. `npm run quality` verde.

#### Verification

    npx vitest run tests/integration/portal-selector-resilience.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `portal-selector-resilience.test.ts`: página autenticada por `.nome_usuario`
  com zero linhas de turma → `getCourses` devolve `{ success: false }` com
  `errorCode` não-`SELECTOR_DRIFT`. Vermelho porque hoje devolve sucesso com
  `courses: []`.
- `portal-selector-resilience.test.ts`: o mesmo caso **não** chama
  `recordStructuralFailure`. Vermelho se a implementação escolher
  `SELECTOR_DRIFT` — é o teste que segura o critério 2.

## Comments

- `Review: human` porque o diff muda o que o usuário vê num caminho de erro e
  reverte um critério de um ticket já fechado.
- O que se perde, e é aceito: um aluno realmente sem turma no período (fim de
  semestre, calouro antes da matrícula) passa a ver erro em vez de lista vazia.
  Era o caso que o critério 1 do `PORTAL-008` protegia. O autor decidiu que
  vale a troca: falha silenciosa em 99%+ dos casos é pior que mensagem de erro
  numa minoria que provavelmente nem abriria o app.
- A fixture real de acesso negado continua faltando (`DEBITO-04`). Este ticket
  não a substitui — ele tira a urgência dela, porque o caso já não passa mais
  como sucesso.

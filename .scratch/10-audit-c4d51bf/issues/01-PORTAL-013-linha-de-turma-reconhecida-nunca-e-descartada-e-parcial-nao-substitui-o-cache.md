# PORTAL-013: Linha de turma reconhecida nunca é descartada em silêncio; lista parcial não substitui o cache
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/sigaa/portal-adapter.ts` (função nova de extração da lista de turmas; o tipo da turma extraída vem junto)
  - `electron/services/playwright-login.service.ts` (`getCourses`: bloco `page.evaluate` `:333-373`, ramo de zero linhas `:375-408`, dump de dev `:321-330`, `ParsedCourse` `:25-32`)
  - `src/pages/sync-selection.ts` (`startSync`, filtro de forma `:216-234`)
  - `docs/PORTAL_COMPATIBILITY.md` (parágrafo `:200`, "valid empty course list")
  - `tests/integration/portal-selector-resilience.test.ts` (casos que mockam `page.evaluate`: `:159`, `:176`, `:192`, `:207`, `:223`, `:426`)
  - `tests/integration/portal-adapter.test.ts` (extrator contra fixture)
  - `tests/unit/sync-selection.test.ts`
  - `tests/fixtures/sigaa/ufc-sigaa-2026.09-v1/student-portal-populated.html`, fixture nova de degradação/deriva (ou HTML inline no teste) e `tests/fixtures/sigaa/README.md`

Achado 1 (Fragile) da auditoria `docs/audits/2026-09-18-c4d51bf.md`,
reproduzido pelo auditor sobre o callback real do `page.evaluate`: uma linha
`CK0001 – Course One` produziu `{ success: true, courses: [] }`; duas linhas
com só uma no separador esperado produziram sucesso com uma turma; no
renderer, a lista parcial removeu `c2` de um cache com `c1` e `c2`. Decisões
1 a 9 de `../spec.md`.

#### What to build

Hoje o extrator só empurra a linha quando `fullText.split(' - ')` dá duas
partes; linha reconhecida (input de id + link) sem o separador é descartada
sem log. A guarda seguinte olha só se os seletores existem no documento
(`courseIdInputs === 0 || virtualClassroomLinks === 0`), não se as linhas
viraram turmas: com seletores presentes e zero turmas extraídas, `getCourses`
atravessa o `PORTAL-010` e devolve `success: true`. Em `startSync`, o
`isCourseLike` só falha alto quando **todas** as entradas caem; com algumas,
é `console.warn` e o passe termina em `replaceSet: true`, apagando do cache
as turmas ausentes e as notícias offline delas.

Três mudanças, todas pequenas:

1. **Extrator vira função pura do adapter.** `getCourses` busca
   `page.content()` uma vez depois de chegar ao portal e passa o HTML ao
   adapter (cheerio, como `parseAvaForm` e `validateCourseListDocument`). O
   mesmo HTML serve para a validação de estado, a extração e o dump de dev
   (`debug_portal_page.html`, mesma gate `shouldCaptureRawArtifact`). O
   `page.evaluate` do bloco sai. `period` continua sendo a primeira linha do
   texto de `td.info center`, aparada.
2. **Toda linha candidata tem um de dois destinos.** Candidata é a `tr` que
   contém o input de id. Com link de turma virtual e texto não vazio: vira
   turma. Texto dividido no primeiro ` - `; sem separador, `code` vazio e
   `name` = texto inteiro (um `log.warn` com a contagem). Sem link ou com
   texto vazio: `getCourses` falha com `SELECTOR_DRIFT`, mensagem com "N de M
   linhas", diagnóstico gravado via `recordDiagnostic` como no ramo de drift
   atual, navegador fechado. Nunca sucesso com menos turmas que candidatas.
   Zero candidatas: ramo atual do `PORTAL-008`/`PORTAL-010`, intocado.
3. **Renderer falha em qualquer descarte.** Em `startSync`, a condição
   `courses.length === 0 && received.length > 0` vira
   `courses.length < received.length`, com a mesma mensagem de formato
   desconhecido. O `console.warn` do ramo parcial sai. Nada é mesclado; o
   cache anterior fica.

`SELECTOR_DRIFT` aqui é deliberado e não contradiz o critério 2 do
`PORTAL-010`: lá a causa de "zero linhas" é desconhecida; aqui os seletores
existem e a estrutura que os relaciona mudou, que é a definição do código.
Três ciclos de background assim armam o kill-switch e pausam a sincronização
automática com aviso no dashboard, que é o comportamento projetado para
deriva e é melhor que três ciclos escrevendo lista parcial por cima do cache.

#### Acceptance criteria

1. A extração da lista de turmas é uma função exportada do adapter que recebe
   o HTML do portal e devolve as turmas extraídas ou uma falha com
   `AppErrorCode`; `getCourses` não chama mais `page.evaluate` para isso e
   busca `page.content()` uma vez para validação, extração e dump.
2. Candidata com link e texto não vazio sem ` - ` vira turma com `code` vazio
   e `name` igual ao texto inteiro; `getCourses` devolve sucesso com todas as
   candidatas e loga um aviso com a contagem de degradadas.
3. Candidata sem link de turma virtual, ou com texto vazio: `getCourses`
   devolve `{ success: false, errorCode: 'SELECTOR_DRIFT' }`, a mensagem diz
   quantas de quantas linhas não foram interpretadas, `diagnosticsService.record`
   é chamado uma vez e o navegador é fechado.
4. Nunca `success: true` com `courses.length` menor que o número de linhas
   candidatas.
5. Zero candidatas: os quatro desfechos atuais (`NOT_FOUND`, `SELECTOR_DRIFT`,
   `SESSION_EXPIRED`, `PORTAL_UNAVAILABLE`) continuam iguais; os testes de
   `PORTAL-008`/`PORTAL-010` passam, só com o mock de `content()` no lugar do
   de `evaluate()`.
6. `startSync` com uma lista em que **alguma** entrada não passa em
   `isCourseLike` termina em `showError` com a mensagem de formato
   desconhecido; `readCoursesCache()` devolve o mesmo conteúdo de antes do
   sync; `mergeCoursesIntoCache` não roda.
7. `BackgroundSyncUpdate`, `handleBackgroundSyncUpdate` e
   `portal-compatibility.service.ts` não são tocados.
8. `student-portal-populated.html` tem texto de link no formato `CODE - NAME`
   e célula de período; passa pelo extrator e devolve todas as turmas com
   `id`, `code`, `name` e `period` preenchidos. O README das fixtures descreve
   a mudança e os cenários novos. `PORTAL_COMPATIBILITY.md` registra a regra
   de lista parcial ao lado da de lista vazia.
9. Testes vermelhos sem a correção, nos cenários dos critérios 2, 3, 6 e 8.
10. `npm run quality` verde. A asserção de contagem de chamadas a
    `page.content()` no teste de resiliência é atualizada para o fluxo novo,
    não preservada por desvio no código.

#### Verification

    npx vitest run tests/integration/portal-adapter.test.ts tests/integration/portal-selector-resilience.test.ts tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/portal-adapter.test.ts`: extrator contra a fixture
  populada realista (todas as turmas, campos preenchidos); HTML com duas
  candidatas e uma sem separador (duas turmas, `code` vazio na segunda); HTML
  com candidata sem link (falha `SELECTOR_DRIFT`). Vermelho: a função não
  existe.
- `tests/integration/portal-selector-resilience.test.ts`: os casos de
  `getCourses` entregam HTML por `page.content()` em vez de objeto por
  `page.evaluate()`; caso novo com candidata sem link → `SELECTOR_DRIFT`,
  `recordSpy` chamado uma vez, `browser.close` uma vez. Vermelho: hoje é
  sucesso com lista menor.
- `tests/unit/sync-selection.test.ts`: cache com `c1` e `c2`, `getCourses`
  devolve duas entradas com a segunda sem `name` → overlay em estado de erro,
  `readCoursesCache()` ainda com `c1` e `c2`. Vermelho: hoje `c2` some.

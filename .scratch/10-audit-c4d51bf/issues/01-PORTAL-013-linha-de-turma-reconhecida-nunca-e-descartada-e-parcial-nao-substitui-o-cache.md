# PORTAL-013: Linha de turma reconhecida nunca é descartada em silêncio; lista parcial não substitui o cache
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/sigaa/selectors.ts` (seletor novo do painel "Turmas do Semestre", `#turmas-portal`)
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
8. ❌ (revisão 2026-09-18: `period` deixou de ser a primeira linha renderizada; ver bloco Review) `student-portal-populated.html` tem texto de link no formato `CODE - NAME`
   e célula de período; passa pelo extrator e devolve todas as turmas com
   `id`, `code`, `name` e `period` preenchidos. O README das fixtures descreve
   a mudança e os cenários novos. `PORTAL_COMPATIBILITY.md` registra a regra
   de lista parcial ao lado da de lista vazia.
9. Testes vermelhos sem a correção, nos cenários dos critérios 2, 3, 6 e 8.
10. `npm run quality` verde. A asserção de contagem de chamadas a
    `page.content()` no teste de resiliência é atualizada para o fluxo novo,
    não preservada por desvio no código.
11. Candidata é a `tr` com `input[name="idTurma"]` **dentro de `#turmas-portal`**
    (seletor em `selectors.ts`). Linha com `idTurma` fora dele (painel
    `#turmas-habilitadas`, link `turmasVirtuaisHabilitadas`) é ignorada: HTML
    com 6 candidatas no painel e 1 no de habilitadas devolve 6 turmas, sucesso,
    `unparsed` 0. Documento sem `#turmas-portal` tem zero candidatas e cai no
    critério 5. O portal real tem **dois** `div#turmas-portal` (o segundo é
    "matrícula em atividade", sem linhas); a fixture populada reproduz isso.
12. `<br>` dentro de `td.info center` conta como quebra de linha: `period` é a
    primeira parte. Fixture e HTML inline escrevem a célula como o portal, numa
    linha só do fonte, `DIA HH:MM-HH:MM<br>DIA HH:MM-HH:MM<br>(datas)`.
    Vermelho hoje: devolve as partes coladas.
13. Candidata cujo `input[name="idTurma"]` não tem `value` conta como
    `unparsed` (mesmo desfecho `SELECTOR_DRIFT` do critério 3). `id` nunca sai
    `undefined` tipado como `string`.

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

## Comments

- 2026-09-18 Review ended at blocked (exit 0); branch portal-013 holds the review; left for a human
#### Review 2026-09-18 (etapa 3) — bloqueado

Verdict: Needs your call: a implementação cumpre os critérios como escritos,
mas a definição de "linha candidata" (What to build, item 2; decisão 2 do
spec) derruba `getCourses` no portal real, e `period` perdeu as quebras de
linha que o `innerText` dava. As duas correções precisam de teste novo e a
primeira precisa de arquivo fora dos Primary files — etapa 1, não conserto de
revisor. Sem PR; o branch `portal-013` guarda os dois commits e a etapa 2
continua nele.

O que está bom, e fica: commits separados (`08011f4` só testes e fixtures,
`7dd27d5` só código e docs; `diff --stat` limpo); nada fora dos Primary files;
sem `innerHTML`, sem `any` novo, sem `try/catch` que engole (o diff remove
dois `.catch(() => '')`); testes chamam `extractCourseList` e `getCourses`
reais. Vermelho sem a correção: com os três fontes de volta ao `master`,
`17 failed | 56 passed (73)` nos três arquivos do ticket. Gate verde no HEAD:
72 arquivos, `816 passed | 5 skipped (821)`, 0 erros de lint. Critérios 1 a 7,
9 e 10 atendidos como escritos; critério 5 conferido (ramo de zero linhas
igual ao `master`, só a guarda trocada por `courses.length === 0`); `saveRaw`
já gateia por `shouldCaptureRawArtifact`; `page.content()` do portal é lido
uma vez e reaproveitado na validação, na extração e no dump.

Evidência: dump real do portal gravado pelo E2E em
`.test-user-data-auth/diagnostics/1789680127738-debug_portal_page.html`
(gitignored — não copiar para o repo, `DÉBITO-04`). `extractCourseList` do
HEAD rodada sobre ele: `success: false`, `SELECTOR_DRIFT`, "1 de 7 linhas",
`selectorCounts { courseIdInputs: 7, virtualClassroomLinks: 6 }`.

❌ **A definição de candidata derruba o portal real.** A página tem duas
tabelas com `input[name="idTurma"]`: "Turmas do Semestre"
(`div#turmas-portal`), cujas linhas têm o link `a[id*="turmaVirtual"]`, e
"Turmas Virtuais Habilitadas" (`div#turmas-habilitadas`), cuja linha tem o
input mas o link é `…:turmasVirtuaisHabilitadas` — não casa com o seletor.
Para o extrator novo é candidata sem link: `unparsed = 1`, `SELECTOR_DRIFT`,
navegador fechado, diagnóstico gravado; três ciclos de background armam o
kill-switch. O código antigo pulava essa linha em silêncio — o silêncio que a
auditoria condenou estava certo por acidente aqui: a linha não é turma do
semestre. Aceitá-la como turma também estaria errado: o texto do link é
`AAAA.S - NOME - TNN`, e o `code` viraria o período. Não é critério que caiu;
é o critério 3 fazendo o que pede numa linha que o spec não conhecia.

❌ **Critério 8 — `period` não é mais a primeira linha renderizada.** A célula
real é `<td class="info"><center>DIA HH:MM-HH:MM<br>DIA HH:MM-HH:MM<br>(datas)</center>`
numa linha só do fonte. `innerText` renderiza `<br>` como quebra; `.text()` do
cheerio descarta a tag. Sem o painel de habilitadas, o extrator devolve as
seis turmas com `period` das três partes coladas, e o dashboard mostra isso
em cada card (`course.period`, `dashboard.ts:419`). A fixture e o helper do
teste de resiliência foram escritos com `\n` antes do `<br>`, então o teste
concorda com a implementação por construção — o buraco que
`tests/fixtures/README.md` descreve. (A célula é horário, não período; o nome
`period` é dívida anterior e fica fora deste ticket.)

Notas, sem bloquear:

- `$row.find(…).first().val() as string` (`portal-adapter.ts:136`): `.val()`
  é `string | string[] | undefined`; input sem `value` vira `id: undefined`
  tipado como `string` e atravessa `toCourseSummary`. Não é regressão (antes
  dava `''`), mas contradiz "vira turma ou derruba a operação".
- `page.content()` do portal perdeu o `.catch(() => '')`: falha na leitura cai
  no catch genérico de `getCourses`, sem `errorCode`. O teste que segurava
  `SELECTOR_DRIFT` nesse caso foi reescrito, como o critério 10 autorizou.
- A mensagem do renderer reporta `received.length` como "em formato
  desconhecido" mesmo quando só uma entrada caiu. É o que o ticket pediu
  ("mesma mensagem"); registrado.
- `export type { ParsedCourse }` em `playwright-login.service.ts` existe só
  para não tocar `sigaa.service.ts` (fora dos Primary files); o import direto
  é uma linha para a próxima rodada que abrir aquele arquivo.
- `row`/`link`/`portal` duplicados entre `portal-adapter.test.ts` e
  `portal-selector-resilience.test.ts`.

## Comments

- 2026-09-18, etapa 1 — **desbloqueado.** As duas propostas valem e viraram os
  critérios 11 e 12; a nota do `.val() as string` virou o 13. Confirmado no dump
  real: `#turmas-portal` ×2 (o segundo sem linhas), `#turmas-habilitadas` com a
  7ª `idTurma`, célula de horário com `<br>` numa linha só. `selectors.ts` entrou
  nos Primary files. Etapa 2 segue neste branch em cima de `7dd27d5`.

- 2026-09-18, etapa 3 — **bloqueado; pergunta para a etapa 1.** Duas
  decisões, com proposta:
  1. Escopo da candidata: `tr` com `input[name="idTurma"]` **dentro de
     `#turmas-portal`** (seletor novo em `electron/sigaa/selectors.ts`, hoje
     fora dos Primary files). Fixtures e HTML inline dos testes ganham o
     wrapper `<div id="turmas-portal">`; documento sem o wrapper tem zero
     candidatas e o ramo do `PORTAL-008`/`PORTAL-010` decide como hoje.
     Cenário novo: linha com `idTurma` fora de `#turmas-portal` (o painel de
     habilitadas) é ignorada, e o extrator devolve só as do semestre.
  2. `period`: `<br>` conta como quebra de linha (no cheerio, trocar `br` por
     `\n` dentro de `td.info center` antes do `.text()`), com a fixture escrita
     como o portal escreve — célula numa linha só do fonte, três partes
     separadas por `<br>`. Vermelho hoje: devolve as partes coladas.
  Se as duas propostas valem: acrescentar `selectors.ts` aos Primary files,
  os critérios 11 e 12, `Stage: to-implement`, e a etapa 2 segue no branch
  `portal-013`.

#### Resolution (2026-09-18)

Implementação consolidada sem ticket-flow, conforme pedido do usuário. Reaproveitados
os commits de implementação e a revisão da branch portal-013; concluídos os
critérios 11–13. Candidatas usam o tr mais próximo do input dentro de
#turmas-portal, sem duplicar ancestrais de tabelas aninhadas. Painéis de
habilitadas são ignorados. ID ausente/vazio falha; br preserva a primeira linha.
O renderer rejeita qualquer descarte antes de alterar o cache.

Prova de regressão desta sessão: 7 failed | 17 passed (24) no adapter antes
dos ajustes, incluindo painel externo, tabela aninhada, br e ids inválidos.
Após a correção, os quatro arquivos focados deram 82 passed (82).
Gate final: npm run quality, 825 passed | 5 skipped (830), 73 arquivos;
typecheck limpo, lint com 0 erros e os mesmos 40 warnings. Electron visual:
11 passed (17.9s), sem credenciais. Sem alteração em background-sync ou no
serviço de compatibilidade. Commit dos ajustes: be9ccfa.

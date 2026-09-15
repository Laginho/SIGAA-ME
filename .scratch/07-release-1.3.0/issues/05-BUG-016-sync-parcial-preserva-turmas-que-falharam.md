# BUG-016: Sync parcial em background preserva as turmas que falharam
Status: resolved
Stage: blocked
Priority: P0
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/background-sync.service.ts` (montagem e publicação do resultado, `:275-281`, `:305-317`)
  - `shared/ipc.ts` (`BackgroundSyncUpdate`, `:173-184`)
  - `src/pages/dashboard.ts` (`handleBackgroundSyncUpdate` `:80`; listener de `click` em `document` `:206-212`)
  - `src/utils/ui-helpers.ts` (`mergeCoursesIntoCache`, só se precisar de opção nova)
  - `tests/unit/dashboard-listener.test.ts`
  - `tests/unit/merge-courses-cache.test.ts`
  - `tests/integration/background-sync.test.ts`

Itens 8 e 21 do gabarito. Bloqueador de release (item 8).

#### What to build

O background publica só `allCoursesData`, preenchido apenas para turmas que
deram certo. O dashboard mescla com `replaceSet: true` e
`ui-helpers.ts:144` faz `merged = [...incoming]`: uma turma com
`SELECTOR_DRIFT` ou timeout num ciclo perde arquivos e notícias em cache.
`sync-selection.ts:281-293` faz o oposto de propósito (falha bloqueia o
`replaceSet`). O background precisa do mesmo contrato: só um ciclo completo
pode apagar turma do cache.

Item 21, mesmo arquivo: o listener de `click` em `document` é adicionado a
cada render do dashboard e nunca removido; cada render vaza uma closure sobre
o `dropdown` antigo.

#### Acceptance criteria

1. `BackgroundSyncUpdate` diz se o ciclo cobriu todas as turmas (um booleano
   ou a lista das que falharam). O main marca incompleto quando qualquer
   turma falhou, deu timeout ou foi cancelada.
2. Ciclo incompleto: o dashboard mescla sem `replaceSet`; a turma que falhou
   mantém arquivos, notícias e conteúdo de notícia já baixado; as que deram
   certo são atualizadas.
3. Ciclo completo: comportamento atual, `replaceSet: true`, turma que saiu da
   matrícula some do cache.
4. O listener de fechar o dropdown ao clicar fora é registrado uma vez por
   montagem do dashboard e removido quando a página é renderizada de novo:
   depois de N renders há exatamente um listener ativo.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/dashboard-listener.test.ts tests/unit/merge-courses-cache.test.ts tests/integration/background-sync.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/background-sync.test.ts`: com uma turma falhando, o
  payload publicado marca o ciclo como incompleto; com todas ok, completo.
  Vermelho porque o campo não existe.
- `tests/unit/dashboard-listener.test.ts`: (a) payload incompleto sem a
  turma B preserva a turma B no cache com seus arquivos; (b) payload completo
  sem a turma B remove a turma B; (c) renderizar o dashboard três vezes deixa
  um só listener de `click` em `document` (espião em
  `document.addEventListener`/`removeEventListener`, ou comportamento: um
  clique fora fecha o dropdown uma vez). Vermelho em (a) e (c).

#### Resolution (2026-09-15)

Verdict: Approve

Decisão: um contador `anyCourseFailed` no laço de disciplinas carimba
`incomplete: true` no payload, e o dashboard passa `replaceSet: !data.incomplete`
ao `mergeCoursesIntoCache`. Nada de `failures`+`showError`, como o comentário
pedia. O campo é omitido quando o ciclo fecha completo — por isso o
`...(anyCourseFailed ? { incomplete: true } : {})`, que mantém verde a asserção
de chaves exatas do payload em `background-sync.test.ts:167`.

Cobertura de `incomplete` conferida subindo a cadeia, não pela prosa do ticket:
no laço, toda disciplina ou entra em `allCoursesData` ou marca
`anyCourseFailed` (`:277` vs `:286`) — timeout e drift chegam como
`contentResult.error`. Os três caminhos de cancelamento (`:171`, `:257`, `:291`)
dão `return` antes de publicar, então nenhum payload pode mentir "completo" por
cancelamento. `preload.ts:58` repassa o payload inteiro, sem allowlist de
campos: o campo novo chega mesmo ao renderer.

Arquivos: `electron/services/background-sync.service.ts` (+5/-1),
`shared/ipc.ts` (+8), `src/pages/dashboard.ts` (+18/-3),
`tests/unit/dashboard-listener.test.ts` (+84/-2),
`tests/integration/background-sync.test.ts` (+5). Nada fora dos Primary files;
`ui-helpers.ts` e `merge-courses-cache.test.ts` não precisaram mudar — o
`replaceSet: false` que já existia bastou.

Vermelho, no commit só de testes (4efa24c, com o código ainda antigo):

    npx vitest run tests/unit/dashboard-listener.test.ts tests/integration/background-sync.test.ts
    Test Files  2 failed (2)
         Tests  3 failed | 14 passed (17)
    - payload.incomplete → expected undefined to be true
    - turma B some do cache no ciclo incompleto
    - listener de click: expected 3 to be 1

Verde, gate completo em b0ebaa7..360d2ef:

    npm run quality
    eslint: 0 errors, 52 warnings (no-explicit-any, pré-existentes)
    Test Files  66 passed (66)
         Tests  750 passed | 5 skipped (755)

Critérios 1 a 5: ✓.

Observação, fora dos critérios e sem teste: `logoutBtn` e `clearDataBtn`
(`dashboard.ts:246`, `:265`) derrubam `unsubscribeSync` e
`unsubscribeCompatibility`, mas não removem o `dropdownOutsideClickHandler`.
Sobra um listener em `document` depois do logout; ele fecha sobre um dropdown
já destacado, então não faz nada, e o próximo render do dashboard o substitui.
Não reabre o ticket — o critério 4 fala de render, não de desmontagem.

## Comments

- Não reaproveite o `failures`+`showError` do `sync-selection`; aqui não há UI
  de progresso, só a decisão de `replaceSet`.

- 2026-09-15 Review ended at to-review (exit 0); branch bug-016 holds the review; left for a human
